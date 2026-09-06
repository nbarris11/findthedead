export type MichiganIngestionTarget = {
  label: string;
  region: "Upper Peninsula" | "Northern Lower" | "West Michigan" | "Mid Michigan" | "East Michigan";
  latitude: number;
  longitude: number;
};

/** Regional search hubs fill the gaps between the five launch metros. These
 * are discovery centers, not location-page targets or claims of coverage. */
export const MICHIGAN_INGESTION_TARGETS: readonly MichiganIngestionTarget[] = [
  { label: "Houghton", region: "Upper Peninsula", latitude: 47.1211, longitude: -88.5694 },
  { label: "Marquette", region: "Upper Peninsula", latitude: 46.5436, longitude: -87.3954 },
  { label: "Escanaba", region: "Upper Peninsula", latitude: 45.7452, longitude: -87.0646 },
  { label: "Sault Ste. Marie", region: "Upper Peninsula", latitude: 46.4953, longitude: -84.3453 },
  { label: "Traverse City", region: "Northern Lower", latitude: 44.7631, longitude: -85.6206 },
  { label: "Cadillac", region: "Northern Lower", latitude: 44.2519, longitude: -85.4012 },
  { label: "Alpena", region: "Northern Lower", latitude: 45.0617, longitude: -83.4328 },
  { label: "Muskegon", region: "West Michigan", latitude: 43.2342, longitude: -86.2484 },
  { label: "Kalamazoo", region: "West Michigan", latitude: 42.2917, longitude: -85.5872 },
  { label: "Benton Harbor", region: "West Michigan", latitude: 42.1167, longitude: -86.4542 },
  { label: "Mount Pleasant", region: "Mid Michigan", latitude: 43.5978, longitude: -84.7675 },
  { label: "Bay City", region: "Mid Michigan", latitude: 43.5945, longitude: -83.8889 },
  { label: "Jackson", region: "Mid Michigan", latitude: 42.2459, longitude: -84.4013 },
  { label: "Port Huron", region: "East Michigan", latitude: 42.9709, longitude: -82.4249 },
] as const;
