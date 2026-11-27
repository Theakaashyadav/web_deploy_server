import type { MetadataRoute } from 'next';
import { publicPages, blogArticles } from '../lib/seo-content';
import { siteUrl, indexingAllowed } from '../lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
  if(!indexingAllowed())return [];
  return ['/',...publicPages.map(page=>`/${page.slug}/`),...blogArticles.map(article=>`/blog/${article.slug}/`)].map(path=>({url:siteUrl+path}));
}
