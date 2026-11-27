import Link from 'next/link';
export default function NotFound() {
  return <main style={{maxWidth:720,margin:'100px auto',padding:24,lineHeight:1.8}}><p>WEBSYNK TECHNOLOGIES</p><h1>This page could not be found.</h1><p>Our services, company information and contact options are on the Websynk landing page.</p><p><Link href="/">Back to Websynk</Link> · <Link href="/#contact">Contact us</Link></p></main>;
}
