import Link from "next/link";

/** Shared by the marketing pages and the map shell so the brand and the
 *  primary route never drift apart. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="FindTheDead home">
        <span className="brand-symbol" aria-hidden="true">
          ↗
        </span>
        FindTheDead<span className="brand-period">.</span>
      </Link>
      <span className="edition">DETROIT · FIRST EDITION</span>
      <nav className="site-nav" aria-label="Primary">
        <Link className="header-link" href="/explore">
          Explore
        </Link>
        <Link className="header-link" href="/#about">
          The idea <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}
