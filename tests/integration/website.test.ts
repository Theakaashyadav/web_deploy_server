import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startBuiltSite, requestHost, repository } from '../helpers/site-server.mjs';
import { verifyAgencyLanding } from '../e2e/landing-browser.mjs';
import { publicPages, blogArticles } from '../../apps/dashboard/lib/seo-content.ts';

const canonical='https://websynk.in';
test('standalone Websynk: production HTML, crawlability, routing, business data and responsive conversion journey',{timeout:240000},async t=>{
  const site=await startBuiltSite();t.after(site.stop);
  const pagePaths=['/',...publicPages.map(page=>`/${page.slug}/`),...blogArticles.map(article=>`/blog/${article.slug}/`)];
  const results:any={environment:'local production build',date:'2026-11-27',paths:[],externalValidators:'Not certified by local tests'};
  const htmlByPath=new Map<string,string>(),titles=new Set<string>(),descriptions=new Set<string>();
  await t.test('every public page serves complete indexable HTML and distinct metadata',async()=>{
    for(const pathname of pagePaths){
      const response=await fetch(site.origin+pathname,{redirect:'manual'});assert.equal(response.status,200,pathname);
      const html=await response.text();htmlByPath.set(pathname,html);
      const title=html.match(/<title>([\s\S]*?)<\/title>/)?.[1];assert.ok(title,pathname+'title');assert.ok(!titles.has(title),pathname+'duplicate title');titles.add(title);
      const description=html.match(/<meta name="description" content="([^"]+)"/i)?.[1];assert.ok(description,pathname+'description');assert.ok(!descriptions.has(description),pathname+'duplicate description');descriptions.add(description);
      assert.equal((html.match(/<h1\b/g)||[]).length,1,pathname+'exactly one H1');
      assert.ok(html.includes(`rel="canonical" href="${canonical+pathname}"`),pathname+'canonical');
      assert.match(html,/<html lang="en-IN"/);assert.match(html,/<meta name="viewport"/);
      assert.doesNotMatch(html,/<meta name="robots" content="[^"]*noindex/i,pathname+'no accidental noindex');
      assert.match(html,/property="og:image" content="https:\/\/websynk.in\/opengraph-image.png"/);
      assert.match(html,/name="twitter:card" content="summary_large_image"/);
      const head=html.match(/<head>([\s\S]*?)<\/head>/)?.[1]||'';
      const trackingScripts=[...head.matchAll(/<script\b[^>]*\bsrc="https:\/\/www\.googletagmanager\.com\/([^\"]+)"[^>]*>/g)];
      assert.equal(trackingScripts.length,1,pathname+' one GTM installation');
      assert.equal(trackingScripts[0][1],'gtm.js?id=GTM-P7S6T33L');
      assert.match(trackingScripts[0][0],/\basync(?:="")?/);
      assert.equal((head.match(/id="google-tag-manager-init"/g)||[]).length,1,pathname+' one data-layer initialization');
      assert.match(head,/window\.dataLayer = window\.dataLayer \|\| \[\]/);
      const schemas=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));assert.ok(schemas.length>=2,pathname+'server schema');
      const serialized=JSON.stringify(schemas);assert.match(serialized,/#business/);assert.match(serialized,/#website/);assert.doesNotMatch(serialized,/aggregateRating|reviewRating|openingHours/);
      assert.match(html,/603, Advant Navis Business Park/);assert.match(html,/tel:\+919115082252/);
      assert.doesNotMatch(html,/Admin login|DeployHub admin|\/api\/v1\/auth/);
      results.paths.push({path:pathname,status:response.status,title,description,canonical:canonical+pathname,h1:1,structuredDataBlocks:schemas.length});
    }
    const home=htmlByPath.get('/')!;assert.match(home,/Website Development[\s\S]{0,150}Digital Marketing[\s\S]{0,150}Greater Noida/);
    assert.ok((home.match(/<details/g)||[]).length>=10);assert.match(home,/2,000\+/);assert.match(home,/2021/);
  });
  await t.test('sitemap contains only successful canonical pages; robots protects indexing boundaries',async()=>{
    const response=await fetch(site.origin+'/sitemap.xml');assert.equal(response.status,200);const xml=await response.text();
    assert.deepEqual([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]).sort(),pagePaths.map(path=>canonical+path).sort());
    assert.doesNotMatch(xml,/admin|login|api\/|staging/);
    const robots=await fetch(site.origin+'/robots.txt');assert.equal(robots.status,200);const text=await robots.text();assert.match(text,/Allow: \//);assert.match(text,/Disallow: \/admin/);assert.match(text,/Sitemap: https:\/\/websynk.in\/sitemap.xml/);
    results.sitemap={count:pagePaths.length,canonicalOnly:true};results.robots={status:200,publicIndexing:true};
  });
  await t.test('all internal destinations work; removed platform endpoints and unknown paths return404',async()=>{
    const checked=new Set(pagePaths);
    for(const [pathname,html]of htmlByPath)for(const match of html.matchAll(/\bhref="([^"<>]+)"/g)){
      const href=match[1].replaceAll('&amp;','&');if(!href.startsWith('/')&&!href.startsWith('#'))continue;
      const destination=new URL(href,site.origin+pathname);if(destination.origin!==site.origin)continue;
      if(destination.hash&&htmlByPath.has(destination.pathname))assert.ok(htmlByPath.get(destination.pathname)!.includes(`id="${decodeURIComponent(destination.hash.slice(1))}"`),pathname+'missing anchor'+href);
      if(checked.has(destination.pathname))continue;checked.add(destination.pathname);
      const response=await fetch(destination,{redirect:'manual'});assert.equal(response.status,200,pathname+'brokenlink'+href);await response.body?.cancel();
    }
    for(const pathname of ['/admin/','/login/','/api/v1/auth/setup/','/a-page-that-does-not-exist/','/blog/not-a-real-article/']){const response=await fetch(site.origin+pathname,{redirect:'manual'});assert.equal(response.status,404,pathname);await response.body?.cancel();}
    const slash=await fetch(site.origin+'/about-us',{redirect:'manual'});assert.equal(slash.status,308);assert.ok(slash.headers.get('location')?.endsWith('/about-us/'));
    const www:any=await requestHost(site.origin,'www.websynk.in','/about-us/');assert.equal(www.status,308);assert.equal(www.headers.location,'https://websynk.in/about-us/');
    const wwwRoot:any=await requestHost(site.origin,'www.websynk.in','/');assert.equal(wwwRoot.headers.location,'https://websynk.in/');
    const wwwAsset:any=await requestHost(site.origin,'www.websynk.in','/logo.svg');assert.equal(wwwAsset.headers.location,'https://websynk.in/logo.svg');
    for(const asset of ['/logo.svg','/opengraph-image.png','/apple-icon.png','/icon.svg']){const response=await fetch(site.origin+asset);assert.equal(response.status,200,asset);assert.match(response.headers.get('content-type')||'',/^image\//);assert.ok((await response.arrayBuffer()).byteLength>100);}
    results.routes={internalLinks:'pass',removedPlatformStatus:404,wwwRedirect:308,trailingSlashRedirect:308};
  });
  await t.test('browser tests cover all requested widths, no-JavaScript content, real validation and honest WhatsApp draft',async()=>{
    results.browser=await verifyAgencyLanding({dashboardUrl:site.origin,publicPaths:pagePaths});
  });
  await fs.mkdir(path.join(repository,'docs'),{recursive:true});await fs.writeFile(path.join(repository,'docs/seo-validation-results.json'),JSON.stringify(results,null,2)+'\n');
});
