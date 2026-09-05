import type { DiscoveryPerson } from "../../types/database.ts";

/** Only what map styling needs. Everything else is looked up by id on the
 *  client, because Mapbox flattens nested feature properties. */
export type PersonFeatureProperties = { id: string; dead_score: number };

export type PersonFeature = {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PersonFeatureProperties;
};

export type PersonFeatureCollection = {
  type: "FeatureCollection";
  features: PersonFeature[];
};

/** Mapbox clustering requires numeric feature ids, so the array index is used.
 *  The stable person id stays in properties. */
export function toFeatureCollection(
  people: readonly DiscoveryPerson[],
): PersonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: people.map((person, index) => ({
      type: "Feature",
      id: index,
      geometry: {
        type: "Point",
        coordinates: [person.longitude, person.latitude],
      },
      properties: { id: person.id, dead_score: person.dead_score },
    })),
  };
}

/** Cemetery-precision records share one coordinate, so a cluster can contain
 *  people who will never separate at any zoom. Roughly one metre. */
const COINCIDENT_DEGREES = 1e-5;

export function isCoincident(
  coordinates: readonly (readonly [number, number])[],
): boolean {
  if (coordinates.length < 2) return true;
  const [firstLng, firstLat] = coordinates[0];
  return coordinates.every(
    ([lng, lat]) =>
      Math.abs(lng - firstLng) < COINCIDENT_DEGREES &&
      Math.abs(lat - firstLat) < COINCIDENT_DEGREES,
  );
}
