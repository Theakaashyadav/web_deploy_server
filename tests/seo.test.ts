import test from 'node:test';
import assert from 'node:assert/strict';
import type { MetadataRoute } from 'next';
import {
  businessSchema, canonicalPath, homepageDescription, homepageTitle,
  pageMetadata, publicBusinessDetails, serializeSchema, siteUrl, websiteSchema,
} from '../apps/dashboard/lib/seo.js';
import { agencyAddress, agencyMapsUrl, agencyName, agencyPhoneDisplay, establishedYear } from '../apps/dashboard/lib/agency.js';
import sitemapModule from '../apps/dashboard/app/sitemap.js';
import robotsModule from '../apps/dashboard/app/robots.js';

// tsx exposes default exports from the Next workspace through its CJS boundary.
function metadataRoute<T>(value: unknown): () => T {
  const candidate = typeof value === 'function' ? value : (value as { default?: unknown })?.default;
  assert.equal(typeof candidate, 'function', 'Metadata route must export a handler.');
  return candidate as () => T;
}
const sitemap = metadataRoute<MetadataRoute.Sitemap>(sitemapModule);
const robots = metadataRoute<MetadataRoute.Robots>(robotsModule);

function withIndexing<T>(enabled: boolean, operation: () => T): T {
  const previous = process.env.WEBSYNK_NOINDEX;
  process.env.WEBSYNK_NOINDEX = enabled ? 'false' : 'true';
  try { return operation(); }
  finally {
    if (previous === undefined) delete process.env.WEBSYNK_NOINDEX;
    else process.env.WEBSYNK_NOINDEX = previous;
  }
}

test('canonical paths normalize local public paths and reject URL or traversal ambiguity', () => {
  assert.equal(canonicalPath('/'), '/');
  assert.equal(canonicalPath('/about-us'), '/about-us/');
  assert.equal(canonicalPath('/blog/useful-guide/'), '/blog/useful-guide/');
  for (const unsafe of [
    'https://example.com/', '//example.com/', 'about-us', '/about-us?draft=1', '/about-us#team',
    '/service\\..\\admin', '/service/../admin', '/./about-us', '/%2e%2e/admin',
    '/service/%2E%2E/admin', '/service//admin', '/about-us\n', '/about-us\0',
  ]) assert.throws(() => canonicalPath(unsafe), undefined, `Ambiguous canonical accepted: ${JSON.stringify(unsafe)}`);
});

test('page metadata ties the canonical, social URL and accessible preview to one public page', () => withIndexing(true, () => {
  const homepage = pageMetadata({ title: homepageTitle, description: homepageDescription, path: '/' });
  assert.equal(homepage.alternates?.canonical, siteUrl + '/');
  assert.deepEqual(homepage.title, { absolute: homepageTitle });
  assert.equal(homepage.description, homepageDescription);
  assert.equal(typeof homepage.robots, 'object');
  const policy = homepage.robots as { index?: boolean; follow?: boolean; googleBot?: { index?: boolean } };
  assert.equal(policy.index, true); assert.equal(policy.follow, true); assert.equal(policy.googleBot?.index, true);
  const graph = homepage.openGraph as { url?: string; images?: { url: string; width: number; height: number; alt: string }[] };
  assert.equal(graph.url, homepage.alternates?.canonical);
  assert.ok(graph.images?.length);
  for (const image of graph.images!) {
    assert.equal(new URL(image.url).origin, new URL(siteUrl).origin);
    assert.ok(image.width > 0 && image.height > 0 && image.alt.trim());
  }
  assert.equal((homepage.twitter as { card?: string }).card, 'summary_large_image');
  const other = pageMetadata({ title: 'A distinct service | Websynk', description: 'Useful information about a different service.', path: '/a-distinct-service' });
  assert.notDeepEqual(other.title, homepage.title);
  assert.notEqual(other.description, homepage.description);
  assert.equal(other.alternates?.canonical, siteUrl + '/a-distinct-service/');
}));

test('the explicit staging switch blocks indexing in metadata and robots without changing production canonicals', () => withIndexing(false, () => {
  const metadata = pageMetadata({ title: homepageTitle, description: homepageDescription, path: '/' });
  const policy = metadata.robots as { index?: boolean; follow?: boolean; googleBot?: { index?: boolean; follow?: boolean } };
  assert.equal(policy.index, false); assert.equal(policy.follow, false);
  assert.equal(policy.googleBot?.index, false); assert.equal(policy.googleBot?.follow, false);
  assert.equal(metadata.alternates?.canonical, siteUrl + '/');
  assert.deepEqual(sitemap(), [], 'A noindex preview must not advertise indexable URLs in its sitemap.');
  const rules = robots().rules;
  assert.ok(!Array.isArray(rules));
  assert.equal((rules as { disallow?: string }).disallow, '/');
  assert.deepEqual(sitemap(), [], 'A staging sitemap must not advertise non-indexable pages.');
}));

test('business data distinguishes the physical Noida office from service areas and avoids invented proof', () => {
  assert.equal(businessSchema.name, agencyName);
  assert.equal(businessSchema.address.addressLocality, 'Noida');
  assert.equal(businessSchema.address.addressRegion, 'Uttar Pradesh');
  assert.equal(businessSchema.address.addressCountry, 'IN');
  assert.match(businessSchema.address.streetAddress, /603,.*Advant Navis Business Park.*Sector 142/);
  assert.equal(businessSchema.telephone, '+919115082252');
  assert.equal(businessSchema.contactPoint.telephone, businessSchema.telephone);
  assert.equal(businessSchema.foundingDate, String(establishedYear));
  assert.equal(businessSchema.hasMap, agencyMapsUrl);
  assert.equal(publicBusinessDetails.name, agencyName);
  assert.equal(publicBusinessDetails.address, agencyAddress);
  assert.equal(publicBusinessDetails.phone, agencyPhoneDisplay);
  assert.ok(businessSchema.areaServed.some(area => area.name === 'Greater Noida'));
  assert.ok(businessSchema.areaServed.some(area => area.name === 'Noida'));
  const entity = businessSchema as unknown as Record<string, unknown>;
  for (const unsupported of ['aggregateRating', 'review', 'geo', 'openingHours', 'openingHoursSpecification', 'sameAs', 'award']) {
    assert.equal(Object.hasOwn(entity, unsupported), false, `Unverified property present: ${unsupported}`);
  }
  const businessId = new URL(businessSchema['@id']);
  assert.equal(businessId.origin, new URL(siteUrl).origin);
  assert.ok(businessId.hash);
  assert.equal(websiteSchema.publisher['@id'], businessSchema['@id']);
  assert.notEqual(websiteSchema['@id'], businessSchema['@id']);
  assert.equal(new URL(websiteSchema['@id']).origin, businessId.origin);
  assert.equal(websiteSchema.url, siteUrl + '/');
  for (const asset of [businessSchema.logo.url, businessSchema.image]) assert.equal(new URL(asset).origin, businessId.origin);
});

test('JSON-LD serialization cannot terminate its script and preserves the original data', () => {
  const data = { '@context': 'https://schema.org', name: '</script><script>alert("test")</script>', note: '<!-- < & >', nested: ['<unsafe>', 2021] };
  const serialized = serializeSchema(data);
  assert.equal(serialized.includes('<'), false);
  assert.doesNotMatch(serialized, /<\/script/i);
  assert.deepEqual(JSON.parse(serialized), data);
});

test('the production sitemap contains only canonical public pages and excludes retired or private routes', () => withIndexing(true, () => {
  const entries = sitemap();
  const urls = entries.map(entry => entry.url);
  assert.equal(new Set(urls).size, urls.length);
  const intended = ['/'];
  assert.deepEqual(new Set(urls), new Set(intended.map(path => siteUrl + path)));
  for (const entry of entries) {
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.origin, new URL(siteUrl).origin);
    assert.equal(url.search, ''); assert.equal(url.hash, '');
    assert.equal(url.pathname, canonicalPath(url.pathname));
    assert.doesNotMatch(url.pathname, /^\/(?:admin|login|api|staging|test)(?:\/|$)/);
  }
  const rules = robots().rules as { allow?: string; disallow?: string[] };
  assert.equal(rules.allow, '/');
  for (const privatePath of ['/admin', '/login', '/api']) assert.ok(rules.disallow?.includes(privatePath));
  assert.equal(robots().sitemap, siteUrl + '/sitemap.xml');
}));
