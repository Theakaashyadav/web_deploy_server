import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository=fileURLToPath(new URL('../../',import.meta.url));
export async function verifyAgencyLanding({dashboardUrl,publicPaths=['/website-development-greater-noida/','/blog/website-development-cost-greater-noida/']}){
  const origin=new URL(dashboardUrl).origin;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'Browser QA uses a local preview only.');
  const directory=path.join(repository,'tests/artifacts');await fs.mkdir(directory,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const tagManagerUrl='https://www.googletagmanager.com/gtm.js?id=GTM-P7S6T33L';
  // Keep synthetic form details and browser QA out of the owner's live analytics.
  await context.route(tagManagerUrl,route=>route.fulfill({status:200,contentType:'application/javascript',body:'/* Google Tag Manager stubbed during local browser QA. */'}));
  const page=await context.newPage();page.setDefaultNavigationTimeout(60000);
  const errors=[],failedAssets=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>requests.push(request.url()));
  page.on('response',response=>{if(response.status()>=400&&/\.(?:js|css|png|svg)(?:\?|$)/.test(response.url()))failedAssets.push(response.url());});
  await page.addInitScript(()=>{
    window.__websynkVitals={lcp:null,cls:0,events:[],longTasks:0};
    for(const type of ['largest-contentful-paint','layout-shift','event','longtask']){
      if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
      try{new PerformanceObserver(list=>{for(const entry of list.getEntries()){
        if(type==='largest-contentful-paint')window.__websynkVitals.lcp=entry.startTime;
        if(type==='layout-shift'&&!entry.hadRecentInput)window.__websynkVitals.cls+=entry.value;
        if(type==='event'&&entry.interactionId)window.__websynkVitals.events.push({name:entry.name,duration:entry.duration});
        if(type==='longtask')window.__websynkVitals.longTasks++;
      }}).observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})});}catch{}
    }
  });
  const result={widths:[],pageErrors:errors,failedAssets,form:{},javascriptDisabled:false,lab:{conditions:'Local production Next server; installed headless Chrome; no network/CPU throttling; browser diagnostics, not Lighthouse or field Core Web Vitals.'}};
  async function verifyContactActions(){
    const dock=page.locator('[data-contact-actions]');
    assert.equal(await dock.count(),1,'One persistent contact dock.');
    assert.equal(await dock.evaluate(element=>getComputedStyle(element).position),'fixed');
    const call=dock.locator('a[href="tel:+919115082252"]');
    const whatsapp=dock.locator('a[href^="https://wa.me/919115082252"]');
    assert.match(await call.innerText(),/call now/i);assert.match(await whatsapp.innerText(),/whatsapp/i);
    for(const link of [call,whatsapp]){
      assert.equal(await link.evaluate(element=>{
        const box=element.getBoundingClientRect();
        return box.height>=48&&box.width>=48&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight+1&&document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('a')===element;
      }),true,'Both contact actions stay visible, large enough to tap and in front of page content.');
    }
  }
  try{
    assert.equal((await page.goto(origin,{waitUntil:'networkidle'})).status(),200);
    await page.getByRole('button',{name:'Prepare my free consultation'}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('button[type=submit]')?.disabled);
    assert.equal(await page.locator('script[src="'+tagManagerUrl+'"]').count(),1,'One owner-provided GTM loader per page.');
    assert.equal(requests.filter(url=>url===tagManagerUrl).length,1,'GTM loads once on the initial document.');
    assert.equal(await page.evaluate(()=>typeof window.gtag),'function');
    assert.equal(await page.evaluate(()=>window.dataLayer.filter(entry=>entry[0]==='js'&&entry[1] instanceof Date).length),1,'Initial data-layer command is queued once.');
    result.tagManager={container:'GTM-P7S6T33L',loaderCount:1,initializationCount:1,externalScriptStubbed:true};
    const body=await page.locator('body').innerText();assert.match(body,/2021/);assert.match(body,/2,000\+/);assert.match(body,/603, Advant Navis Business Park/);assert.match(body,/Greater Noida/);assert.doesNotMatch(body,/DeployHub|Admin login|Admin access/);
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('a[href^="tel:+919115082252"]').count()>0,true);
    for(const href of await page.locator('a[href^="https://wa.me/"]').evaluateAll(links=>links.map(link=>link.href)))assert.equal(new URL(href).pathname,'/919115082252');
    const maps=page.getByRole('link',{name:'Get directions'});assert.ok(await maps.count());assert.match(new URL(await maps.first().getAttribute('href')).searchParams.get('query'),/603, Advant Navis/);
    const faq=page.locator('main details');assert.equal(await faq.count(),10);await faq.first().locator('summary').click();assert.ok(await faq.first().getAttribute('open')!==null);assert.ok((await faq.first().locator('p').innerText()).length>60);
    result.contactActions={widths:[],scrollPositions:['top','middle','bottom'],reducedMotion:true};
    for(const width of [320,375,390,768,1024,1440,1920]){
      await page.setViewportSize({width,height:width<600?844:1000});await page.evaluate(()=>scrollTo(0,0));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`horizontal overflow at${width}`);
      assert.equal(await page.locator('h1').evaluate(element=>element.scrollWidth>element.clientWidth+1),false,`H1 clipping at${width}`);
      for(const fraction of [0,.5,1]){
        await page.evaluate(value=>scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*value,behavior:'instant'}),fraction);
        await verifyContactActions();
      }
      const dockTop=await page.locator('[data-contact-actions]').evaluate(element=>element.getBoundingClientRect().top);
      assert.ok(await page.locator('footer a[href="/terms-and-conditions/"]').evaluate((element,top)=>element.getBoundingClientRect().bottom<top,dockTop),'Footer links are reachable above the contact dock.');
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({path:path.join(directory,`seo-home-${width}.png`),fullPage:true});
      result.widths.push({width,horizontalOverflow:false,h1Clipping:false,screenshot:`tests/artifacts/seo-home-${width}.png`});
      result.contactActions.widths.push(width);
      if(width===390||width===1440)await page.screenshot({path:path.join(directory,`contact-actions-${width}.png`)});
    }
    for(const viewport of [{width:320,height:568},{width:844,height:390}]){
      await page.setViewportSize(viewport);await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight/2,behavior:'instant'}));await verifyContactActions();
    }
    const dock=page.locator('[data-contact-actions]');
    assert.equal(await dock.evaluate(element=>element.getAnimations({subtree:true}).length),0,'Reduced motion disables contact attention animations.');
    await page.emulateMedia({reducedMotion:'no-preference'});
    assert.ok(await dock.evaluate(element=>element.getAnimations({subtree:true}).length)>0,'Contact actions animate when motion is allowed.');
    await page.emulateMedia({reducedMotion:'reduce'});
    result.contactActions.shortScreens=true;result.contactActions.animationVerified=true;
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    result.lab.desktop=await page.evaluate(()=>({...window.__websynkVitals,navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),resources:performance.getEntriesByType('resource').map(entry=>({name:entry.name,transferSize:entry.transferSize,decodedBodySize:entry.decodedBodySize}))}));
    await page.setViewportSize({width:390,height:844});await page.goto(origin,{waitUntil:'networkidle'});
    result.lab.mobile=await page.evaluate(()=>({...window.__websynkVitals,navigation:performance.getEntriesByType('navigation')[0]?.toJSON()}));
    const summary=page.locator('header details > summary');await summary.click();assert.notEqual(await page.locator('header details').getAttribute('open'),null);
    await verifyContactActions();
    await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Services',exact:true}).click();assert.equal(new URL(page.url()).hash,'#services');assert.equal(await page.locator('header details').getAttribute('open'),null);
    await summary.click();await page.keyboard.press('Escape');assert.equal(await page.locator('header details').getAttribute('open'),null);
    await page.getByLabel('Your name',{exact:true}).fill('QA Visitor');await page.getByLabel('Phone number',{exact:true}).fill('abc');await page.getByLabel('What would you like to discuss?').selectOption({label:'Website development'});await page.getByLabel('A little about your project').fill('We need a business website with a clear contact journey.');await page.locator('input[name=consent]').check();
    await page.getByRole('button',{name:'Prepare my free consultation'}).click();await page.locator('form [role=alert]').waitFor();assert.match(await page.locator('form [role=alert]').innerText(),/valid contact number/);
    await page.getByLabel('Phone number',{exact:true}).fill('+91 99999 12345');
    await page.getByRole('button',{name:'Prepare my free consultation'}).click();const draft=page.getByRole('link',{name:'Open WhatsApp draft'});await draft.waitFor();
    const draftUrl=new URL(await draft.getAttribute('href'));assert.equal(draftUrl.pathname,'/919115082252');assert.match(draftUrl.searchParams.get('text'),/QA Visitor/);assert.match(await page.getByRole('status').innerText(),/Review and send/);assert.doesNotMatch(await page.getByRole('status').innerText(),/successfully submitted|message sent/i);
    await page.getByLabel('A little about your project').fill('Updated project details should clear the old draft.');assert.equal(await draft.count(),0);
    await page.locator('input[name=website]').evaluate(element=>{element.value='spam.example';});await page.getByRole('button',{name:'Prepare my free consultation'}).click();assert.match(await page.locator('form [role=alert]').innerText(),/could not prepare/);assert.equal(await draft.count(),0);
    result.form={invalidPhoneRejected:true,draftPrepared:true,externalMessageSent:false,staleDraftCleared:true,honeypotRejected:true,privacyConsentRequired:true};
    await page.goto(origin+'/contact-us/',{waitUntil:'networkidle'});assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('form').count(),1);assert.equal(await page.locator('a[href="tel:+919115082252"]').count()>0,true);
    result.publicPageResponsive=[];
    for(const pathname of publicPaths.filter(value=>value!=='/')){
      await page.goto(origin+pathname,{waitUntil:'domcontentloaded'});
      for(const width of [320,375,390,768,1024,1440,1920]){
        await page.setViewportSize({width,height:width<600?844:1000});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${pathname} overflow at${width}`);
        assert.equal(await page.locator('h1').evaluate(element=>element.scrollWidth>element.clientWidth+1),false,`${pathname} H1 clipping at${width}`);
      }
      result.publicPageResponsive.push({path:pathname,widths:[320,375,390,768,1024,1440,1920],horizontalOverflow:false,h1Clipping:false});
    }
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const staticPage=await nojs.newPage();await staticPage.goto(origin,{waitUntil:'domcontentloaded'});assert.equal(await staticPage.locator('h1').count(),1);assert.match(await staticPage.locator('#services').innerText(),/Website development/);assert.ok(await staticPage.locator('main details p').count()>=10);await staticPage.locator('header summary').click();assert.notEqual(await staticPage.locator('header details').getAttribute('open'),null);await nojs.close();result.javascriptDisabled=true;
    assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);assert.equal(requests.some(url=>new URL(url).hostname!=='127.0.0.1'&&new URL(url).hostname!=='localhost'&&url!==tagManagerUrl),false,'Only the owner-provided GTM loader is requested externally; it is stubbed during QA.');
    await fs.writeFile(path.join(repository,'docs/seo-browser-results.json'),JSON.stringify(result,null,2)+'\n');return result;
  }catch(error){await page.screenshot({path:path.join(directory,'seo-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{await browser.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyAgencyLanding({dashboardUrl:process.env.E2E_ORIGIN||'http://localhost:3100'}),null,2));
