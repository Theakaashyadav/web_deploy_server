import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'DeployHub · Your deployment workspace', description: 'Self-hosted website deployments, from your first upload to your next release.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
