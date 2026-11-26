'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Code2, Globe2, Layers3, Menu, MessageCircle, MousePointer2, Search, ShieldCheck, ShoppingBag, Smartphone, Sparkles, TrendingUp, X } from 'lucide-react';
import styles from './AgencyLanding.module.css';

type AgencyLandingProps = { agencyName: string; whatsappUrl: string | null };

const services = [
  { number: '01', title: 'Website development', description: 'Fast, intuitive websites that turn a first impression into a lasting connection.', tags: 'Business websites / Custom web platforms', Icon: Code2 },
  { number: '02', title: 'App development', description: 'Thoughtful mobile experiences that make your business part of the everyday.', tags: 'Android & iOS / Product experiences', Icon: Smartphone },
  { number: '03', title: 'Digital marketing', description: 'Connect your brand with the right people through campaigns built around your goals.', tags: 'Paid advertising / Social media strategy', Icon: TrendingUp },
  { number: '04', title: 'SEO & content', description: 'Be easier to discover. Give your audience a reason to find you and stay.', tags: 'Search optimization / Content strategy', Icon: Search },
  { number: '05', title: 'Brand & design', description: 'Find your visual voice with an identity and digital design that feel unmistakably you.', tags: 'Brand identity / UI & UX design', Icon: Layers3 },
  { number: '06', title: 'E-commerce solutions', description: 'Bring your products online with a smooth shopping experience from browse to checkout.', tags: 'Online stores / Shopping experiences', Icon: ShoppingBag },
];

const processSteps = [
  { title: 'First, we listen.', text: 'Your business, your audience, your next big goal. We start by understanding what matters.' },
  { title: 'Find the direction.', text: 'A clear strategy, thoughtful ideas, and a practical plan for bringing it all together.' },
  { title: 'Make it happen.', text: 'Design and development come together, with feedback and collaboration along the way.' },
  { title: 'Launch. Learn. Grow.', text: 'Bring your project to the world, then explore what can make the next chapter even better.' },
];

function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="35" height="35" viewBox="0 0 35 35" fill="none" aria-hidden="true"><path d="M4 10.5L11 24.5L17.5 11L24 24.5L31 10.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M27 4H32V9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
    <a href="#services" onClick={() => setMenuOpen(false)}>Our services</a>
    <a href="#about" onClick={() => setMenuOpen(false)}>About us</a>
    <a href="#process" onClick={() => setMenuOpen(false)}>Our process</a>
    <a href="#contact" onClick={() => setMenuOpen(false)}>Let&apos;s connect</a>
  </>;

  return <div className={styles.page}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href="#" aria-label={`${agencyName} home`}><BrandMark /><span><strong>{brandName}<span className={styles.brandDot}>.</span></strong>{brandDescription.length > 0 && <small>{brandDescription.join(' ')}</small>}</span></a>
        <nav className={styles.desktopNav} aria-label="Main navigation">{navigation}</nav>
        <div className={styles.headerActions}>
          <a className={styles.headerContact} {...chat}>Let&apos;s talk <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className={styles.adminLink} href="/admin" aria-label="Admin login" title="DeployHub admin login"><ShieldCheck size={20} strokeWidth={1.7} aria-hidden="true" /></a>
          <button className={styles.menuButton} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="agency-mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}</button>
        </div>
      </div>
      {menuOpen && <nav id="agency-mobile-navigation" className={styles.mobileNav} aria-label="Mobile navigation">{navigation}<a {...chat} onClick={() => setMenuOpen(false)}>Chat on WhatsApp <ArrowUpRight size={17} aria-hidden="true" /></a></nav>}
    </header>

    <main id="main-content" className={styles.main}>
      <section className={`${styles.hero} ${styles.container}`} aria-labelledby="hero-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span />YOUR IDEAS. OUR DIGITAL DNA.</p>
          <h1 id="hero-heading">Your next<br />big move.<br /><span>Made digital.</span></h1>
          <p className={styles.heroDescription}>We build websites, create apps, and connect brands with people. One creative technology partner for everything your business can become.</p>
          <div className={styles.heroActions}><a className={styles.primaryButton} {...chat}>Let&apos;s build something <ArrowUpRight size={19} aria-hidden="true" /></a><a className={styles.textButton} href="#services">Explore our services <ArrowDown size={17} aria-hidden="true" /></a></div>
          <div className={styles.heroNote}><span className={styles.noteLine} />STRATEGY MEETS DESIGN. CREATIVITY MEETS CODE.</div>
        </div>
        <div className={styles.heroVisual} aria-label="Website and mobile app design concepts">
          <div className={styles.visualGrid} aria-hidden="true" />
          <div className={styles.orbitOne} aria-hidden="true" /><div className={styles.orbitTwo} aria-hidden="true" />
          <div className={styles.designBadge}><Sparkles size={17} aria-hidden="true" /><span>A little bold.<br /><strong>A lot of possibility.</strong></span></div>
          <div className={styles.browserMockup}>
            <div className={styles.browserBar}><span><i /><i /><i /></span><span className={styles.browserUrl}>your next big thing</span><ArrowUpRight size={13} aria-hidden="true" /></div>
            <div className={styles.conceptSite}><div className={styles.conceptNav}><strong>form<span>®</span></strong><span>Objects for a better everyday <Menu size={12} aria-hidden="true" /></span></div><div className={styles.conceptHeading}>Less ordinary.<br />More <em>you.</em></div><div className={styles.conceptShape} aria-hidden="true"><div /><div /><div /></div><div className={styles.conceptBottom}><span>A NEW PERSPECTIVE</span><span className={styles.conceptRoundArrow}><ArrowUpRight size={19} aria-hidden="true" /></span></div></div>
          </div>
          <div className={styles.phoneMockup}>
            <div className={styles.phoneCamera} />
            <div className={styles.phoneHeader}><span>Good morning <span aria-hidden="true">☀</span></span><span className={styles.phoneAvatar}>a.</span></div>
            <strong className={styles.phoneTitle}>Make room<br />for good things.</strong>
            <div className={styles.phoneArt} aria-hidden="true"><div /><div /><div /><span /></div>
            <div className={styles.phoneProduct}><span>The everyday collection<small>Made for your kind of life.</small></span><span><ArrowUpRight size={17} aria-hidden="true" /></span></div>
            <div className={styles.phoneBottom}><Globe2 size={15} aria-hidden="true" /><Layers3 size={15} aria-hidden="true" /><ShoppingBag size={15} aria-hidden="true" /></div>
          </div>
          <div className={styles.codeLabel}><Code2 size={18} aria-hidden="true" /><span>Built with purpose.</span><span className={styles.codeDot} /></div>
          <div className={styles.cursorLabel} aria-hidden="true"><MousePointer2 size={24} fill="currentColor" /><span>your next chapter</span></div>
          <span className={styles.conceptCaption}>DESIGN CONCEPTS · WEB + MOBILE</span>
        </div>
      </section>

      <section className={styles.introStrip} aria-label="Our approach"><div className={styles.container}><p>Good design gets noticed.<br /><strong>Great experiences stay with you.</strong></p><div><span>Creative thinking <Sparkles size={18} aria-hidden="true" /></span><span>Thoughtful technology <Code2 size={18} aria-hidden="true" /></span><span>Connected growth <TrendingUp size={18} aria-hidden="true" /></span></div></div></section>

      <section id="services" className={`${styles.services} ${styles.container}`} aria-labelledby="services-heading">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>WHAT WE BRING TO THE TABLE</p><h2 id="services-heading">Your ambition.<br /><span>Our expertise.</span></h2></div><p>From your first online impression to your next stage of growth, we bring the right skills together to move your business forward.</p></div>
        <div className={styles.serviceGrid}>{services.map(({ number, title, description, tags, Icon }) => <a className={styles.service} key={number} {...chat} aria-label={`Discuss ${title.toLowerCase()} with ${agencyName}`}><div className={styles.serviceTop}><span className={styles.serviceNumber}>/ {number}</span><Icon className={styles.serviceIcon} size={30} strokeWidth={1.45} aria-hidden="true" /><span className={styles.serviceArrow}><ArrowUpRight size={21} aria-hidden="true" /></span></div><h3>{title}</h3><p>{description}</p><span className={styles.serviceTags}>{tags}</span></a>)}</div>
      </section>

      <section id="about" className={styles.about} aria-labelledby="about-heading"><div className={`${styles.aboutInner} ${styles.container}`}>
        <div className={styles.aboutArtwork} aria-hidden="true"><div className={styles.aboutType}>Big ideas.<br /><span>Connected.</span></div><div className={styles.connectionLines}><span /><span /><span /></div><div className={styles.aboutNodeOne}><Code2 size={30} /></div><div className={styles.aboutNodeTwo}><Sparkles size={32} /></div><div className={styles.aboutNodeThree}><TrendingUp size={30} /></div><span className={styles.aboutArtworkLabel}>THE RIGHT IDEAS, WORKING TOGETHER.</span></div>
        <div className={styles.aboutCopy}><p className={styles.eyebrow}>A PARTNER, NOT JUST A PROVIDER</p><h2 id="about-heading">One team.<br />A bigger picture.</h2><p>At {agencyName}, we connect the dots between how your brand looks, how your technology works, and how people discover you.</p><p>We believe the best digital work starts with a conversation. We get to know your goals, bring clarity to the process, and create something that feels right for your business.</p><div className={styles.aboutValues}><span><Check size={16} aria-hidden="true" />Purpose before pixels</span><span><Check size={16} aria-hidden="true" />Clear, honest communication</span><span><Check size={16} aria-hidden="true" />Built for what comes next</span></div><a className={styles.textButton} {...chat}>Get to know us <ArrowUpRight size={18} aria-hidden="true" /></a></div>
      </div></section>

      <section id="process" className={`${styles.process} ${styles.container}`} aria-labelledby="process-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FROM HELLO TO WHAT&apos;S NEXT</p><h2 id="process-heading">Great work starts<br />with a good conversation.</h2></div><p>No guesswork. Just a shared direction, a clear process, and the right people bringing your ideas to life.</p></div><div className={styles.processGrid}>{processSteps.map((step, index) => <article className={styles.processStep} key={step.title}><div className={styles.stepNumber}>0{index + 1}<span><ArrowRight size={18} aria-hidden="true" /></span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>

      <section className={`${styles.faq} ${styles.container}`} aria-labelledby="faq-heading"><div><p className={styles.eyebrow}>A LITTLE MORE CLARITY</p><h2 id="faq-heading">Before we<br />say hello.</h2><p>Have something else in mind?<br /><a {...chat}>Ask us on WhatsApp <ArrowUpRight size={15} aria-hidden="true" /></a></p></div><div className={styles.faqItems}><details><summary>Can I start with just one service?<ChevronDown size={19} aria-hidden="true" /></summary><p>Absolutely. Start with the service your business needs today, whether that is a website, an app, or a marketing project. We can discuss how the pieces fit together as your needs grow.</p></details><details><summary>What do you need to get started?<ChevronDown size={19} aria-hidden="true" /></summary><p>Tell us about your business, what you want to achieve, and any timeline you have in mind. A WhatsApp conversation is a simple place to start, even if your idea is still taking shape.</p></details><details><summary>How much will my project cost?<ChevronDown size={19} aria-hidden="true" /></summary><p>Every project has its own scope. We will discuss your requirements, priorities, and budget before suggesting an approach and putting together a proposal.</p></details></div></section>

      <section id="contact" className={`${styles.contact} ${styles.container}`} aria-labelledby="contact-heading"><div className={styles.contactPanel}><div><p className={styles.eyebrow}>YOUR NEXT CHAPTER STARTS HERE</p><h2 id="contact-heading">Have a good idea?<br />Let&apos;s make it <span>great.</span></h2><p>A website. An app. A fresh direction.<br />Tell us what you&apos;re thinking. We&apos;re all ears.</p><a className={styles.darkButton} {...chat}><MessageCircle size={21} aria-hidden="true" />Let&apos;s talk on WhatsApp <ArrowUpRight size={18} aria-hidden="true" /></a></div><div className={styles.contactArrow} aria-hidden="true"><ArrowUpRight strokeWidth={1} /></div><span className={styles.contactSmall}>A SMALL HELLO CAN START SOMETHING BIG.</span></div></section>
    </main>

    <footer className={`${styles.footer} ${styles.container}`}><div className={styles.footerMain}><a className={styles.brand} href="#" aria-label={`${agencyName} home`}><BrandMark /><span><strong>{brandName}<span className={styles.brandDot}>.</span></strong>{brandDescription.length > 0 && <small>{brandDescription.join(' ')}</small>}</span></a><p>Thoughtful websites. Useful apps.<br />Brands that find their people.</p><nav aria-label="Footer navigation"><a href="#services">Services</a><a href="#about">About</a><a href="#process">Process</a><a {...chat}>WhatsApp <ArrowUpRight size={13} aria-hidden="true" /></a></nav></div><div className={styles.footerBottom}><span>© {new Date().getFullYear()} {agencyName}. All rights reserved.</span><span>Built with purpose. Connected by design.</span><a href="/admin">Admin access <ArrowUpRight size={13} aria-hidden="true" /></a></div></footer>
    <a className={styles.floatingChat} {...chat} aria-label={`Chat with ${agencyName} on WhatsApp`}><MessageCircle size={24} strokeWidth={1.8} aria-hidden="true" /><span>Let&apos;s chat</span><span className={styles.chatStatus} /></a>
  </div>;
}
