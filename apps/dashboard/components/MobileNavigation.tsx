'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpRight, Menu } from 'lucide-react';
import styles from './AgencyLanding.module.css';

export default function MobileNavigation({ whatsappUrl }: { whatsappUrl: string | null }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const close = () => { if (menu.current) menu.current.open = false; };
  return <details className={styles.mobileMenu} ref={menu}>
    <summary aria-label="Open navigation" aria-controls="agency-mobile-navigation"><Menu size={23} aria-hidden="true" /></summary>
    <nav id="agency-mobile-navigation" className={styles.mobileNav} aria-label="Mobile navigation" onClick={close}>
      <a href="/#services">Services</a><a href="/#about">Our company</a><a href="/#process">Our approach</a><a href="/#faq">FAQs</a><a href="/#contact">Contact</a>
      <a href={whatsappUrl || '/#contact'} target={whatsappUrl ? '_blank' : undefined} rel={whatsappUrl ? 'noopener noreferrer' : undefined}>Chat on WhatsApp <ArrowUpRight size={17} aria-hidden="true" /></a>
    </nav>
  </details>;
}
