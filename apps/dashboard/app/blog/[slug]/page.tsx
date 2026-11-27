import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ContentPage from '../../../components/ContentPage';
import { blogArticle, blogArticles } from '../../../lib/seo-content';
import { pageMetadata, siteUrl } from '../../../lib/seo';
import { agencyName } from '../../../lib/agency';

export const dynamicParams = false;
export const generateStaticParams = () => blogArticles.map(({ slug }) => ({ slug }));
type Context = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Context): Promise<Metadata> {
  const article = blogArticle((await params).slug);
  if (!article) return { title: 'Guide not found', robots: { index: false, follow: false } };
  const metadata = pageMetadata({ title: `${article.title} | Websynk`, description: article.description, path: `/blog/${article.slug}/` });
  return { ...metadata, openGraph: { ...metadata.openGraph, type: 'article', authors: [agencyName] } };
}

export default async function BlogPage({ params }: Context) {
  const article = blogArticle((await params).slug);
  if (!article) notFound();
  const url = `${siteUrl}/blog/${article.slug}/`;
  const graph = [
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: article.title, description: article.description, inLanguage: 'en-IN', isPartOf: { '@id': `${siteUrl}/#website` }, mainEntity: { '@id': `${url}#article` }, breadcrumb: { '@id': `${url}#breadcrumbs` } },
    { '@type': 'BlogPosting', '@id': `${url}#article`, headline: article.title, description: article.description, url, mainEntityOfPage: { '@id': `${url}#webpage` }, author: { '@type': 'Organization', '@id': `${siteUrl}/#business`, name: agencyName }, publisher: { '@id': `${siteUrl}/#business` }, inLanguage: 'en-IN', dateModified: '2026-11-27' },
    { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumbs`, itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Insights', item: `${siteUrl}/blog/` },
      { '@type': 'ListItem', position: 3, name: article.title, item: url },
    ] },
  ];
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') }} /><ContentPage page={article} article /></>;
}
