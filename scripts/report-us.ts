import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { dataConfig } from "../src/lib/data/config.ts";
import type { IngestionCandidate } from "../src/lib/ingestion/types.ts";

type Candidate = IngestionCandidate & {slug:string; state:string; county:string|null; county_geoid:string|null; dedupe_status:string};
async function main() {
  const index = process.argv.indexOf("--output");
  const root = resolve(index < 0 ? "data/ingestion-runs/us-national" : process.argv[index + 1]);
  const config = dataConfig(process.env);
  if (config.mode !== "supabase") throw new Error("Use the public database configuration for final deduplication");
  const db = createClient(config.url, config.key, {auth:{persistSession:false, autoRefreshToken:false}});
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const {data,error} = await db.from("people").select("id,slug,wikidata_id").order("id").range(offset,offset+499);
    if(error) throw error;
    for(const p of data) {if(p.wikidata_id) ids.add(p.wikidata_id); slugs.add(p.slug);}
    if(data.length < 500) break;
  }
  const all: Candidate[] = [];
  const states = [];
  for (const file of readdirSync(root).filter(f => /^[A-Z]{2}\.json$/.test(f)).sort()) {
    const run = JSON.parse(readFileSync(resolve(root,file),"utf8"));
    states.push({state:run.state, complete:!!run.completed_at && run.capped_boxes.length===0, burial_claims:run.candidates.length, pending_boxes:run.pending.length, capped_boxes:run.capped_boxes.length, errors:run.errors});
    all.push(...run.candidates);
  }
  const grouped = new Map<string,Candidate[]>();
  for(const c of all) { const group=grouped.get(c.wikidata_id)??[]; group.push(c); grouped.set(c.wikidata_id,group); }
  const names = new Map<string,Set<string>>();
  for(const c of all) { const matches=names.get(c.slug)??new Set<string>(); matches.add(c.wikidata_id); names.set(c.slug,matches); }
  const queue = [...grouped].map(([id,claims]) => {
    const c=claims[0];
    const flags=[];
    if(ids.has(id)||slugs.has(c.slug)) flags.push("existing_public_profile");
    if(new Set(claims.map(x=>x.burial_place_wikidata_id)).size>1) flags.push("multiple_burial_claims");
    if((names.get(c.slug)?.size??0)>1) flags.push("name_collision");
    if(c.name===id) flags.push("missing_english_name");
    if(!c.wikipedia_url) flags.push("missing_english_article");
    if(claims.some(x=>!x.county)) flags.push("county_needs_review");
    const evidencePath=resolve(root,"evidence",`${id}.json`);
    if(existsSync(evidencePath)) {
      const evidence=JSON.parse(readFileSync(evidencePath,"utf8"));
      const statements: {burial_place_id:string|null;rank:string;reference_count:number}[]=evidence.burial_claims;
      const matching=statements.filter(s=>s.rank!=="deprecated"&&claims.some(c=>c.burial_place_wikidata_id===s.burial_place_id));
      if(!matching.length)flags.push("burial_statement_changed_or_missing");
      else if(matching.some(s=>!s.reference_count))flags.push("burial_claim_without_attached_reference");
    } else flags.push("burial_reference_check_pending");
    return {wikidata_id:id,name:c.name,slug:c.slug,states:[...new Set(claims.map(x=>x.state))],wikipedia_url:c.wikipedia_url,commons_file:c.commons_file,review_flags:flags,review_required:true,burial_claims:claims};
  });
  const reviewFlagCounts:Record<string,number>={};
  for(const p of queue)for(const flag of p.review_flags)reviewFlagCounts[flag]=(reviewFlagCounts[flag]??0)+1;
  const summary={generated_at:new Date().toISOString(),states_attempted:states.length,states_completed:states.filter(s=>s.complete).length,unique_people:queue.length,burial_claims:all.length,existing_public_profiles:queue.filter(p=>p.review_flags.includes("existing_public_profile")).length,with_english_article:queue.filter(p=>p.wikipedia_url).length,with_commons_filename:queue.filter(p=>p.commons_file).length,multiple_burial_claims:queue.filter(p=>p.review_flags.includes("multiple_burial_claims")).length,review_flag_counts:reviewFlagCounts,states};
  writeFileSync(resolve(root,"review-queue.json"),JSON.stringify(queue,null,2));
  writeFileSync(resolve(root,"summary.json"),JSON.stringify(summary,null,2));
  const lines=["# U.S. candidate collection", "", `Collected ${queue.length.toLocaleString()} unique people across ${states.length} attempted states/DC; ${summary.states_completed} complete searches.`, "", `${summary.existing_public_profiles} match public profiles. ${summary.with_english_article} have English Wikipedia articles; ${summary.with_commons_filename} have Commons image references awaiting license review.`, "", "These are unpublished source claims, not verified profiles or a complete inventory of American burials. Coordinates describe burial places, not individual graves. County/state matches use simplified Census boundaries. Multiple burial claims and missing names are flagged in review-queue.json.", "", "| State | Burial candidates | Search complete |", "|---|---:|---|", ...states.map(s=>`| ${s.state} | ${s.burial_claims} | ${s.complete?"Yes":"Needs retry/review"} |`)];
  writeFileSync(resolve(root,"REPORT.md"),lines.join("\n")+"\n");
  console.log(JSON.stringify({...summary,states:undefined},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
