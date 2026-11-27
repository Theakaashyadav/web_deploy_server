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
  return <html lang="en-IN"><head>
    <script id="google-tag-manager-init" dangerouslySetInnerHTML={{__html:"window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date());"}} />
    <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-P7S6T33L" />
  </head><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeSchema({'@context':'https://schema.org','@graph':[businessSchema,websiteSchema]})}}/>{children}</body></html>;
}
