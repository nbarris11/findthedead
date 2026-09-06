import type { Metadata, Viewport } from "next";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Find the dead. | FindTheDead",
    template: "%s | FindTheDead",
  },
  description: site.description,
  openGraph: {
    title: "Find the dead.",
    description: site.description,
    siteName: site.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Find the dead.",
    description: site.description,
  },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  themeColor: "#101918",
  // The map shell fills the viewport, so the browser chrome must not overlay it.
  viewportFit: "cover",
};

/** Only the document shell lives here. The header, footer and full-bleed map
 *  chrome are chosen per route group. */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
