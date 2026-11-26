import type { Metadata } from 'next';
import './base.css';
export const metadata: Metadata = {
  title: 'Websynk Technologies | Websites, Apps & Digital Marketing',
  description: 'Bring your business online with Websynk Technologies. Website development, app development, digital marketing, SEO, branding and ecommerce solutions.',
  openGraph: {
    title: 'Websynk Technologies — Your next move, made digital',
    description: 'Website and app development, thoughtful design and digital marketing for your next chapter.',
    type: 'website',
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
