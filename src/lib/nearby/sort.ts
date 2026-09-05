import type { NearbyPerson } from "../../types/database";
import type { SortKey } from "./config";

/** The API already returns nearest-first; this only reorders for the other
 *  two options, so it's a pure, easily tested transform rather than a query
 *  parameter — no extra round trip when a visitor just changes sort order. */
export function sortNearbyPeople(
  people: readonly NearbyPerson[],
  sort: SortKey,
): NearbyPerson[] {
  const sorted = [...people];
  switch (sort) {
    case "nearest":
      return sorted.sort(
        (a, b) => a.distance_meters - b.distance_meters || a.id.localeCompare(b.id),
      );
    case "notable":
      return sorted.sort(
        (a, b) => b.dead_score - a.dead_score || a.id.localeCompare(b.id),
      );
    case "recent":
      return sorted.sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at) ||
          a.id.localeCompare(b.id),
      );
  }
}
