import type { Metadata } from 'next';
import './base.css';
export const metadata: Metadata = {
  title: 'Websynk Technologies | Web, App & Digital Growth Agency in Noida',
  description: 'Established in 2021, Websynk Technologies has delivered 2,000+ projects. Discover website and app development, branding, SEO and digital marketing from our Noida team.',
  openGraph: {
    title: 'Websynk Technologies | Your Digital Growth Partner Since 2021',
    description: 'Your digital growth partner since 2021. More than 2,000 projects delivered across web development, apps, design and digital marketing. Based in Sector 142, Noida.',
    type: 'website',
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
