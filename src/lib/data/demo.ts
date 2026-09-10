import { seedSchema } from "../validation/seed.ts";
import { nearbyQuerySchema, boundsQuerySchema } from "../validation/geo.ts";
import { searchQuerySchema } from "../validation/search.ts";
import { distanceMeters, isInBounds } from "../geo/distance.ts";
import type {
  DiscoveryPerson,
  NearbyPerson,
  ProfilePerson,
  CemeteryProfile,
} from "../../types/database.ts";
import type { Seed } from "../validation/seed.ts";

export function demoPeople(input: Seed): DiscoveryPerson[] {
  const seed = seedSchema.parse(input);
  return seed.people.map((p) => {
    const c = seed.cemeteries.find((c) => c.id === p.cemetery_id)!;
    return {
      id: p.id,
      profile_tier: "profile",
      slug: p.slug,
      name: p.name,
      birth_year: p.birth_year,
      death_year: p.death_year,
      short_description: p.short_description,
      dead_score: p.dead_score,
      burial_id: p.burial_id,
      cemetery_id: c.id,
      cemetery_name: c.name,
      location_precision: p.location_precision,
      location_confidence: p.location_confidence,
      latitude: c.latitude,
      longitude: c.longitude,
      categories: p.categories,
      // The whole fixture batch was added in one import; retrieved_at is the
      // real timestamp of that, not a per-person value invented for sorting.
      created_at: seed.retrieved_at,
    };
  });
}
export function demoNearby(input: Seed, query: unknown): NearbyPerson[] {
  const q = nearbyQuerySchema.parse(query);
  return demoPeople(input)
    .map((p) => ({ ...p, distance_meters: distanceMeters(q, p) }))
    .filter(
      (p) =>
        p.distance_meters <= q.radius_meters &&
        p.dead_score >= q.min_score &&
        (!q.category_slug || p.categories.includes(q.category_slug)),
    )
    .sort(
      (a, b) =>
        a.distance_meters - b.distance_meters ||
        b.dead_score - a.dead_score ||
        a.id.localeCompare(b.id),
    )
    .slice(0, q.result_limit);
}
export function demoInBounds(input: Seed, query: unknown): DiscoveryPerson[] {
  const q = boundsQuerySchema.parse(query);
  return demoPeople(input)
    .filter(
      (p) =>
        isInBounds(p, q) &&
        p.dead_score >= q.min_score &&
        (!q.category_slug || p.categories.includes(q.category_slug)),
    )
    .sort((a, b) => b.dead_score - a.dead_score || a.id.localeCompare(b.id))
    .slice(0, q.result_limit);
}

export function demoPersonProfile(input: Seed, slug: string): ProfilePerson | null {
  const seed = seedSchema.parse(input);
  const p = seed.people.find((p) => p.slug === slug);
  if (!p) return null;
  const c = seed.cemeteries.find((c) => c.id === p.cemetery_id)!;
  return {
    id: p.id,
    profile_tier: "profile",
    record_details: null,
    slug: p.slug,
    name: p.name,
    birth_year: p.birth_year,
    death_year: p.death_year,
    birth_date: p.birth_date,
    death_date: p.death_date,
    short_description: p.short_description,
    biography: p.biography,
    why_interesting: p.why_interesting,
    wikidata_id: null,
    wikipedia_url: null,
    dead_score: p.dead_score,
    burial_id: p.burial_id,
    cemetery_id: c.id,
    cemetery_name: c.name,
    location_precision: p.location_precision,
    location_confidence: p.location_confidence,
    latitude: c.latitude,
    longitude: c.longitude,
    categories: p.categories,
    created_at: seed.retrieved_at,
    cemetery: {
      slug: c.slug,
      name: c.name,
      city: c.city,
      state: c.state,
      country: c.country,
      website_url: null,
    },
    images: [],
    // Mirrors build-seed.ts: the first and third rows cite the same cemetery
    // listing URL (person facts, then burial), while the profile row — when
    // present — cites the person's own article instead.
    sources: [
      {
        source_type: "wikipedia" as const,
        url: p.source_url,
        field: "name,birth_year,death_year,short_description",
        retrieved_at: seed.retrieved_at,
        confidence: 0.75,
        notes:
          "Short original factual label; dates are years only. Publication review pending.",
      },
      ...(p.profile_source_url !== null
        ? [
            {
              source_type: "wikipedia" as const,
              url: p.profile_source_url,
              field: "birth_date,biography,why_interesting",
              retrieved_at: seed.retrieved_at,
              confidence: 0.8,
              notes: "Person's own article; biography paraphrased, not copied.",
            },
          ]
        : []),
      {
        source_type: "wikipedia" as const,
        url: p.source_url,
        field: "cemetery_id",
        retrieved_at: seed.retrieved_at,
        confidence: p.location_confidence,
        notes: "Listed burial; no exact grave coordinate claimed.",
      },
    ],
  };
}

export function demoCemeteryProfile(
  input: Seed,
  slug: string,
): CemeteryProfile | null {
  const seed = seedSchema.parse(input);
  const c = seed.cemeteries.find((c) => c.slug === slug);
  if (!c) return null;
  const people = demoPeople(seed)
    .filter((p) => p.cemetery_id === c.id)
    .sort((a, b) => b.dead_score - a.dead_score || a.id.localeCompare(b.id));
  const categorySlugs = new Set(people.flatMap((p) => p.categories));
  const categories = seed.categories
    .filter((cat) => categorySlugs.has(cat.slug))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ slug, name }) => ({ slug, name }));
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    city: c.city,
    state: c.state,
    country: c.country,
    website_url: null,
    description: null,
    latitude: c.latitude,
    longitude: c.longitude,
    people,
    categories,
    sources: [
      {
        source_type: "wikipedia",
        url: c.source_url,
        field: "name,city,state,country,location",
        retrieved_at: seed.retrieved_at,
        confidence: 0.75,
        notes: "Cemetery reference point only; not an entrance or grave.",
      },
    ],
  };
}

/** Approximates search_people's per-word prefix-AND matching without a real
 *  tsvector index: every query word must prefix-match some word in the
 *  person's name. Relevance ranking isn't replicated offline — this only
 *  needs to return the same matches for local development, not the same
 *  order as ts_rank. */
export function demoSearchPeople(input: Seed, query: unknown): DiscoveryPerson[] {
  const { q, result_limit } = searchQuerySchema.parse(query);
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length > 0);
  if (words.length === 0) return [];
  return demoPeople(input)
    .filter((p) => {
      const nameWords = p.name.toLowerCase().split(/\s+/);
      return words.every((w) => nameWords.some((nw) => nw.startsWith(w)));
    })
    .sort((a, b) => b.dead_score - a.dead_score || a.id.localeCompare(b.id))
    .slice(0, result_limit);
}
