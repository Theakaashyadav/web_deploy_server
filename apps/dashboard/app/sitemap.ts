import type { MetadataRoute } from 'next';
import { siteUrl, indexingAllowed } from '../lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
  if(!indexingAllowed())return [];
  return [{url:siteUrl+'/'}];
}
