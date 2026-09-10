/** Prepare documentary entries from the complete Arlington snapshot and fresh entity checks. */
import {readFileSync,writeFileSync,readdirSync,mkdirSync,renameSync,unlinkSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {parseArlingtonPage,arlingtonIdentity,arlingtonOrderGuard} from '../src/lib/ingestion/arlington-api.ts';
import {normalizeAuthorityName} from '../src/lib/ingestion/authority-match.ts';
import {directoryIdentityHolds,directoryBatchSchema,ARLINGTON_DISCLAIMER} from '../src/lib/ingestion/directory-batch.ts';
import type {DirectoryEntity,DirectoryRecord} from '../src/lib/ingestion/directory-batch.ts';
import type {ReconcileCandidate} from '../src/lib/ingestion/bulk-reconcile.ts';
import {WIKIDATA_USER_AGENT} from '../src/lib/ingestion/wikidata.ts';
const root=resolve('data/ingestion-runs/us-national'),work=resolve(root,'directory-preparation');mkdirSync(work,{recursive:true});
const lock=resolve(work,'run.lock');writeFileSync(lock,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}),{flag:'wx'});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const atomic=(name:string,value:unknown)=>{const path=resolve(work,name);writeFileSync(path+'.tmp',JSON.stringify(value));renameSync(path+'.tmp',path);};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const queueText=readFileSync(resolve(root,'review-queue.json'),'utf8'),queue=JSON.parse(queueText) as ReconcileCandidate[];
 const progress=JSON.parse(readFileSync(resolve(root,'arlington-api/progress.json'),'utf8'));
 if(progress.status!=='complete'||progress.source_records_processed!==progress.total_source_records)throw new Error('Complete Arlington collection required');
 const signature=(name:string,birth:number|null,death:number|null)=>`${normalizeAuthorityName(name)}:${birth}:${death}`;
 const candidateIndex=new Map<string,ReconcileCandidate[]>();
 for(const p of queue){const years=[...new Set(p.burial_claims.map(c=>`${c.birth_year}:${c.death_year}`))];if(years.length!==1)continue;
  const c=p.burial_claims[0];const key=signature(p.name,c.birth_year,c.death_year);candidateIndex.set(key,[...(candidateIndex.get(key)??[]),p]);}
 const matches:{candidate:ReconcileCandidate;source:ReturnType<typeof arlingtonIdentity>;section:string;grave:string;retrieved_at:string;sha256:string;file:string}[]=[];
 const counts=new Map<string,number>(),personCounts=new Map<number,number>();let rows=0;const order=arlingtonOrderGuard();
 for(const file of readdirSync(resolve(root,'arlington-api')).filter(f=>/^page-\d+\.json$/.test(f)).sort()){
  const snapshot=JSON.parse(readFileSync(resolve(root,'arlington-api',file),'utf8'));
  const start=Number(file.match(/\d+/)![0]);
  if(start!==rows||hash(snapshot.body)!==snapshot.sha256)throw new Error('Arlington snapshot sequence/checksum failure');
  const u=new URL(snapshot.url);if(u.origin!=='https://wspublic.eiss.army.mil'||u.pathname!=='/IssRetrieveServices.svc/search'||u.searchParams.get('q')!=='CemeteryId=46'||u.searchParams.get('start')!==String(start))throw new Error('Unexpected source snapshot URL');
  const page=parseArlingtonPage(JSON.parse(snapshot.body),start);if(page.total!==progress.total_source_records)throw new Error('Changing source total');
  for(const row of page.records){order(row);personCounts.set(row.ISS_ID,(personCounts.get(row.ISS_ID)??0)+1);const source=arlingtonIdentity(row);const key=signature(source.name,source.birth_year,source.death_year);counts.set(key,(counts.get(key)??0)+1);
   const named=candidateIndex.get(key)??[];if(named.length!==1)continue;const p=named[0];
   if(p.burial_claims.some(c=>c.burial_place_wikidata_id!=='Q216344'))continue;
   if(source.flags.some(f=>f!=='interment_vs_memorial_unverified'&&!f.endsWith('_date_year_only')))continue;
   if(/\bMEM\b/i.test(row.SECTION+' '+row.GRAVE))continue;
   matches.push({candidate:p,source,section:row.SECTION,grave:row.GRAVE,retrieved_at:snapshot.retrieved_at,sha256:snapshot.sha256,file:resolve(root,'arlington-api',file)});
  }
  rows+=page.records.length;
 }
 if(rows!==progress.total_source_records)throw new Error('Source collection incomplete');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});
 const publicIds=new Set<string>();let offset=0;
 for(;;){const r=await db.from('people').select('wikidata_id').order('id').range(offset,offset+999);if(r.error)throw r.error;for(const p of r.data)publicIds.add(p.wikidata_id);if(r.data.length<1000)break;offset+=1000;}
 const {data:site,error}=await db.from('cemeteries').select('id,name').eq('name','Arlington National Cemetery').single();if(error)throw error;
 const sourceRef=await db.from('sources').select('id').eq('cemetery_id',site.id).eq('external_id','Q216344');if(sourceRef.error||sourceRef.data.length!==1)throw new Error('Cemetery crosswalk not unique');
 const selected=matches.filter(m=>counts.get(signature(m.source.name,m.source.birth_year,m.source.death_year))===1&&personCounts.get(Number(m.source.source_record_id.split(':')[1]))===1&&!publicIds.has(m.candidate.wikidata_id));
 const held:{id:string;reasons:string[]}[]=[],records:DirectoryRecord[]=[],evidence:unknown[]=[];
 let requests=0;
 for(let i=0;i<selected.length;i+=25){
  const slice=selected.slice(i,i+25),ids=slice.map(m=>m.candidate.wikidata_id);const cacheName=`entities-${hash(ids.join('|')).slice(0,20)}.json`;const cachePath=resolve(work,cacheName);
  let response:{retrieved_at:string;sha256:string;body:string};
  if(existsSync(cachePath)){response=JSON.parse(readFileSync(cachePath,'utf8'));if(hash(response.body)!==response.sha256||Date.now()-Date.parse(response.retrieved_at)>86400_000)throw new Error('Entity cache expired or changed');}
  else{
   const url='https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'info|claims|labels',languages:'en',format:'json',maxlag:'5'});
   let body='';for(let attempt=0;attempt<5;attempt++){
    await sleep(1500);requests++;const r=await fetch(url,{headers:{'User-Agent':WIKIDATA_USER_AGENT},signal:AbortSignal.timeout(45000)});
    if(r.status===429||r.status>=500){await r.body?.cancel();await sleep(Math.min(30000,Number(r.headers.get('retry-after')??'2')*1000||5000));continue;}
    if(!r.ok)throw new Error(`Wikidata HTTP ${r.status}`);body=await r.text();if(body.length>20_000_000)throw new Error('Entity response exceeds size cap');const data=JSON.parse(body);if(data.error){if(data.error.code==='maxlag'){body='';await sleep(5000);continue;}throw new Error('Wikidata API error');}break;
   }
   if(!body||JSON.parse(body).error)throw new Error('Wikidata retries exhausted');response={retrieved_at:new Date().toISOString(),sha256:hash(body),body};atomic(cacheName,response);
  }
  const entities=JSON.parse(response.body).entities as Record<string,DirectoryEntity>;
  for(const m of slice){const entity=entities[m.candidate.wikidata_id];if(!entity||entity.id!==m.candidate.wikidata_id){held.push({id:m.candidate.wikidata_id,reasons:['entity_identity_missing']});continue;}
   const reasons=directoryIdentityHolds(entity,m.source);
   if(reasons.length){held.push({id:m.candidate.wikidata_id,reasons});continue;}
   const iss=m.source.source_record_id.split(':')[1];const url='https://wspublic.eiss.army.mil/IssRetrieveServices.svc/search?'+new URLSearchParams({q:`CemeteryId=46,ISS_ID=${iss}`,sortColumn:'ISS_ID',sortOrder:'asc',start:'0',limit:'1000'});
   records.push({wikidata_id:m.candidate.wikidata_id,slug:m.candidate.slug,name:entity.labels!.en!.value,birth_year:m.source.birth_year!,death_year:m.source.death_year!,wikipedia_url:m.candidate.wikipedia_url,cemetery_id:site.id,provider:'arlington',source_record_id:m.source.source_record_id,source_url:url,source_sha256:m.sha256,retrieved_at:m.retrieved_at,section:m.section,grave:m.grave,disclaimer:ARLINGTON_DISCLAIMER});
   evidence.push({wikidata_id:entity.id,entity_revision:entity.lastrevid,entity_snapshot:cachePath,entity_sha256:response.sha256,source_snapshot:m.file,source_sha256:m.sha256,scope:'Documentary identity and cemetery record; current physical interment is unconfirmed.'});
  }
  atomic('progress.json',{status:'running',pid:process.pid,candidates:selected.length,checked:Math.min(i+25,selected.length),eligible:records.length,held:held.length,requests});
  if(i===0||i%100===0)console.log(`Directory checks: ${Math.min(i+25,selected.length)}/${selected.length}; ${records.length} eligible documentary entries.`);
 }
 const runId='arlington-directory-'+new Date().toISOString().replace(/\D/g,'').slice(0,14);const output=resolve(work,runId);mkdirSync(output);
 records.sort((a,b)=>a.wikidata_id.localeCompare(b.wikidata_id));
 for(let i=0;i<records.length;i+=200){const batch=directoryBatchSchema.parse({policy:'arlington-directory-v1',batch_id:`${runId}-${String(i/200+1).padStart(3,'0')}`,records:records.slice(i,i+200)});writeFileSync(resolve(output,`batch-${String(i/200+1).padStart(3,'0')}.json`),JSON.stringify(batch,null,2));}
 const report={status:'complete',generated_at:new Date().toISOString(),queue_sha256:hash(queueText),source_rows:rows,identity_candidates:selected.length,eligible_directory_records:records.length,held,entity_and_source_evidence:evidence,scope:'Cemetery records only, not verified physical burials; exact days, roles, images and biographies omitted.',output};
 writeFileSync(resolve(output,'manifest.json'),JSON.stringify(report,null,2));atomic('progress.json',{...report,held:held.length,entity_and_source_evidence:undefined});atomic('latest.json',{output});console.log(JSON.stringify({source_rows:rows,identity_candidates:selected.length,eligible:records.length,held:held.length,output}));
}
main().catch(e=>{atomic('error.json',{at:new Date().toISOString(),error:String(e)});console.error(e);process.exitCode=1;}).finally(()=>unlinkSync(lock));
