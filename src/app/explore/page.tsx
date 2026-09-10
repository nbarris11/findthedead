import type { Metadata } from "next";
import { mapSummary, discoveryCategories } from "@/lib/data/repository";
import { DEFAULT_BOUNDS } from "@/lib/explore/config";
import { ExploreClient } from "@/components/explore/ExploreClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Explore",
  alternates: { canonical: "/explore" },
  robots: { index: false, follow: false },
};

/** Server-fetched first paint: the map has records on screen before Mapbox's
 *  JS finishes loading and before the visitor is asked for their location. */
export default async function ExplorePage() {
  const [initialSummary, categories] = await Promise.all([
    mapSummary(DEFAULT_BOUNDS),
    discoveryCategories(),
  ]);
  return (
    <ExploreClient
      initialSummary={initialSummary}
      categories={categories}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""}
    />
  );
}
