/** Cache source excerpts and file metadata for editorial review, never publication. */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { WIKIDATA_USER_AGENT } from "../src/lib/ingestion/wikidata.ts";
import type { IngestionCandidate } from "../src/lib/ingestion/types.ts";

const option = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1] ?? fallback;
};
const root = resolve(option("--output", "data/ingestion-runs/us-national"));
const perState = Number(option("--per-state", "10"));
if (!Number.isInteger(perState) || perState < 0) throw new Error("--per-state must be an integer; 0 means all");
const cache = resolve(root, "research");
mkdirSync(cache, {recursive: true});

async function api(host: string, params: Record<string, string>) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({action: "query", format: "json", formatversion: "2", ...params})}`;
  for (let n = 0; n < 4; n++) {
    const r = await fetch(url, {headers: {"User-Agent": WIKIDATA_USER_AGENT}, signal: AbortSignal.timeout(45000)});
    if (r.ok) {
      const data = await r.json();
      if (data.error) throw new Error(JSON.stringify(data.error));
      return {url, data};
    }
    if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
    const retry = r.headers.get("retry-after");
    const delay = retry ? (Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 3000 * 2 ** n;
    await new Promise(r => setTimeout(r, Number.isFinite(delay) ? delay : 5000));
  }
  throw new Error("Wikimedia retries exhausted");
}

async function main() {
  let processed = 0;
  let failures = 0;
  const selected = new Set<string>();
  for (const state of readdirSync(root).filter(f => /^[A-Z]{2}\.json$/.test(f)).sort()) {
    const run = JSON.parse(readFileSync(resolve(root, state), "utf8"));
    const people: (IngestionCandidate & {dedupe_status: string})[] = run.candidates;
    // Source-rich candidates first; this is a research queue, not a popularity score.
    people.sort((a, b) => Number(b.dedupe_status === "new") - Number(a.dedupe_status === "new") || Number(!!b.wikipedia_url) - Number(!!a.wikipedia_url) || Number(!!b.commons_file) - Number(!!a.commons_file) || a.wikidata_id.localeCompare(b.wikidata_id));
    for (const p of perState ? people.slice(0, perState) : people) {
      if (selected.has(p.wikidata_id)) continue;
      selected.add(p.wikidata_id);
      const file = resolve(cache, `${p.wikidata_id}.json`);
      if (existsSync(file)) continue;
      try {
        let article = null;
        let image = null;
        if (p.wikipedia_url) {
          const u = new URL(p.wikipedia_url);
          if (u.hostname !== "en.wikipedia.org" || !u.pathname.startsWith("/wiki/")) throw new Error("Unexpected article host/path");
          const title = decodeURIComponent(u.pathname.slice(6));
          const {url, data} = await api("en.wikipedia.org", {titles:title, redirects:"1", prop:"extracts|revisions", exintro:"1", explaintext:"1", rvprop:"ids|timestamp"});
          const page = data.query?.pages?.[0];
          if (page && !page.missing && page.revisions?.[0]) article = {title:page.title, revision_id:page.revisions[0].revid, source_url:`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title)}&oldid=${page.revisions[0].revid}`, research_excerpt:page.extract ?? null, api_url:url, usage:"Research only. Wikipedia prose requires attribution/license compliance; write original editorial copy before publishing."};
          await new Promise(r => setTimeout(r, 250));
        }
        if (p.commons_file) {
          const {url, data} = await api("commons.wikimedia.org", {titles:`File:${p.commons_file}`, prop:"imageinfo", iiprop:"url|extmetadata", iiurlwidth:"640"});
          const info = data.query?.pages?.[0]?.imageinfo?.[0];
          if (info) image = {url:info.thumburl ?? info.url, original_url:info.url, source_url:info.descriptionurl, metadata:info.extmetadata, api_url:url, license_review_required:true};
          await new Promise(r => setTimeout(r, 250));
        }
        writeFileSync(`${file}.tmp`, JSON.stringify({wikidata_id:p.wikidata_id, name:p.name, retrieved_at:new Date().toISOString(), article, image, review_required:true}, null, 2));
        renameSync(`${file}.tmp`, file);
        processed++;
      } catch(e) { failures++; console.error(`${p.wikidata_id}: ${String(e)}`); }
    }
    console.log(`${state.slice(0,2)} research: ${processed} new cached, ${failures} failed so far`);
  }
  const report = {generated_at:new Date().toISOString(), per_state_limit:perState || "all", selected_people:selected.size, cached_files:readdirSync(cache).filter(f => f.endsWith(".json")).length, new_cached:processed, failures};
  writeFileSync(resolve(root, "research-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (failures) process.exitCode = 1;
}
main().catch(e => {console.error(e); process.exitCode = 1;});
