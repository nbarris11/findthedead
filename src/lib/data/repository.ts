import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import seedInput from "../../../data/detroit.seed.json";
import { seedSchema } from "../validation/seed";
import { boundsQuerySchema, nearbyQuerySchema } from "../validation/geo";
import { slugSchema } from "../validation/slug";
import { searchQuerySchema } from "../validation/search";
import { dataConfig } from "./config";
import {
  demoNearby,
  demoInBounds,
  demoPersonProfile,
  demoCemeteryProfile,
  demoSearchPeople,
} from "./demo";
import type {
  Database,
  NearbyPerson,
  DiscoveryPerson,
  CategoryOption,
  ProfilePerson,
  CemeteryProfile,
} from "../../types/database";

export type PublicSiteRecord = {
  slug: string;
  updated_at?: string;
};

const seed = seedSchema.parse(seedInput);
function client() {
  const config = dataConfig(process.env);
  if (config.mode !== "supabase")
    throw new Error("Supabase client requested in demo mode");
  return createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function nearbyPeople(query: unknown): Promise<NearbyPerson[]> {
  const args = nearbyQuerySchema.parse(query);
  if (dataConfig(process.env).mode === "demo") return demoNearby(seed, args);
  const { data, error } = await client().rpc("nearby_people", args);
  if (error)
    throw new Error("Nearby records could not be loaded", { cause: error });
  return (data ?? []).map(({ latitude_out, longitude_out, ...p }) => ({
    ...p,
    latitude: latitude_out,
    longitude: longitude_out,
  }));
}
export async function peopleInBounds(
  query: unknown,
): Promise<DiscoveryPerson[]> {
  const args = boundsQuerySchema.parse(query);
  if (dataConfig(process.env).mode === "demo") return demoInBounds(seed, args);
  const { data, error } = await client().rpc("people_in_bounds", args);
  if (error)
    throw new Error("Map records could not be loaded", { cause: error });
  return data ?? [];
}
// Request-level deduplication only; no visitor location is retained in a global cache.
export const featuredPeople = cache(async () => {
  if (dataConfig(process.env).mode === "demo") {
    return {
      isDemo: true,
      people: seed.people
        .filter((p) => p.is_featured)
        .map((p) => ({
          id: p.id,
          name: p.name,
          birth_year: p.birth_year,
          death_year: p.death_year,
          short_description: p.short_description,
        })),
    };
  }
  const { data, error } = await client()
    .from("people")
    .select("id,name,birth_year,death_year,short_description")
    .eq("is_featured", true)
    .order("dead_score", { ascending: false })
    .limit(3);
  if (error)
    throw new Error("Featured records could not be loaded", { cause: error });
  return { isDemo: false, people: data ?? [] };
});

/** Public profile URLs for sitemap generation. In database mode, anon RLS is
 *  the publication gate, so drafts and fixtures cannot enter the sitemap. */
export async function publicSiteRecords(): Promise<{
  people: PublicSiteRecord[];
  cemeteries: PublicSiteRecord[];
}> {
  if (dataConfig(process.env).mode === "demo") {
    return {
      people: seed.people.map(({ slug }) => ({ slug })),
      cemeteries: seed.cemeteries.map(({ slug }) => ({ slug })),
    };
  }
  const db = client();
  const [peopleResult, cemeteriesResult] = await Promise.all([
    db.from("people").select("slug,updated_at").order("slug"),
    db.from("cemeteries").select("slug,updated_at").order("slug"),
  ]);
  if (peopleResult.error)
    throw new Error("Public person URLs could not be loaded", {
      cause: peopleResult.error,
    });
  if (cemeteriesResult.error)
    throw new Error("Public cemetery URLs could not be loaded", {
      cause: cemeteriesResult.error,
    });
  return {
    people: peopleResult.data ?? [],
    cemeteries: cemeteriesResult.data ?? [],
  };
}

/** Categories drive the explore filters, so the UI never hardcodes them.
 *  Request-level deduplication only; the list carries no visitor data. */
export const discoveryCategories = cache(
  async (): Promise<CategoryOption[]> => {
    if (dataConfig(process.env).mode === "demo") {
      return [...seed.categories]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ slug, name }) => ({ slug, name }));
    }
    const { data, error } = await client()
      .from("categories")
      .select("slug,name")
      .order("sort_order", { ascending: true });
    if (error)
      throw new Error("Categories could not be loaded", { cause: error });
    return data ?? [];
  },
);

/** A person page needs fields no discovery feed does (biography, external
 *  IDs, provenance), so this reads the base tables directly rather than
 *  reusing the discovery_people view for more than its coordinate/precision
 *  serialization. Returns null for missing OR unpublished/fixture people —
 *  RLS enforces that distinction identically, so a 404 never leaks which. */
export async function personProfile(slug: unknown): Promise<ProfilePerson | null> {
  const s = slugSchema.parse(slug);
  if (dataConfig(process.env).mode === "demo")
    return demoPersonProfile(seed, s);
  const db = client();
  const { data: discovery, error: discoveryError } = await db
    .from("discovery_people")
    .select("*")
    .eq("slug", s)
    .maybeSingle();
  if (discoveryError)
    throw new Error("Person could not be loaded", { cause: discoveryError });
  if (!discovery) return null;
  const [personResult, cemeteryResult, imagesResult, sourcesResult] =
    await Promise.all([
      db
        .from("people")
        .select(
          "birth_date,death_date,biography,why_interesting,wikidata_id,wikipedia_url",
        )
        .eq("id", discovery.id)
        .single(),
      discovery.cemetery_id
        ? db
            .from("cemeteries")
            .select("slug,name,city,state,country,website_url")
            .eq("id", discovery.cemetery_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
      db
        .from("images")
        .select("url,alt_text,creator,license,attribution,is_primary")
        .eq("person_id", discovery.id)
        .order("is_primary", { ascending: false }),
      db
        .from("sources")
        .select("source_type,url,field,retrieved_at,confidence,notes")
        .or(`person_id.eq.${discovery.id},burial_id.eq.${discovery.burial_id}`),
    ]);
  if (personResult.error)
    throw new Error("Person details could not be loaded", {
      cause: personResult.error,
    });
  if (cemeteryResult.error)
    throw new Error("Cemetery details could not be loaded", {
      cause: cemeteryResult.error,
    });
  if (imagesResult.error)
    throw new Error("Images could not be loaded", { cause: imagesResult.error });
  if (sourcesResult.error)
    throw new Error("Sources could not be loaded", {
      cause: sourcesResult.error,
    });
  return {
    ...discovery,
    ...personResult.data,
    cemetery: cemeteryResult.data,
    images: imagesResult.data ?? [],
    sources: sourcesResult.data ?? [],
  };
}

/** The cemetery's own coordinate (not a person's effective discovery point)
 *  comes from cemetery_by_slug; its notable people reuse discovery_people
 *  filtered by cemetery_id so the list is identically shaped to every other
 *  discovery read in the app. */
export async function cemeteryProfile(
  slug: unknown,
): Promise<CemeteryProfile | null> {
  const s = slugSchema.parse(slug);
  if (dataConfig(process.env).mode === "demo")
    return demoCemeteryProfile(seed, s);
  const db = client();
  const { data: rows, error } = await db.rpc("cemetery_by_slug", {
    p_slug: s,
  });
  if (error)
    throw new Error("Cemetery could not be loaded", { cause: error });
  const cemetery = rows?.[0];
  if (!cemetery) return null;
  const [peopleResult, sourcesResult, categories] = await Promise.all([
    db
      .from("discovery_people")
      .select("*")
      .eq("cemetery_id", cemetery.id)
      .order("dead_score", { ascending: false }),
    db
      .from("sources")
      .select("source_type,url,field,retrieved_at,confidence,notes")
      .eq("cemetery_id", cemetery.id),
    discoveryCategories(),
  ]);
  if (peopleResult.error)
    throw new Error("Cemetery's people could not be loaded", {
      cause: peopleResult.error,
    });
  if (sourcesResult.error)
    throw new Error("Cemetery sources could not be loaded", {
      cause: sourcesResult.error,
    });
  const people = peopleResult.data ?? [];
  const categorySlugs = new Set(people.flatMap((p) => p.categories));
  return {
    id: cemetery.id,
    slug: cemetery.slug,
    name: cemetery.name,
    description: cemetery.description,
    city: cemetery.city,
    state: cemetery.state,
    country: cemetery.country,
    website_url: cemetery.website_url,
    latitude: cemetery.latitude,
    longitude: cemetery.longitude,
    people,
    categories: categories.filter((c) => categorySlugs.has(c.slug)),
    sources: sourcesResult.data ?? [],
  };
}

/** Only person search is implemented — see docs/PRODUCT.md for why cemetery
 *  search is deliberately not built yet even though the result type already
 *  carries a person/cemetery discriminant. */
export async function searchPeople(query: unknown): Promise<DiscoveryPerson[]> {
  const args = searchQuerySchema.parse(query);
  if (dataConfig(process.env).mode === "demo")
    return demoSearchPeople(seed, args);
  const { data, error } = await client().rpc("search_people", args);
  if (error)
    throw new Error("Search results could not be loaded", { cause: error });
  return data ?? [];
}
