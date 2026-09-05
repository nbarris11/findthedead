import { METERS_PER_MILE } from "../geo/distance.ts";

/** Distances are always approximate: most records are cemetery-precision.
 *  Never render more precision than the underlying location supports. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "Distance unknown";
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return "Less than 0.1 mi away";
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}

export function formatLifespan(
  birthYear: number | null,
  deathYear: number | null,
): string {
  if (birthYear === null && deathYear === null) return "Dates unknown";
  return `${birthYear ?? "?"} – ${deathYear ?? "?"}`;
}

const PRECISION_LABELS = {
  exact_grave: "Exact grave location",
  cemetery_section: "Cemetery section",
  cemetery: "Cemetery location only",
  approximate: "Approximate location",
  unknown: "Location unknown",
} as const;

/** The product must never imply a cemetery centroid is a grave. */
export function formatPrecision(precision: keyof typeof PRECISION_LABELS) {
  return PRECISION_LABELS[precision] ?? PRECISION_LABELS.unknown;
}

export function pluralizePeople(count: number): string {
  return count === 1
    ? "1 interesting dead person"
    : `${count} interesting dead people`;
}

/** External directions rather than in-app turn-by-turn (see docs/PRODUCT.md).
 *  Takes whichever coordinate the caller has — exact grave or cemetery
 *  centroid — and never claims more precision than that point represents. */
export function directionsUrl(coordinates: {
  latitude: number;
  longitude: number;
}): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${coordinates.latitude},${coordinates.longitude}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
