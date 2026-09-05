import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link className="wordmark" href="/">
        FindTheDead.
      </Link>
      <p>Good stories don’t end here.</p>
      <span>Explore thoughtfully. Visit respectfully.</span>
    </footer>
  );
}
