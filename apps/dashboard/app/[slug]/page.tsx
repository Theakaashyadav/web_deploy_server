import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import ContentPage from '../../components/ContentPage';
import { publicPage, publicPages } from '../../lib/seo-content';
import { pageMetadata, siteUrl } from '../../lib/seo';

export const dynamicParams = false;
export const generateStaticParams = () => publicPages.map(({ slug }) => ({ slug }));

type Context = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Context): Promise<Metadata> {
  const page = publicPage((await params).slug);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: false } };
  return pageMetadata({ title: page.title, description: page.description, path: `/${page.slug}/` });
}

export default async function PublicPage({ params }: Context) {
  const page = publicPage((await params).slug);
  if (!page) notFound();
  const url = `${siteUrl}/${page.slug}/`;
  const webpage = {
    '@type': page.slug === 'about-us' ? 'AboutPage' : page.slug === 'contact-us' ? 'ContactPage' : page.slug === 'blog' ? 'CollectionPage' : 'WebPage',
    '@id': `${url}#webpage`, url, name: page.title, description: page.description,
    isPartOf: { '@id': `${siteUrl}/#website` }, about: { '@id': `${siteUrl}/#business` },
    breadcrumb: { '@id': `${url}#breadcrumbs` }, inLanguage: 'en-IN',
    ...(page.serviceType ? { mainEntity: { '@id': `${url}#service` } } : {}),
  };
  const graph: Record<string, unknown>[] = [webpage, {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumbs`, itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: page.title.split(' | ')[0], item: url },
    ],
  }];
  if (page.serviceType) graph.push({ '@type': 'Service', '@id': `${url}#service`, name: page.serviceType, serviceType: page.serviceType, url, description: page.description, provider: { '@id': `${siteUrl}/#business` }, areaServed: ['Greater Noida', 'Noida', 'Delhi NCR'], mainEntityOfPage: { '@id': `${url}#webpage` } });
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c') }} /><ContentPage page={page} /></>;
}
