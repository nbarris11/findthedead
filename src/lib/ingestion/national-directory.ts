import {z} from 'zod';
export const qid=z.string().regex(/^Q[1-9]\d*$/);
const slug=z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const nationalPlaceSchema=z.object({wikidata_id:qid,slug,name:z.string().min(1).max(200),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),state:z.string().nullable(),retrieved_at:z.iso.datetime(),source_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const nationalPersonSchema=z.object({wikidata_id:qid,slug,name:z.string().min(1).max(200),cemetery_wikidata_id:qid,birth_year:z.number().int().min(1).max(2026).nullable(),death_year:z.number().int().min(1).max(2026).nullable(),retrieved_at:z.iso.datetime(),source_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const nationalBatchSchema=z.object({policy:z.literal('wikidata-listing-v1'),batch_id:z.string().regex(/^[a-z0-9-]{1,100}$/),places:z.array(nationalPlaceSchema).min(1).max(2000),records:z.array(nationalPersonSchema).min(1).max(2000)}).strict().superRefine((b,ctx)=>{
 for(const key of ['wikidata_id','slug'] as const){if(new Set(b.records.map(p=>p[key])).size!==b.records.length)ctx.addIssue({code:'custom',message:`Duplicate person ${key}`});if(new Set(b.places.map(p=>p[key])).size!==b.places.length)ctx.addIssue({code:'custom',message:`Duplicate place ${key}`});}
 const places=new Set(b.places.map(p=>p.wikidata_id));for(const p of b.records){if(!places.has(p.cemetery_wikidata_id))ctx.addIssue({code:'custom',message:'Missing cemetery'});if(p.birth_year!==null&&p.death_year!==null&&p.birth_year>p.death_year)ctx.addIssue({code:'custom',message:'Reversed lifespan'});}
});
export function nationalBatchSql(input:unknown){const b=nationalBatchSchema.parse(input);const str=(s:string)=>"'"+s.replaceAll("'","''")+"'";return `begin; set local statement_timeout='90s'; select private.publish_wikidata_listing_batch(${str(b.batch_id)},${str(JSON.stringify(b.records))}::jsonb,${str(JSON.stringify(b.places))}::jsonb) as published; commit;`;}
