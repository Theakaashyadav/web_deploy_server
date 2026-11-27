import type { Metadata, Viewport } from 'next';
import { businessSchema, websiteSchema, siteUrl, serializeSchema, homepageTitle, homepageDescription, pageMetadata } from '../lib/seo';
import './base.css';

export const metadata: Metadata = {
  metadataBase:new URL(siteUrl),...pageMetadata({title:homepageTitle,description:homepageDescription,path:'/'}),
  applicationName:'Websynk Technologies',icons:{icon:'/icon.svg',apple:'/apple-icon.png'},
  ...(process.env.GOOGLE_SITE_VERIFICATION?{verification:{google:process.env.GOOGLE_SITE_VERIFICATION}}:{}),
};
export const viewport: Viewport = {width:'device-width',initialScale:1,themeColor:'#1a282b'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="en-IN"><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeSchema({'@context':'https://schema.org','@graph':[businessSchema,websiteSchema]})}}/>{children}</body></html>;
}
