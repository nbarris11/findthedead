import {z} from 'zod';
import {normalizeAuthorityName} from './authority-match.ts';
export const ARLINGTON_DISCLAIMER = 'ArlingtonCemetery.mil and the U.S. Army cannot vouch for the data or analyses derived from these data after the data have been retrieved from ArlingtonCemetery.mil.';
export const directoryRecordSchema=z.object({
 wikidata_id:z.string().regex(/^Q[1-9]\d*$/),slug:z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),name:z.string().min(1).max(200),
 birth_year:z.number().int().min(1000).max(2999),death_year:z.number().int().min(1000).max(2999),
 wikipedia_url:z.url().startsWith('https://en.wikipedia.org/wiki/').nullable(),cemetery_id:z.uuid(),
 provider:z.literal('arlington'),source_record_id:z.string().regex(/^arlington:[1-9]\d*:[1-9]\d*$/),
 source_url:z.url().refine(s=>{const u=new URL(s);return u.origin==='https://wspublic.eiss.army.mil'&&u.pathname==='/IssRetrieveServices.svc/search';}),
 source_sha256:z.string().regex(/^[a-f0-9]{64}$/),retrieved_at:z.iso.datetime(),
 section:z.string().max(200),grave:z.string().max(200),disclaimer:z.literal(ARLINGTON_DISCLAIMER),
}).strict().refine(r=>r.birth_year<=r.death_year,'Invalid lifespan').refine(r=>{
 const u=new URL(r.source_url);return u.searchParams.get('q')===`CemeteryId=46,ISS_ID=${r.source_record_id.split(':')[1]}`&&u.searchParams.get('sortColumn')==='ISS_ID'&&u.searchParams.get('sortOrder')==='asc';
},'Source URL must identify the matched person');
export const directoryBatchSchema=z.object({policy:z.literal('arlington-directory-v1'),batch_id:z.string().regex(/^[a-z0-9][a-z0-9-]{1,100}$/),records:z.array(directoryRecordSchema).min(1).max(200)}).strict().superRefine((batch,ctx)=>{
 for(const key of ['wikidata_id','slug','source_record_id'] as const)if(new Set(batch.records.map(r=>r[key])).size!==batch.records.length)ctx.addIssue({code:'custom',message:`Duplicate ${key}`});
});
export type DirectoryRecord=z.infer<typeof directoryRecordSchema>;
type Statement={rank?:string;mainsnak?:{datavalue?:{value:unknown}};qualifiers?:Record<string,unknown>};
export type DirectoryEntity={id:string;missing?:string;labels?:{en?:{value:string}};claims?:Record<string,Statement[]>;lastrevid?:number};
function statements(entity:DirectoryEntity,p:string){return (entity.claims?.[p]??[]).filter(s=>s.rank!=='deprecated');}
/** This verifies a documentary identity, never physical interment or occupations. */
export function directoryIdentityHolds(entity:DirectoryEntity, source:{name:string;birth_year:number|null;death_year:number|null;birth_date:string|null;death_date:string|null}){
 const holds:string[]=[];
 if(entity.missing!==undefined||normalizeAuthorityName(entity.labels?.en?.value??'')!==normalizeAuthorityName(source.name))holds.push('entity_label_mismatch');
 const values=(p:string)=>statements(entity,p).map(s=>s.mainsnak?.datavalue?.value as {id?:string}|undefined);
 if(!values('P31').some(v=>v?.id==='Q5'))holds.push('human_identity_missing');
 const burials=statements(entity,'P119');
 // Documentary metadata does not assert current remains; keep temporal ends,
 // reinterment reasons, object roles and unknown qualifiers in review.
 const documentaryQualifiers=new Set(['P965','P625','P585','P373','P1442']);
 if(!burials.length||burials.some(s=>(s.mainsnak?.datavalue?.value as {id?:string}|undefined)?.id!=='Q216344'||Object.keys(s.qualifiers??{}).some(key=>!documentaryQualifiers.has(key))))holds.push('burial_claim_conflict_or_qualifier');
 for(const [property,year,date] of [['P569',source.birth_year,source.birth_date],['P570',source.death_year,source.death_date]] as const){
  const dates=statements(entity,property);
  if(!dates.length)holds.push(`${property}_missing`);
  for(const statement of dates){
   const value=statement.mainsnak?.datavalue?.value as {time?:string;precision?:number;calendarmodel?:string;before?:number;after?:number}|undefined;
   if(!value||!value.time||value.precision===undefined||value.precision<9||value.calendarmodel!=='http://www.wikidata.org/entity/Q1985727'||value.before||value.after||Object.keys(statement.qualifiers??{}).length){holds.push(`${property}_precision_or_qualifier`);continue;}
   if(Number(value.time.slice(1,5))!==year)holds.push(`${property}_year_conflict`);
   if(value.precision>=11&&date&&value.time.slice(1,11)!==date)holds.push(`${property}_day_conflict`);
  }
 }
 return [...new Set(holds)];
}
export function directoryBatchSql(value:unknown){
 const batch=directoryBatchSchema.parse(value);
 const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
 return `begin;\nset local statement_timeout = '60s';\nselect private.publish_directory_batch(${literal(batch.batch_id)},${literal(JSON.stringify(batch.records))}::jsonb) as published;\ncommit;\n`;
}
