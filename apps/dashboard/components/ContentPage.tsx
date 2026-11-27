import { ArrowRight, ArrowUpRight, MapPin, Phone } from 'lucide-react';
import { agencyAddress, agencyMapsUrl, agencyName, agencyPhoneDisplay, agencyPhoneHref, whatsappUrl } from '../lib/agency';
import { blogArticles, publicPages, type BlogArticle, type PublicPage } from '../lib/seo-content';
import EnquiryForm from './EnquiryForm';
import styles from './ContentPage.module.css';

type ContentPageProps = { page: PublicPage | BlogArticle; article?: boolean };
const sectionId = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function Brand() {
  return <a className={styles.brand} href="/" aria-label="Websynk Technologies home">
    <svg width="34" height="34" viewBox="0 0 35 35" fill="none" aria-hidden="true"><path d="M4 10.5L11 24.5L17.5 11L24 24.5L31 10.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M27 4H32V9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
    <span><strong>Websynk<span>.</span></strong><small>TECHNOLOGIES</small></span>
  </a>;
}

export default function ContentPage({ page, article = false }: ContentPageProps) {
  const isContact = !article && page.slug === 'contact-us';
  const isBlog = !article && page.slug === 'blog';
  const related = publicPages.filter(item => page.related.includes(item.slug));
  const category = article ? (page as BlogArticle).category : (page as PublicPage).eyebrow;
  const parentPath = article ? '/blog/' : '/';

  return <div className={styles.page}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <header className={styles.header}><div className={styles.headerInner}>
      <Brand />
      <nav aria-label="Main navigation"><a href="/#services">Services</a><a href="/about-us/" aria-current={page.slug === 'about-us' ? 'page' : undefined}>Company</a><a href="/blog/" aria-current={isBlog ? 'page' : undefined}>Insights</a><a href="/contact-us/" aria-current={isContact ? 'page' : undefined}>Contact</a></nav>
      <a className={styles.headerPhone} href={agencyPhoneHref}><Phone size={15} aria-hidden="true" />{agencyPhoneDisplay}</a>
    </div></header>

    <main id="main-content">
      <section className={styles.hero} aria-labelledby="page-heading"><div className={styles.container}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li>{article && <li><a href="/blog/">Insights</a></li>}<li aria-current="page">{article ? 'Guide' : page.slug === 'blog' ? 'Insights' : category.toLowerCase().replace(' · greater noida', '')}</li></ol></nav>
        <p className={styles.eyebrow}>{category}</p>
        <h1 id="page-heading">{article ? (page as BlogArticle).title : (page as PublicPage).heading}</h1>
        <p className={styles.introduction}>{page.introduction}</p>
        {article ? <p className={styles.byline}>By {agencyName} editorial team <span aria-hidden="true">·</span> Updated 27 November 2026</p>
          : <div className={styles.heroActions}><a className={styles.primaryButton} href={isContact ? '#enquiry' : '/contact-us/'}>Get a free consultation <ArrowUpRight size={18} aria-hidden="true" /></a><a className={styles.textLink} href={parentPath}>{isBlog ? 'Explore our services' : 'Back to the homepage'} <ArrowRight size={16} aria-hidden="true" /></a></div>}
      </div></section>

      {isBlog ? <section className={`${styles.container} ${styles.blogGrid}`} aria-label="Digital business guides">
        {blogArticles.map(item => <article className={styles.articleCard} key={item.slug}><span className={styles.eyebrow}>{item.category}</span><h2><a href={`/blog/${item.slug}/`}>{item.title}</a></h2><p>{item.description}</p><a className={styles.textLink} href={`/blog/${item.slug}/`}>Read the guide <ArrowUpRight size={16} aria-hidden="true" /></a></article>)}
      </section> : <div className={`${styles.container} ${styles.readingLayout}`}>
        <aside className={styles.contents} aria-label="Page contents"><span className={styles.eyebrow}>ON THIS PAGE</span><nav aria-label="On this page"><ol>{page.sections.map(section => <li key={section.heading}><a href={`#${sectionId(section.heading)}`}>{section.heading}</a></li>)}</ol></nav><a className={styles.sidebarContact} href="/contact-us/">Have a project in mind?<strong>Let&apos;s talk <ArrowUpRight size={16} aria-hidden="true" /></strong></a></aside>
        <div className={styles.content}>
          {page.sections.map(section => <section id={sectionId(section.heading)} className={styles.contentSection} key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}{section.sources && <p className={styles.references}>Further reading: {section.sources.map((source, index) => <span key={source.href}>{index > 0 && ' · '}<a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a></span>)}</p>}</section>)}
          {article && (page as BlogArticle).references && <div className={styles.sourceNote}><h2>Source notes</h2><p>This guide offers general planning information. Platform guidance can change; review the official references alongside your project requirements.</p><ul>{(page as BlogArticle).references!.map(reference => <li key={reference.href}><a href={reference.href} target="_blank" rel="noopener noreferrer">{reference.label} <ArrowUpRight size={13} aria-hidden="true" /></a></li>)}</ul></div>}
        </div>
      </div>}

      {isContact && <section id="enquiry" className={styles.enquirySection} aria-labelledby="enquiry-heading"><div className={`${styles.container} ${styles.enquiryGrid}`}>
        <div><p className={styles.eyebrow}>A CLEAR FIRST STEP</p><h2 id="enquiry-heading">Tell us about your project.</h2><p className={styles.enquiryLead}>Prepare a short WhatsApp enquiry, then review and send it in WhatsApp. No message is sent automatically.</p><div className={styles.contactItem}><Phone size={21} aria-hidden="true" /><div><span>CALL WEBSYNK</span><a href={agencyPhoneHref}>{agencyPhoneDisplay}</a></div></div><div className={styles.contactItem}><MapPin size={21} aria-hidden="true" /><div><span>OUR PHYSICAL OFFICE</span><address>{agencyAddress}</address><a className={styles.textLink} href={agencyMapsUrl} target="_blank" rel="noopener noreferrer">Get directions <ArrowUpRight size={16} aria-hidden="true" /></a></div></div></div>
        <EnquiryForm />
      </div></section>}

      <section className={`${styles.container} ${styles.related}`} aria-labelledby="related-heading"><div className={styles.relatedHeading}><p className={styles.eyebrow}>KEEP EXPLORING</p><h2 id="related-heading">A little more clarity.</h2></div><div className={styles.relatedGrid}>{related.map(item => <a href={`/${item.slug}/`} className={styles.relatedCard} key={item.slug}><span>{item.eyebrow}</span><strong>{item.heading}</strong><ArrowUpRight size={20} aria-hidden="true" /></a>)}</div></section>

      {!isContact && <section className={styles.cta}><div className={styles.container}><div><p className={styles.eyebrow}>LET&apos;S FIND YOUR NEXT STEP</p><h2>Ready to grow your business online?</h2><p>Tell us what you need. We will help you define a practical direction.</p></div><a className={styles.primaryButton} href="/contact-us/">Get your free consultation <ArrowUpRight size={18} aria-hidden="true" /></a></div></section>}
    </main>

    <footer className={styles.footer}><div className={styles.container}><div className={styles.footerGrid}>
      <div><Brand /><p>Website development, design and digital marketing with a shared business direction.</p></div>
      <div><strong>Explore</strong><nav aria-label="Footer navigation"><a href="/website-development-greater-noida/">Website development services</a><a href="/digital-marketing-greater-noida/">Digital marketing solutions</a><a href="/seo-services-greater-noida/">Local SEO services</a><a href="/blog/">Business guides</a></nav></div>
      <div><strong>Find us in Noida</strong><address>{agencyAddress}</address><a href={agencyPhoneHref}>{agencyPhoneDisplay}</a><a href={whatsappUrl} target="_blank" rel="noopener noreferrer">Chat on WhatsApp <ArrowUpRight size={13} aria-hidden="true" /></a></div>
    </div><div className={styles.footerBottom}><span>© {agencyName}. All rights reserved.</span><nav aria-label="Website policies"><a href="/privacy-policy/">Privacy policy</a><a href="/terms-and-conditions/">Terms and conditions</a><a href="/contact-us/">Contact</a></nav></div></div></footer>
    <a className={styles.floatingChat} href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with Websynk Technologies on WhatsApp">Let&apos;s talk <ArrowUpRight size={16} aria-hidden="true" /></a>
  </div>;
}
