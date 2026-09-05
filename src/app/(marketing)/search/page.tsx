import type { Metadata } from "next";
import { SearchClient } from "@/components/search/SearchClient";

export const metadata: Metadata = {
  title: "Search",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: false },
};

export default function SearchPage() {
  return (
    <main id="main">
      <SearchClient />
    </main>
  );
}
