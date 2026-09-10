/** Read committed cache checkpoints, never alter live collector files or publish. */
import {readFileSync,readdirSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArlingtonPage,arlingtonIdentity,arlingtonOrderGuard} from '../src/lib/ingestion/arlington-api.ts';
import {parseVaRows,vaDate,VA_ENDPOINT} from '../src/lib/ingestion/va-source.ts';
import {createReconciler,createCemeteryResolver,groupReconciledLeads} from '../src/lib/ingestion/bulk-reconcile.ts';
import type {ReconcileCandidate,ReconciledLead} from '../src/lib/ingestion/bulk-reconcile.ts';
const root=resolve('data/ingestion-runs/us-national');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const queueBody=readFileSync(resolve(root,'review-queue.json'),'utf8');
const queueHash=hash(queueBody);
const queue=JSON.parse(queueBody) as ReconcileCandidate[];
const match=createReconciler(queue),cemetery=createCemeteryResolver(queue);
const started=new Date().toISOString();
const out=resolve(root,'bulk-reconciliation',started.replace(/[:.]/g,'-'));
mkdirSync(out,{recursive:true});
const leads:ReconciledLead[]=[];
const manifests:{file:string;sha256:string;rows:number;retrieved_at:string}[]=[];
const ap=read(resolve(root,'arlington-api/progress.json'));
const vp=read(resolve(root,'va-evidence/checkpoint.json'));
if(vp.input_sha256!==queueHash)throw new Error('VA checkpoint queue hash differs; refuse cross-run joins');
const publicPath=process.argv[2];
if(!publicPath)throw new Error('Usage: node --experimental-strip-types scripts/reconcile-bulk-evidence.ts public-identity-snapshot.json');
const publicBody=readFileSync(resolve(publicPath),'utf8');
const publicState=JSON.parse(publicBody) as {retrieved_at:string;people:{wikidata_id:string|null}[]};
const publicAge=Date.now()-Date.parse(publicState.retrieved_at);
if(!Number.isFinite(publicAge)||publicAge<0||publicAge>86400_000)throw new Error('Public identity snapshot must be less than 24 hours old');
let arlingtonRows=0,vaRows=0,vaRepeatedIds=0;
const checkOrder=arlingtonOrderGuard();
const vaSeen=new Map<string,string>();
for(const file of readdirSync(resolve(root,'arlington-api')).filter(f=>/^page-\d+\.json$/.test(f)).sort()){
 const start=Number(file.match(/\d+/)![0]);if(start>=ap.source_records_processed)continue;
 if(start!==arlingtonRows)throw new Error('Noncontiguous Arlington pages');
 const snapshot=read(resolve(root,'arlington-api',file));
 if(hash(snapshot.body)!==snapshot.sha256)throw new Error('Arlington checksum mismatch');
 const u=new URL(snapshot.url);if(u.origin!=='https://wspublic.eiss.army.mil'||u.pathname!=='/IssRetrieveServices.svc/search'||u.searchParams.get('q')!=='CemeteryId=46'||u.searchParams.get('start')!==String(start)||u.searchParams.get('sortColumn')!=='ISS_ID')throw new Error('Unexpected Arlington query');
 const page=parseArlingtonPage(JSON.parse(snapshot.body),start);
 if(page.total!==ap.total_source_records)throw new Error('Arlington total differs from checkpoint');
 for(const row of page.records){checkOrder(row);const id=arlingtonIdentity(row);leads.push(...match({provider:'arlington',record_id:id.record_id,name:id.name,birth_year:id.birth_year,death_year:id.death_year,birth_date:id.birth_date,death_date:id.death_date,cemetery_id:'Q216344',cemetery_name:'Arlington National Cemetery',source_url:snapshot.url,source_sha256:snapshot.sha256,snapshot_file:resolve(root,'arlington-api',file),retrieved_at:snapshot.retrieved_at,section:row.SECTION,grave:row.GRAVE,holds:[...id.flags,'source_snapshot_consistency_unverified',...(ap.source_records_processed<ap.total_source_records?['source_collection_incomplete']:[])]}));}
 arlingtonRows+=page.records.length;manifests.push({file:`arlington-api/${file}`,sha256:snapshot.sha256,rows:page.records.length,retrieved_at:snapshot.retrieved_at});
}
for(const file of readdirSync(resolve(root,'va-evidence')).filter(f=>/^group-\d+-page-\d+\.json$/.test(f)).sort()){
 const [group,page]=file.match(/\d+/g)!.map(Number);
 if(group>vp.group||(group===vp.group&&page>=vp.page))continue;
 const snapshot=read(resolve(root,'va-evidence',file));
 if(snapshot.input_sha256!==queueHash||hash(JSON.stringify(snapshot.rows))!==snapshot.response_sha256)throw new Error('VA provenance mismatch');
 const u=new URL(snapshot.query);if(u.origin+u.pathname!==VA_ENDPOINT)throw new Error('Unexpected VA endpoint');
 const rows=parseVaRows(snapshot.rows);
 for(const row of rows){
  const rowHash=hash(JSON.stringify(row));const seen=vaSeen.get(row.decedent_id);
  if(seen){vaRepeatedIds++;if(seen!==rowHash)throw new Error('VA repeated ID has conflicting content');continue;}vaSeen.set(row.decedent_id,rowHash);
  const birth=vaDate(row.d_birth_date),death=vaDate(row.d_death_date);
  const point=row.location_point as unknown as {coordinates:[number,number]}|undefined;
  const mapped=cemetery(row.cem_name??'',point?.coordinates);
  leads.push(...match({provider:'va',record_id:`va:${row.decedent_id}`,name:[row.d_first_name,row.d_mid_name,row.d_last_name,row.d_suffix].filter(Boolean).join(' '),birth_year:birth?.year??null,death_year:death?.year??null,birth_date:birth?.date??null,death_date:death?.date??null,cemetery_id:mapped,cemetery_name:row.cem_name??'',source_url:snapshot.query,source_sha256:snapshot.response_sha256,snapshot_file:resolve(root,'va-evidence',file),retrieved_at:snapshot.fetched_at,section:row.section_id??'',grave:row.site_num??'',holds:['memorial_status_unknown','va_rows_snapshot_2022','cemetery_crosswalk_requires_review',...(group===vp.group?['source_query_incomplete']:[]),...(vp.capped_groups.includes(group)?['source_query_capped']:[]),...(/\bMEM\b/i.test(row.section_id??'')?['explicit_memorial_section']:[])]}));
 }
 vaRows+=rows.length;manifests.push({file:`va-evidence/${file}`,sha256:snapshot.response_sha256,rows:rows.length,retrieved_at:snapshot.fetched_at});
}
const people=groupReconciledLeads(leads,new Set(publicState.people.map(p=>p.wikidata_id).filter((id):id is string=>!!id)));
const bucketCounts:Record<string,number>={},holdCounts:Record<string,number>={};
const cohorts=new Map<string,{cemetery_id:string;name:string;people:number;exact:number;variants:number;both_sources:number}>();
for(const p of people){bucketCounts[p.bucket]=(bucketCounts[p.bucket]??0)+1;if(p.bucket==='already_public')continue;for(const h of p.holds)holdCounts[h]=(holdCounts[h]??0)+1;
 const id=p.cemetery_id||'unresolved';const c=cohorts.get(id)??{cemetery_id:id,name:queue.find(q=>q.wikidata_id===p.wikidata_id)?.burial_claims.find(c=>c.burial_place_wikidata_id===id)?.burial_place_name??'Unresolved',people:0,exact:0,variants:0,both_sources:0};c.people++;if(p.bucket==='exact_identity_review')c.exact++;if(p.bucket==='name_variant_review')c.variants++;if(p.source_count===2)c.both_sources++;cohorts.set(id,c);
}
const ranked=[...cohorts.values()].sort((a,b)=>b.exact-a.exact||b.people-a.people);
const report={version:1,generated_at:new Date().toISOString(),checkpoint_at:started,queue_sha256:queueHash,public_snapshot_sha256:hash(publicBody),arlington_checkpoint:ap,va_checkpoint:vp,source_rows:{arlington:arlingtonRows,va:vaRows,va_repeat_ids:vaRepeatedIds},unique_candidates_with_leads:people.length,buckets:bucketCounts,hold_counts:holdCounts,cohorts:ranked,source_manifests:manifests,publication_approved:0,note:'Identity review lanes, not publication approval. Name variants, cemetery mappings, source independence and current remains require review. Two government feeds may share upstream records. Source collection continues independently.'};
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
writeFileSync(resolve(out,'people.jsonl'),people.map(p=>JSON.stringify(p)).join('\n')+'\n');
const review=people.filter(p=>p.bucket==='exact_identity_review').sort((a,b)=>a.cemetery_id.localeCompare(b.cemetery_id)||a.name.localeCompare(b.name));
for(let i=0;i<review.length;i+=200)writeFileSync(resolve(out,`review-${String(i/200+1).padStart(3,'0')}.json`),JSON.stringify({status:'needs_review',queue_sha256:queueHash,people:review.slice(i,i+200)},null,2));
const md=['# Bulk evidence reconciliation','',`Snapshot: ${started}. No records approved or published.`,``,`${arlingtonRows.toLocaleString()} Arlington rows + ${vaRows.toLocaleString()} VA rows → ${people.length.toLocaleString()} unique candidates with evidence leads.`,'',...Object.entries(bucketCounts).map(([k,v])=>`- ${k}: ${v}`),'','An exact identity lane is NOT verified interment. Full dates also need original statement precision checks. Multiple source records stay attached, including memorial and conflict flags.','','## Cemetery cohorts','','| Cemetery | Candidates | Exact identity lane | Name variants | Both source feeds |','| --- | ---: | ---: | ---: | ---: |',...ranked.slice(0,30).map(c=>`| ${c.name.replaceAll('|','/')} | ${c.people} | ${c.exact} | ${c.variants} | ${c.both_sources} |`),'','## Remaining review work','',...Object.entries(holdCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}`)].join('\n');
writeFileSync(resolve(out,'REPORT.md'),md);
writeFileSync(resolve(root,'bulk-reconciliation/latest.json.tmp'),JSON.stringify({directory:out,generated_at:report.generated_at}));renameSync(resolve(root,'bulk-reconciliation/latest.json.tmp'),resolve(root,'bulk-reconciliation/latest.json'));
console.log(JSON.stringify({output:out,source_rows:report.source_rows,unique_candidates_with_leads:people.length,buckets:bucketCounts,top_cohorts:ranked.slice(0,10),publication_approved:0},null,2));
