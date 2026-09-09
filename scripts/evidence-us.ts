/** Preserve statement-level evidence, including missing references and ranks. */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WIKIDATA_USER_AGENT } from "../src/lib/ingestion/wikidata.ts";

type Snak = { datavalue?: { value: {id?: string} | string } };
type Claim = { id:string; rank:string; mainsnak:Snak; references?: {snaks:Record<string,Snak[]>}[]; qualifiers?:unknown };
type Entity = {id:string; lastrevid?:number; claims?:Record<string,Claim[]>};
const index=process.argv.indexOf("--output");
const root=resolve(index<0?"data/ingestion-runs/us-national":process.argv[index+1]);
const directory=resolve(root,"evidence");
mkdirSync(directory,{recursive:true});

async function main() {
  const ids=readdirSync(resolve(root,"research")).filter(f=>/^Q\d+\.json$/.test(f)).map(f=>f.slice(0,-5));
  const pending=ids.filter(id=>!existsSync(resolve(directory,`${id}.json`)));
  for(let offset=0;offset<pending.length;offset+=20) {
    const batch=pending.slice(offset,offset+20);
    const url=`https://www.wikidata.org/w/api.php?${new URLSearchParams({action:"wbgetentities",ids:batch.join("|"),props:"claims",format:"json"})}`;
    let response: {entities:Record<string,Entity>} | null=null;
    for(let attempt=0;attempt<4;attempt++) {
      const r=await fetch(url,{headers:{"User-Agent":WIKIDATA_USER_AGENT},signal:AbortSignal.timeout(60000)});
      if(r.ok) {response=await r.json();break;}
      if(r.status!==429&&r.status<500) throw new Error(`Evidence request HTTP ${r.status}`);
      const retry=r.headers.get("retry-after");
      const delay=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())):3000*2**attempt;
      await new Promise(r=>setTimeout(r,Number.isFinite(delay)?delay:5000));
    }
    if(!response?.entities) throw new Error("Could not fetch Wikidata statement evidence; rerun to resume");
    for(const id of batch) {
      const entity=response.entities[id];
      if(!entity?.claims) continue;
      const claims=(entity.claims.P119??[]).map(claim=>{
        const value=claim.mainsnak.datavalue?.value;
        return {statement_id:claim.id,burial_place_id:typeof value==="object"?value.id??null:null,rank:claim.rank,qualifiers:claim.qualifiers??null,reference_count:claim.references?.length??0,references:claim.references??[],review_required:true};
      });
      const data={wikidata_id:id,retrieved_at:new Date().toISOString(),entity_revision:entity.lastrevid??null,source_url:`https://www.wikidata.org/wiki/${id}#P119`,burial_claims:claims,date_statements:{birth:entity.claims.P569??[],death:entity.claims.P570??[]},note:"An attached reference is not independent verification. A source may be a directory or an import, and a statement may describe a former burial or memorial. Preserve ranks and qualifiers for review."};
      const file=resolve(directory,`${id}.json`);
      writeFileSync(`${file}.tmp`,JSON.stringify(data,null,2));renameSync(`${file}.tmp`,file);
    }
    console.log(`Burial evidence: ${Math.min(offset+20,pending.length)}/${pending.length} fetched`);
    await new Promise(r=>setTimeout(r,500));
  }
  let claims=0,uncited=0,withReferences=0;
  for(const id of ids) {
    const file=resolve(directory,`${id}.json`);
    if(!existsSync(file)) continue;
    const data=JSON.parse(readFileSync(file,"utf8"));
    for(const c of data.burial_claims) {
      if(c.rank==="deprecated") continue;
      claims++;
      if(c.reference_count)withReferences++;else uncited++;
    }
  }
  const report={generated_at:new Date().toISOString(),sample_people:ids.length,people_with_cached_evidence:ids.filter(id=>existsSync(resolve(directory,`${id}.json`))).length,nondeprecated_burial_claims:claims,claims_with_attached_references:withReferences,claims_without_attached_references:uncited};
  writeFileSync(resolve(root,"evidence-report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(report.people_with_cached_evidence!==ids.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
