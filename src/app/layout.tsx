import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { site } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: 'Find the dead. | FindTheDead', template: '%s | FindTheDead' },
  description: site.description,
  openGraph: { title: 'Find the dead.', description: site.description, siteName: site.name, type: 'website' },
  robots: { index: false, follow: false }, // Foundation preview; enable only after editorial launch review.
};
export const viewport: Viewport = { themeColor: '#101918' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><Link className="wordmark" href="/" aria-label="FindTheDead home"><span className="brand-symbol" aria-hidden="true">↗</span>FindTheDead<span className="brand-period">.</span></Link><span className="edition">DETROIT · FIRST EDITION</span><a className="header-link" href="#about">The idea <span aria-hidden="true">↗</span></a></header>
    {children}
    <footer className="site-footer"><Link className="wordmark" href="/">FindTheDead.</Link><p>Good stories don’t end here.</p><span>Explore thoughtfully. Visit respectfully.</span></footer>
  </body></html>;
}
