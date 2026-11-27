import type { MetadataRoute } from 'next';
import { indexingAllowed, siteUrl } from '../lib/seo';
export default function robots(): MetadataRoute.Robots {
  return {rules:{userAgent:'*',allow:indexingAllowed()?'/':undefined,disallow:indexingAllowed()?['/admin','/login','/api','/_next/webpack-hmr','/test','/staging']:'/'},sitemap:siteUrl+'/sitemap.xml',host:siteUrl};
}
