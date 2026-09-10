import type { Bounds } from '../validation/geo.ts';
import type { DiscoveryPerson } from '../../types/database.ts';
export type MapPoint = Bounds & { latitude: number; longitude: number; count: number };
export type MapSummary = { total: number; points: MapPoint[] };
export type MapPage = { people: DiscoveryPerson[]; next: string | null };
export function summaryFromPeople(people: readonly DiscoveryPerson[]): MapSummary {
 const points = new Map<string,MapPoint>();
 for(const p of people){const key=`${p.longitude},${p.latitude}`;const old=points.get(key);if(old)old.count++;else points.set(key,{latitude:p.latitude,longitude:p.longitude,west:p.longitude,east:p.longitude,south:p.latitude,north:p.latitude,count:1});}
 return {total:people.length,points:[...points.values()]};
}
export function mapFeatures(points: readonly MapPoint[]) {
 return {type:'FeatureCollection' as const,features:points.map((p,id)=>({type:'Feature' as const,id,geometry:{type:'Point' as const,coordinates:[p.longitude,p.latitude]},properties:{...p}}))};
}
export function combinedBounds(points: readonly MapPoint[]): Bounds {
 return {west:Math.min(...points.map(p=>p.west)),east:Math.max(...points.map(p=>p.east)),south:Math.min(...points.map(p=>p.south)),north:Math.max(...points.map(p=>p.north))};
}
/** Mapbox can report wrapped longitudes beyond +-180. */
export function canonicalBounds(b: Bounds): Bounds {
 const wrap=(n:number)=>((n+180)%360+360)%360-180;
 return {west:b.east-b.west>=360?-180:wrap(b.west),east:b.east-b.west>=360?180:wrap(b.east),south:Math.max(-90,b.south),north:Math.min(90,b.north)};
}
