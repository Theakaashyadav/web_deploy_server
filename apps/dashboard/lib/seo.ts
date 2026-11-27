import type { Metadata } from 'next';
import { agencyName, agencyAddress, agencyPhoneDisplay, agencyMapsUrl, agencyUrl, establishedYear } from './agency';

export const siteUrl = agencyUrl;
export const homepageTitle = 'Web Development & Digital Marketing in Greater Noida | Websynk';
export const homepageDescription = 'Looking for the best website development and digital marketing agency in Greater Noida? Websynk offers web design, SEO, Meta Ads and digital growth solutions.';
export const serviceAreas = ['Greater Noida', 'Greater Noida West', 'Noida Extension', 'Noida', 'Knowledge Park', 'Pari Chowk', 'Techzone IV', 'Gaur City', 'Alpha and Beta sectors', 'Surajpur', 'Noida Expressway', 'Delhi NCR'];
export const indexingAllowed = () => process.env.WEBSYNK_NOINDEX !== 'true';
export function canonicalPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || /[?#\\\x00-\x20\x7f]/.test(value)) throw new Error('Canonical paths must be local paths without queries.');
  let decoded:string;
  try {decoded=decodeURIComponent(value);} catch {throw new Error('Canonical paths must use valid encoding.');}
  if(/[?#\\\x00-\x20\x7f]/.test(decoded) || decoded.includes('//') || decoded.split('/').some(part=>part==='.'||part==='..'))throw new Error('Canonical paths cannot contain traversal or duplicate separators.');
  return value === '/' ? '/' : value.replace(/\/+$/, '') + '/';
}
export function pageMetadata({ title, description, path: pathname }: { title: string; description: string; path: string }): Metadata {
  const canonical = siteUrl + canonicalPath(pathname);
  return { title: { absolute: title }, description, alternates: {canonical},
    robots: {index:indexingAllowed(),follow:indexingAllowed(),googleBot:{index:indexingAllowed(),follow:indexingAllowed(),'max-image-preview':'large'}},
    openGraph: { title, description, url:canonical,siteName:agencyName,locale:'en_IN',type:'website',images:[{url:siteUrl+'/opengraph-image.png',width:1200,height:630,alt:'Websynk Technologies — website development and digital marketing, serving Greater Noida from Noida.'}] },
    twitter: {card:'summary_large_image',title,description,images:[siteUrl+'/opengraph-image.png']},
  };
}
export const businessSchema = {
  '@type': ['Organization', 'ProfessionalService'], '@id': siteUrl + '/#business',
  name:agencyName,url:siteUrl+'/',logo:{'@type':'ImageObject',url:siteUrl+'/logo.svg',width:240,height:64},image:siteUrl+'/opengraph-image.png',telephone:'+919115082252',foundingDate:String(establishedYear),
  description:'Website development, digital marketing, SEO, Meta Ads, Google Ads, apps and e-commerce services. Physical office in Noida, serving businesses in Greater Noida and Delhi NCR.',
  address:{'@type':'PostalAddress',streetAddress:'603, Advant Navis Business Park, Sector 142',addressLocality:'Noida',addressRegion:'Uttar Pradesh',addressCountry:'IN'},
  areaServed:serviceAreas.map(name=>({'@type':'Place',name})),hasMap:agencyMapsUrl,
  contactPoint:{'@type':'ContactPoint',telephone:'+919115082252',contactType:'business enquiries'},
};
// No social profiles, business hours, coordinates, ratings or reviews are invented.
export const websiteSchema = {'@type':'WebSite','@id':siteUrl+'/#website',url:siteUrl+'/',name:agencyName,publisher:{'@id':businessSchema['@id']},inLanguage:'en-IN'};
export function serializeSchema(value: unknown) { return JSON.stringify(value).replace(/</g,'\\u003c'); }
export const publicBusinessDetails = {name:agencyName,address:agencyAddress,phone:agencyPhoneDisplay};
