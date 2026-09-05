import { seedSchema } from "../validation/seed.ts";
import { nearbyQuerySchema, boundsQuerySchema } from "../validation/geo.ts";
import { distanceMeters, isInBounds } from "../geo/distance.ts";
import type { DiscoveryPerson, NearbyPerson } from "../../types/database.ts";
import type { Seed } from "../validation/seed.ts";

export function demoPeople(input: Seed): DiscoveryPerson[] {
  const seed = seedSchema.parse(input);
  return seed.people.map((p) => {
    const c = seed.cemeteries.find((c) => c.id === p.cemetery_id)!;
    return {
      id: p.id,
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
