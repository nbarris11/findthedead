import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import seedInput from "../../../data/detroit.seed.json";
import { seedSchema } from "../validation/seed";
import { boundsQuerySchema, nearbyQuerySchema } from "../validation/geo";
import { dataConfig } from "./config";
import { demoNearby, demoInBounds } from "./demo";
import type {
  Database,
  NearbyPerson,
  DiscoveryPerson,
} from "../../types/database";

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
