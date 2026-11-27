import Link from 'next/link';
export default function NotFound() {
  return <main style={{maxWidth:720,margin:'100px auto',padding:24,lineHeight:1.8}}><p>WEBSYNK TECHNOLOGIES</p><h1>This page could not be found.</h1><p>The address may have changed. Explore our services or contact our Noida team about your project.</p><p><Link href="/">Back to Websynk</Link> · <Link href="/contact-us/">Contact us</Link></p></main>;
}
