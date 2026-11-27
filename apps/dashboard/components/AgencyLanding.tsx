'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Code2, Globe2, Layers3, MapPin, Menu, MessageCircle, Phone, Search, ShieldCheck, ShoppingBag, Smartphone, Sparkles, TrendingUp, X } from 'lucide-react';
import { agencyAddress, agencyMapsUrl, agencyPhoneDisplay, agencyPhoneHref, deliveredProjects, establishedYear } from '../lib/agency';
import styles from './AgencyLanding.module.css';

type AgencyLandingProps = { agencyName: string; whatsappUrl: string | null };
const services = [
  { number: '01', title: 'Website development', description: 'A better first impression. A stronger business tool. Responsive websites and custom platforms built around your goals.', tags: ['Business websites', 'Custom platforms'], Icon: Code2 },
  { number: '02', title: 'App development', description: 'Bring your next product to life with intuitive mobile experiences that make everyday interactions feel effortless.', tags: ['Android & iOS', 'Product development'], Icon: Smartphone },
  { number: '03', title: 'Digital marketing', description: 'Connect with your audience through considered campaigns, meaningful content and a strategy shaped around your business.', tags: ['Paid campaigns', 'Social media'], Icon: TrendingUp },
  { number: '04', title: 'SEO & content', description: 'Make your business easier to discover with search optimisation and useful content that speaks to the right people.', tags: ['Search optimisation', 'Content strategy'], Icon: Search },
  { number: '05', title: 'Brand & design', description: 'Build a distinctive identity and a clear, consistent experience that feels like your business at every touchpoint.', tags: ['Brand identity', 'UI / UX design'], Icon: Layers3 },
  { number: '06', title: 'E-commerce solutions', description: 'Turn your catalogue into a considered shopping experience, from discovering a product to completing a purchase.', tags: ['Online stores', 'Shopping experiences'], Icon: ShoppingBag },
];
const processSteps = [
  { title: 'Discover & define', text: 'We get to know your business, audience and priorities, then agree on the scope and direction.' },
  { title: 'Design with purpose', text: 'We shape the experience, explore ideas and refine a design around what your audience needs.' },
  { title: 'Build & collaborate', text: 'We bring the work to life with regular communication, careful development and room for feedback.' },
  { title: 'Launch & look ahead', text: 'We check the details, prepare for launch and discuss the right next steps for your business.' },
];
function BrandMark() {
  return <svg width="35" height="35" viewBox="0 0 35 35" fill="none" aria-hidden="true"><path d="M4 10.5L11 24.5L17.5 11L24 24.5L31 10.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M27 4H32V9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AgencyLanding({ agencyName, whatsappUrl }: AgencyLandingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [brandName, ...brandDescription] = agencyName.split(' ');
  const chat = whatsappUrl ? { href: whatsappUrl, target: '_blank', rel: 'noopener noreferrer' } : { href: '#contact' };
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const navigation = <>
    <a href="#services" onClick={() => setMenuOpen(false)}>Services</a>
    <a href="#about" onClick={() => setMenuOpen(false)}>Our company</a>
    <a href="#process" onClick={() => setMenuOpen(false)}>Our approach</a>
    <a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
  </>;
  const brand = <><BrandMark /><span><strong>{brandName}<span className={styles.brandDot}>.</span></strong><small>{brandDescription.join(' ')}</small></span></>;

  return <div className={styles.page}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <div className={styles.announcement}><div className={styles.container}><span><span className={styles.statusDot} />Independent thinking. Connected expertise.</span><a href={agencyPhoneHref}><Phone size={12} aria-hidden="true" />{agencyPhoneDisplay}</a></div></div>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href="#" aria-label={`${agencyName} home`}>{brand}</a>
        <nav className={styles.desktopNav} aria-label="Main navigation">{navigation}</nav>
        <div className={styles.headerActions}>
          <a className={styles.headerContact} {...chat}>Start a conversation <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className={styles.adminLink} href="/admin" aria-label="Admin login" title="DeployHub admin login"><ShieldCheck size={20} strokeWidth={1.7} aria-hidden="true" /></a>
          <button className={styles.menuButton} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="agency-mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}</button>
        </div>
      </div>
      {menuOpen && <nav id="agency-mobile-navigation" className={styles.mobileNav} aria-label="Mobile navigation">{navigation}<a {...chat} onClick={() => setMenuOpen(false)}>Chat on WhatsApp <ArrowUpRight size={17} aria-hidden="true" /></a></nav>}
    </header>
    <main id="main-content" className={styles.main}>
      <section className={styles.heroSection} aria-labelledby="hero-heading">
        <div className={`${styles.hero} ${styles.container}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.statusDot} />YOUR DIGITAL GROWTH PARTNER</p>
            <h1 id="hero-heading">We build<br />your next<br /><span>advantage<em>.</em></span></h1>
            <p className={styles.heroDescription}>Distinctive websites. Intuitive apps. Brands that connect. We bring design, technology and digital marketing together to move your business forward.</p>
            <div className={styles.heroActions}><a className={styles.primaryButton} {...chat}>Let&apos;s discuss your project <ArrowUpRight size={18} aria-hidden="true" /></a><a className={styles.textButton} href="#services">Explore our expertise <ArrowDown size={16} aria-hidden="true" /></a></div>
            <div className={styles.heroNote}><span className={styles.heroMonogram}>W.</span><p>Built on trust. Driven by ideas.<br /><strong>Creating digital possibilities since {establishedYear}.</strong></p></div>
          </div>
          <div className={styles.heroVisual} aria-label="Illustrative website and mobile app design concepts">
            <div className={styles.visualGrid} aria-hidden="true" /><div className={styles.orbitOne} aria-hidden="true" /><div className={styles.orbitTwo} aria-hidden="true" />
            <div className={styles.designBadge}><Sparkles size={19} aria-hidden="true" /><span>Strategy. Design. Technology.<br /><strong>Better, together.</strong></span></div>
            <div className={styles.browserMockup}>
              <div className={styles.browserBar}><span><i /><i /><i /></span><span className={styles.browserUrl}><Globe2 size={9} aria-hidden="true" />a fresh perspective</span><ArrowUpRight size={13} aria-hidden="true" /></div>
              <div className={styles.conceptSite}><div className={styles.conceptNav}><strong>form<span>®</span></strong><span>THOUGHTFULLY DIFFERENT <Menu size={13} aria-hidden="true" /></span></div><div className={styles.conceptHeading}>Less ordinary.<br />More <em>possibility.</em></div><div className={styles.conceptShape} aria-hidden="true"><div /><div /><div /></div><div className={styles.conceptBottom}><span>GOOD DESIGN. EVERY DAY.</span><span className={styles.conceptRoundArrow}><ArrowUpRight size={21} aria-hidden="true" /></span></div></div>
            </div>
            <div className={styles.phoneMockup}><div className={styles.phoneCamera} /><div className={styles.phoneHeader}><span>THE EVERYDAY EDIT</span><span className={styles.phoneAvatar}>e.</span></div><strong className={styles.phoneTitle}>Make room<br />for good things.</strong><div className={styles.phoneArt} aria-hidden="true"><div /><div /><div /><span /></div><div className={styles.phoneProduct}><span>The everyday collection<small>Considered. Connected. Yours.</small></span><span><ArrowUpRight size={17} aria-hidden="true" /></span></div><div className={styles.phoneBottom}><Globe2 size={15} aria-hidden="true" /><Layers3 size={15} aria-hidden="true" /><ShoppingBag size={15} aria-hidden="true" /></div></div>
            <div className={styles.projectBadge}><span className={styles.projectBadgeIcon}><Check size={20} aria-hidden="true" /></span><div><strong>{deliveredProjects}</strong><span>projects delivered</span></div><ArrowUpRight size={20} aria-hidden="true" /></div>
            <div className={styles.cursorLabel} aria-hidden="true"><ArrowUpRight size={24} /><span>your next chapter</span></div><span className={styles.conceptCaption}>DESIGN EXPLORATIONS / WEB + MOBILE</span>
          </div>
        </div>
        <div className={`${styles.heroBottom} ${styles.container}`}><span>GOOD IDEAS DESERVE GREAT EXECUTION.</span><a href="#about">Meet your digital partner <ArrowDown size={14} aria-hidden="true" /></a><span className={styles.heroCoordinates}><MapPin size={13} aria-hidden="true" />NOIDA, INDIA</span></div>
      </section>
      <section className={styles.proofStrip} aria-label="Websynk company milestones"><div className={styles.container}><div className={styles.proofIntroduction}><span className={styles.eyebrow}>GOOD IDEAS. REAL EXPERIENCE.</span><p>A strong foundation for<br /><strong>your next big step.</strong></p></div><div className={styles.proofStat}><strong>{deliveredProjects}</strong><span>Projects delivered</span></div><div className={styles.proofStat}><strong>{establishedYear}</strong><span>The year we started</span></div><div className={styles.proofStat}><strong>One team.</strong><span>Strategy through execution</span></div></div></section>
      <section id="services" className={`${styles.services} ${styles.container}`} aria-labelledby="services-heading">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}><span className={styles.sectionLine} />WHAT WE DO</p><h2 id="services-heading">The right expertise.<br /><span>All working for you.</span></h2></div><p>From your first impression to your next stage of growth, we connect the skills your business needs in one collaborative team.</p></div>
        <div className={styles.serviceGrid}>{services.map(({ number, title, description, tags, Icon }) => <a className={styles.service} key={number} {...chat} aria-label={`Discuss ${title.toLowerCase()} with ${agencyName}`}><div className={styles.serviceTop}><span className={styles.serviceIcon}><Icon size={26} strokeWidth={1.5} aria-hidden="true" /></span><span className={styles.serviceNumber}>/ {number}</span><ArrowUpRight className={styles.serviceArrow} size={22} aria-hidden="true" /></div><h3>{title}</h3><p>{description}</p><div className={styles.serviceTags}>{tags.map(tag => <span key={tag}>{tag}</span>)}</div></a>)}</div>
      </section>
      <section id="about" className={styles.about} aria-labelledby="about-heading"><div className={`${styles.aboutInner} ${styles.container}`}>
        <div className={styles.aboutArtwork}><div className={styles.aboutArtworkTop}><BrandMark /><span>CREATIVE THINKING. SHARED AMBITION.</span></div><div className={styles.aboutType}>Big ideas.<br />Clear purpose.<br /><span>Real connection.</span></div><div className={styles.aboutGraphic} aria-hidden="true"><span /><span /><span /><ArrowUpRight size={85} strokeWidth={1.3} /></div><div className={styles.establishedBadge}><span>ESTABLISHED</span><strong>{establishedYear}</strong><span>BUILT TO KEEP MOVING FORWARD</span></div></div>
        <div className={styles.aboutCopy}><p className={styles.eyebrow}><span className={styles.sectionLine} />A LITTLE ABOUT WEBSYNK</p><h2 id="about-heading">Your ambition.<br />Our shared <span>purpose.</span></h2><p className={styles.aboutLead}>We are {agencyName}, a digital solutions company based in Noida. Established in {establishedYear}, we help businesses turn ambitious ideas into meaningful digital experiences.</p><p>With {deliveredProjects} projects delivered, our work brings together website and app development, creative design, digital marketing, SEO and e-commerce. We look at the whole picture, so your brand, technology and growth strategy work in the same direction.</p><p>Whether you are building something new or taking an established business further, we bring a considered approach, clear communication and a commitment to understanding your goals.</p><div className={styles.aboutValues}><span><Check size={16} aria-hidden="true" />Business comes first</span><span><Check size={16} aria-hidden="true" />Thoughtful execution</span><span><Check size={16} aria-hidden="true" />Clear communication</span></div><a className={styles.textButton} {...chat}>Let&apos;s explore what&apos;s possible <ArrowUpRight size={18} aria-hidden="true" /></a></div>
      </div></section>
      <section id="process" className={`${styles.process} ${styles.container}`} aria-labelledby="process-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}><span className={styles.sectionLine} />HOW WE WORK</p><h2 id="process-heading">A clear process.<br /><span>A shared direction.</span></h2></div><p>Good partnerships make room for ideas and keep things moving. Here is how we take your project from the first conversation to launch.</p></div><div className={styles.processGrid}>{processSteps.map((step, index) => <article className={styles.processStep} key={step.title}><div className={styles.stepNumber}>0{index + 1}<span><ArrowRight size={18} aria-hidden="true" /></span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
      <section className={`${styles.faq} ${styles.container}`} aria-labelledby="faq-heading"><div><p className={styles.eyebrow}><span className={styles.sectionLine} />LET&apos;S CLEAR THINGS UP</p><h2 id="faq-heading">A few good<br /><span>questions.</span></h2><p>Something else on your mind?<br /><a {...chat}>We&apos;re happy to help <ArrowUpRight size={15} aria-hidden="true" /></a></p></div><div className={styles.faqItems}>
        <details><summary>Can I work with you on just one service?<ChevronDown size={19} aria-hidden="true" /></summary><p>Yes. Start with the service your business needs, whether that is a website, an app, a brand identity or a marketing project. We can bring in other expertise as your requirements develop.</p></details>
        <details><summary>What do you need to get started?<ChevronDown size={19} aria-hidden="true" /></summary><p>Tell us about your business, your goals, the scope you have in mind and any timeline you are working towards. A call or WhatsApp conversation is a good place to start.</p></details>
        <details><summary>How do you estimate the cost of a project?<ChevronDown size={19} aria-hidden="true" /></summary><p>We discuss your requirements, priorities and budget before defining the scope and proposing an approach. The estimate depends on the features, design and work involved.</p></details>
      </div></section>
      <section id="contact" className={styles.contact} aria-labelledby="contact-heading"><div className={styles.container}>
        <div className={styles.contactHeading}><div><p className={styles.eyebrow}><span className={styles.statusDot} />YOUR NEXT CHAPTER STARTS HERE</p><h2 id="contact-heading">Have an idea?<br /><span>Let&apos;s make it happen.</span></h2><p>Tell us where you want to go.<br />We&apos;ll help you find the way forward.</p></div><a className={styles.contactCircle} {...chat} aria-label="Discuss your project on WhatsApp"><ArrowUpRight size={73} strokeWidth={1.3} aria-hidden="true" /><span>LET&apos;S TALK</span></a></div>
        <div className={styles.contactDetails}>
          <div className={styles.contactDetail}><span className={styles.contactIcon}><Phone size={20} aria-hidden="true" /></span><div><span>GIVE US A CALL</span><a className={styles.contactPhone} href={agencyPhoneHref}>{agencyPhoneDisplay}</a><p>Good conversations start with hello.</p></div></div>
          <div className={styles.contactDetail}><span className={styles.contactIcon}><MapPin size={21} aria-hidden="true" /></span><div><span>FIND US IN NOIDA</span><address>{agencyAddress}</address><a className={styles.directions} href={agencyMapsUrl} target="_blank" rel="noopener noreferrer">Get directions <ArrowUpRight size={14} aria-hidden="true" /></a></div></div>
          <a className={styles.contactChat} {...chat}><MessageCircle size={25} strokeWidth={1.5} aria-hidden="true" /><span>Start with a simple hello.<strong>Chat on WhatsApp <ArrowUpRight size={16} aria-hidden="true" /></strong></span></a>
        </div>
      </div></section>
    </main>
    <footer className={styles.footer}><div className={styles.container}><div className={styles.footerMain}><a className={styles.brand} href="#" aria-label={`${agencyName} home`}>{brand}</a><p>Thoughtful technology. Distinctive design.<br />Your digital partner since {establishedYear}.</p><nav aria-label="Footer navigation"><a href="#services">Services</a><a href="#about">Company</a><a href="#contact">Contact</a><a href={agencyPhoneHref}>Call us <ArrowUpRight size={14} aria-hidden="true" /></a></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} {agencyName}. All rights reserved.</span><span>MADE WITH PURPOSE. BASED IN NOIDA.</span><a href="/admin"><ShieldCheck size={13} aria-hidden="true" />Admin access</a></div></div></footer>
    <a className={styles.floatingChat} {...chat} aria-label={`Chat with ${agencyName} on WhatsApp`}><MessageCircle size={23} strokeWidth={1.8} aria-hidden="true" /><span>Let&apos;s chat</span><span className={styles.chatStatus} /></a>
  </div>;
}
