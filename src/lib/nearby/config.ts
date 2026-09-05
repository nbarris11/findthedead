import { milesToMeters } from "../geo/distance";

/** Radius choices from the product spec. Miles because that's what a US
 *  visitor asks for; meters are an internal query detail. */
export const RADIUS_OPTIONS_MILES = [5, 10, 25, 50] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS_MILES)[number];
export const DEFAULT_RADIUS_MILES: RadiusMiles = 10;

export function radiusMilesToMeters(miles: RadiusMiles): number {
  return milesToMeters(miles);
}

export const SORT_OPTIONS = [
  { value: "nearest", label: "Nearest" },
  { value: "notable", label: "Most notable" },
  { value: "recent", label: "Recently added" },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]["value"];
export const DEFAULT_SORT: SortKey = "nearest";

/** Detroit — the same default region as Explore — so a visitor who declines
 *  location still sees real, labeled results instead of an empty page. */
export const FALLBACK_ORIGIN = { latitude: 42.3897, longitude: -83.0724 };

export const NEARBY_RESULT_LIMIT = 100;
