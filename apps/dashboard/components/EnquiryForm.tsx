'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { whatsappNumber } from '../lib/agency';
import styles from './EnquiryForm.module.css';

export default function EnquiryForm() {
  const [error, setError] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const clearDraft = () => { setDraftUrl(''); setError(''); };
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setDraftUrl('');
    const form = event.currentTarget;
    const values = new FormData(form);
    if (String(values.get('website') || '')) {
      setError('We could not prepare this enquiry. Please contact us using the phone or WhatsApp links.'); return;
    }
    const name = String(values.get('name') || '').trim();
    const phone = String(values.get('phone') || '').trim();
    const service = String(values.get('service') || '').trim();
    const project = String(values.get('project') || '').trim();
    if (name.length < 2 || name.length > 80) { setError('Enter your name using between 2 and 80 characters.'); return; }
    if (!/^\+?[\d\s()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) {
      setError('Enter a valid contact number with 7 to 15 digits, including your country code where needed.'); return;
    }
    if (!service) { setError('Choose the service you would like to discuss.'); return; }
    if (project.length < 20 || project.length > 2000) { setError('Tell us about your project using between 20 and 2,000 characters.'); return; }
    if (values.get('consent') !== 'on') { setError('Please agree to share these details with Websynk through WhatsApp.'); return; }
    const message = `Hello Websynk Technologies, I would like a free consultation.\n\nName: ${name}\nContact: ${phone}\nService: ${service}\nProject: ${project}`;
    setDraftUrl(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`);
  }
  return <form className={styles.form} onSubmit={prepare} onInput={clearDraft}>
    <div className={styles.row}>
      <label htmlFor="enquiry-name">Your name<input id="enquiry-name" name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="How should we address you?" /></label>
      <label htmlFor="enquiry-phone">Phone number<input id="enquiry-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} placeholder="Include your country code" /></label>
    </div>
    <label htmlFor="enquiry-service">What would you like to discuss?<select id="enquiry-service" name="service" required defaultValue=""><option value="" disabled>Select a service</option><option>Website development</option><option>Digital marketing</option><option>SEO and local search</option><option>Meta Ads and Google Ads</option><option>E-commerce development</option><option>App development</option><option>Branding and UI/UX design</option><option>Website maintenance</option><option>Something else</option></select></label>
    <label htmlFor="enquiry-project">A little about your project<textarea id="enquiry-project" name="project" required minLength={20} maxLength={2000} rows={4} placeholder="Your business, priorities and what you would like to achieve." /></label>
    <div className={styles.honeypot} aria-hidden="true"><label htmlFor="enquiry-website">Leave this field empty<input id="enquiry-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className={styles.consent}><input name="consent" type="checkbox" required /><span>I agree to share these details with Websynk through WhatsApp to discuss my enquiry. Read our <a href="/privacy-policy/">privacy policy</a>.</span></label>
    <p className={styles.note}>This form prepares a WhatsApp message. You review and send it there; submitting this form does not send a message or save an enquiry on this website.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.submit} type="submit" disabled={!ready}>Prepare my free consultation <ArrowUpRight size={17} aria-hidden="true" /></button>
    <div className={styles.feedback} role="status" aria-live="polite">{draftUrl && <><strong>WhatsApp draft ready.</strong><p>Review and send your message in WhatsApp to contact our team.</p><a href={draftUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />Open WhatsApp draft <ArrowUpRight size={16} aria-hidden="true" /></a></>}</div>
    <noscript><p className={styles.note}>This enquiry form needs JavaScript to prepare a message. You can still call us or use the WhatsApp links on this page.</p></noscript>
  </form>;
}
