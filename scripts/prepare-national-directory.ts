/** One deterministic local pass over the national source claims and bulk cemetery classification. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {nationalBatchSchema} from '../src/lib/ingestion/national-directory.ts';
import {normalizeAuthorityName} from '../src/lib/ingestion/authority-match.ts';
import {isCoarseBurialPlace} from '../src/lib/ingestion/authority-coverage.ts';
const root=resolve('data/ingestion-runs/us-national');const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const text=readFileSync(root+'/review-queue.json','utf8');const queue=JSON.parse(text);const queueHash=hash(text);
const snapshot=JSON.parse(readFileSync(root+'/national-directory/cemetery-types.json','utf8'));if(hash(snapshot.body)!==snapshot.sha256||Date.now()-Date.parse(snapshot.retrieved_at)>86400000)throw new Error('Cemetery classification invalid/stale');
const types=new Map<string,Set<string>>();for(const row of JSON.parse(snapshot.body).results.bindings){const id=row.place.value.split('/').at(-1)!;const set=types.get(id)??new Set<string>();set.add(row.coord.value);types.set(id,set);}
const pub=JSON.parse(readFileSync(root+'/public-identities.json','utf8'));if(Date.now()-Date.parse(pub.retrieved_at)>86400000)throw new Error('Refresh public identities');const publicIds=new Set(pub.people.map((p:{wikidata_id:string})=>p.wikidata_id));
const names=new Map<string,number>();const places=new Map<string,{names:Set<string>;coords:Set<string>}>();
for(const p of queue){const c=p.burial_claims[0];const key=normalizeAuthorityName(p.name)+':'+c.birth_year+':'+c.death_year;names.set(key,(names.get(key)??0)+1);for(const c of p.burial_claims){const site=places.get(c.burial_place_wikidata_id)??{names:new Set<string>(),coords:new Set<string>()};site.names.add(c.burial_place_name);site.coords.add(c.burial_place_longitude+','+c.burial_place_latitude);places.set(c.burial_place_wikidata_id,site);}}
const held:{id:string;reasons:string[]}[]=[],records:unknown[]=[],siteRecords=new Map<string,unknown>();let cached=0,already=0;
const slug=(name:string,id:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,150).replace(/-$/,'')+'-'+id.toLowerCase();
for(const p of queue){if(publicIds.has(p.wikidata_id)){already++;continue;}const c=p.burial_claims[0],id=c.burial_place_wikidata_id,site=places.get(id)!,coords=types.get(id);const reasons:string[]=[];
 if(!/^Q[1-9]\d*$/.test(p.wikidata_id)||!p.name.trim()||/^Q\d+$/.test(p.name)||p.name.length>200)reasons.push('person_identity_label');
 if(new Set(p.burial_claims.map((c:{burial_place_wikidata_id:string})=>c.burial_place_wikidata_id)).size!==1)reasons.push('multiple_cemeteries');
 if(!coords||coords.size!==1)reasons.push('cemetery_type_or_coordinate_unresolved');
 if(site.names.size!==1||site.coords.size!==1||!c.burial_place_name||/^Q\d+$/.test(c.burial_place_name)||isCoarseBurialPlace(c.burial_place_name))reasons.push('cemetery_identity_conflict');
 if((names.get(normalizeAuthorityName(p.name)+':'+c.birth_year+':'+c.death_year)??0)>1)reasons.push('duplicate_name_and_lifespan');
 if(p.burial_claims.some((x:{source_url:string;retrieved_at:string;wikidata_id:string;name:string;death_year:number})=>{const u=new URL(x.source_url);return u.origin!=='https://query.wikidata.org'||u.pathname!=='/sparql'||!u.searchParams.get('query')?.includes('wdt:P31 wd:Q5')||!u.searchParams.get('query')?.includes('wdt:P570 ?death')||x.wikidata_id!==p.wikidata_id||x.name!==p.name||!Number.isFinite(Date.parse(x.retrieved_at))||Date.now()-Date.parse(x.retrieved_at)>30*86400000||!x.death_year||x.death_year>2026;}))reasons.push('source_identity_or_death_assertion');
 let latitude=0,longitude=0;if(coords?.size===1){const m=[...coords][0].match(/^Point\((-?[\d.]+) (-?[\d.]+)\)$/);if(!m)reasons.push('invalid_coordinate');else{longitude=Number(m[1]);latitude=Number(m[2]);if(Math.abs(longitude-c.burial_place_longitude)>0.01||Math.abs(latitude-c.burial_place_latitude)>0.01)reasons.push('changed_cemetery_coordinate');}}
 let birth_year:number|null=null,death_year:number|null=null;
 const path=root+'/bulk-research/entities/'+p.wikidata_id.slice(-2)+'/'+p.wikidata_id+'.json';
 if(existsSync(path)){cached++;const cache=JSON.parse(readFileSync(path,'utf8'));const e=cache.entity??{};const statements=(prop:string)=>(e.claims?.[prop]??[]).filter((s:{rank:string})=>s.rank!=='deprecated');
  if(e.id!==p.wikidata_id||normalizeAuthorityName(e.labels?.en?.value??'')!==normalizeAuthorityName(p.name))reasons.push('cached_identity_conflict');
  const documentary=new Set(['P965','P625','P585','P373','P1442']);
  if(!statements('P119').length||statements('P119').some((s:{mainsnak:{datavalue?:{value:{id:string}}};qualifiers?:Record<string,unknown>})=>s.mainsnak?.datavalue?.value?.id!==id||Object.keys(s.qualifiers??{}).some(q=>!documentary.has(q))))reasons.push('cached_burial_conflict_or_qualifier');
  for(const [prop,field] of [['P569','birth'],['P570','death']]){const list=statements(prop);const years:number[]=[];let valid=!!list.length;for(const s of list){const v=s.mainsnak?.datavalue?.value;if(!v?.time||v.precision<9||v.calendarmodel!=='http://www.wikidata.org/entity/Q1985727'||v.before||v.after||Object.keys(s.qualifiers??{}).length){valid=false;continue;}years.push(Number(v.time.slice(1,5)));}if(valid&&new Set(years).size===1){if(field==='birth')birth_year=years[0];else death_year=years[0];}}
  if((birth_year!==null&&birth_year!==c.birth_year)||(death_year!==null&&death_year!==c.death_year))reasons.push('cached_date_conflict');
 }
 if(reasons.length){held.push({id:p.wikidata_id,reasons:[...new Set(reasons)]});continue;}
 siteRecords.set(id,{wikidata_id:id,name:c.burial_place_name,slug:slug(c.burial_place_name,id),latitude,longitude,state:c.state_name??null,retrieved_at:snapshot.retrieved_at,source_sha256:snapshot.sha256});
 records.push({wikidata_id:p.wikidata_id,name:p.name,slug:slug(p.name,p.wikidata_id),cemetery_wikidata_id:id,birth_year,death_year,retrieved_at:c.retrieved_at,source_sha256:queueHash});
}
const run='wikidata-listings-'+new Date().toISOString().replace(/\D/g,'').slice(0,14),out=root+'/national-directory/'+run;mkdirSync(out);
let batchNumber=0;for(let i=0;i<records.length;){const size=i===0?20:2000;batchNumber++;const slice=records.slice(i,i+size) as {cemetery_wikidata_id:string}[];const batch=nationalBatchSchema.parse({policy:'wikidata-listing-v1',batch_id:run+'-'+String(batchNumber).padStart(3,'0'),records:slice,places:[...new Set(slice.map(p=>p.cemetery_wikidata_id))].map(id=>siteRecords.get(id))});writeFileSync(out+'/batch-'+String(batchNumber).padStart(3,'0')+'.json',JSON.stringify(batch));i+=size;}
const report={generated_at:new Date().toISOString(),queue:queue.length,already_public:already,eligible:records.length,cemeteries:siteRecords.size,held:held.length,checked_cached_entities:cached,source_sha256:queueHash,classification_sha256:snapshot.sha256,hold_counts:held.flatMap(p=>p.reasons).reduce((a:Record<string,number>,r)=>{a[r]=(a[r]??0)+1;return a;},{}),scope:'Wikidata associations only, not independently confirmed graves. Dates omitted unless original precision checked.',output:out};writeFileSync(out+'/manifest.json',JSON.stringify(report,null,2));writeFileSync(out+'/holds.json',JSON.stringify(held));writeFileSync(root+'/national-directory/latest.json',JSON.stringify({output:out}));console.log(JSON.stringify(report,null,2));
