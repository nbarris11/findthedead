import type { Feature, Polygon, MultiPolygon } from "geojson";
import { buildBurialRadiusQuery } from "./wikidata.ts";

export type Boundary = Feature<Polygon | MultiPolygon, Record<string, string>>;
export type Box = [number, number, number, number];

export function containsPoint(feature: Boundary, longitude: number, latitude: number): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const inRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i];
      const [px, py] = ring[j];
      if ((y > latitude) !== (py > latitude) && longitude < (px - x) * (latitude - y) / (py - y) + x) inside = !inside;
    }
    return inside;
  };
  return polygons.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
}

/** Separate eastern/western longitudes avoids an almost-global Alaska box. */
export function boundaryBoxes(feature: Boundary): Box[] {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const points = polygons.flatMap(p => p[0]);
  const groups = feature.properties.STUSAB === "AK"
    ? [points.filter(p => p[0] < 0), points.filter(p => p[0] >= 0)] : [points];
  return groups.filter(g => g.length).map(g => [
    Math.min(...g.map(p => p[0])), Math.min(...g.map(p => p[1])),
    Math.max(...g.map(p => p[0])), Math.max(...g.map(p => p[1])),
  ]);
}

export function splitBox([west, south, east, north]: Box): Box[] {
  if (east - west > north - south) {
    const mid = (west + east) / 2;
    return [[west, south, mid, north], [mid, south, east, north]];
  }
  const mid = (south + north) / 2;
  return [[west, south, east, mid], [west, mid, east, north]];
}

export function buildBurialBoxQuery(box: Box, limit = 2000, offset?: number): string {
  const [west, south, east, north] = box;
  if (!box.every(Number.isFinite) || west >= east || south >= north || west < -180 || east > 180 || south < -90 || north > 90 || !Number.isInteger(limit) || limit < 1 || limit > 10000)
    throw new Error("Invalid national query bounds or limit");
  if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) throw new Error("Invalid query offset");
  const query = buildBurialRadiusQuery(0, 0, 1, limit).replace(
    /SERVICE wikibase:around \{[\s\S]*?\n  \}/,
    `SERVICE wikibase:box {\n    ?burialPlace wdt:P625 ?burialCoord.\n    bd:serviceParam wikibase:cornerWest "Point(${west} ${south})"^^geo:wktLiteral.\n    bd:serviceParam wikibase:cornerEast "Point(${east} ${north})"^^geo:wktLiteral.\n  }`,
  );
  return offset === undefined ? query : query.replace(`LIMIT ${limit}`, `ORDER BY ?person ?burialPlace ?birth ?death ?image ?article ?burialCoord\nLIMIT ${limit}\nOFFSET ${offset}`);
}
