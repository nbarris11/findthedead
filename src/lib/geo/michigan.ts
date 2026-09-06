import boundary from "../../../data/michigan-boundary.json" with { type: "json" };

type Coordinate = readonly [number, number];

const ring = boundary.features[0].geometry.coordinates[0].map(
  ([longitude, latitude]) => [longitude, latitude] as Coordinate,
);

/** Ray-casting against the simplified official Census state boundary. The
 * boundary is intentionally used only as an ingestion filter, not for maps. */
export function isPointInMichigan(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
