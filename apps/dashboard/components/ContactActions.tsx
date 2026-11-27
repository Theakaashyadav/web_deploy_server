import { MessageCircle, Phone } from 'lucide-react';
import { agencyPhoneHref } from '../lib/agency';
import styles from './ContactActions.module.css';

export default function ContactActions({ whatsappUrl }: { whatsappUrl: string | null }) {
  return <aside className={styles.actions} aria-label="Contact Websynk" data-contact-actions>
    <a className={styles.call} href={agencyPhoneHref} aria-label="Call Now — Websynk Technologies">
      <Phone size={20} strokeWidth={1.8} aria-hidden="true" />
      <span>Call Now</span>
    </a>
    <a className={styles.whatsapp} href={whatsappUrl || '#contact'} target={whatsappUrl ? '_blank' : undefined} rel={whatsappUrl ? 'noopener noreferrer' : undefined} aria-label="WhatsApp — chat with Websynk Technologies">
      <MessageCircle size={22} strokeWidth={1.8} aria-hidden="true" />
      <span>WhatsApp</span>
    </a>
  </aside>;
}
