import {
  coordinatesSchema,
  boundsSchema,
  type Coordinates,
  type Bounds,
} from "../validation/geo.ts";
export const METERS_PER_MILE = 1609.344;
export function milesToMeters(miles: number): number {
  if (!Number.isFinite(miles) || miles < 0)
    throw new RangeError("Miles must be finite and nonnegative");
  return miles * METERS_PER_MILE;
}
/** Offline approximation only. Production distances come from PostGIS geography. */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  coordinatesSchema.parse(from);
  coordinatesSchema.parse(to);
  const rad = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(rad(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(rad(from.latitude)) *
      Math.cos(rad(to.latitude)) *
      Math.sin(rad(to.longitude - from.longitude) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function isInBounds(point: Coordinates, bounds: Bounds): boolean {
  coordinatesSchema.parse(point);
  boundsSchema.parse(bounds);
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    (bounds.west <= bounds.east
      ? point.longitude >= bounds.west && point.longitude <= bounds.east
      : point.longitude >= bounds.west || point.longitude <= bounds.east)
  );
}
