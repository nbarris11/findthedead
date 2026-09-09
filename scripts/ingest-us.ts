/** National discovery is a local, resumable review library, never publication. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { containsPoint, boundaryBoxes, buildBurialBoxQuery, splitBox, type Boundary, type Box } from "../src/lib/ingestion/national.ts";
import { normalizeSparqlResults } from "../src/lib/ingestion/normalize.ts";
import { slugify } from "../src/lib/ingestion/dedupe.ts";
import { WIKIDATA_USER_AGENT, type SparqlResponse } from "../src/lib/ingestion/wikidata.ts";
import type { IngestionCandidate } from "../src/lib/ingestion/types.ts";

const arg = (flag: string, fallback: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
};
const directory = resolve(arg("--output", "data/ingestion-runs/us-national"));
mkdirSync(directory, { recursive: true });
function save(file: string, data: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${file}.tmp`, file);
}

async function request(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": WIKIDATA_USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(75000) });
      if (r.ok) {
        const data = await r.json();
        if (data.error) throw new Error(JSON.stringify(data.error));
        return data;
      }
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
      const retry = r.headers.get("retry-after");
      const delay = retry && Number.isFinite(Number(retry)) ? Number(retry) * 1000 : retry ? Math.max(0, Date.parse(retry) - Date.now()) : 2000 * 2 ** attempt;
      console.log(`Retry ${attempt + 1}: HTTP ${r.status}`);
      await new Promise(r => setTimeout(r, Number.isFinite(delay) ? delay : 5000));
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw new Error("Request exhausted retries");
}

async function boundaries(layer: number, name: string): Promise<Boundary[]> {
  const file = resolve(directory, `${name}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).features;
  const features: Boundary[] = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({ where: "1=1", outFields: "*", outSR: "4326", f: "geojson", maxAllowableOffset: "0.002", resultRecordCount: "500", resultOffset: String(offset), orderByFields: "GEOID" });
    const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/${layer}/query?${params}`;
    const data = await request(url) as { features: Boundary[]; exceededTransferLimit?: boolean };
    if (!Array.isArray(data.features)) throw new Error("Census returned no features");
    features.push(...data.features);
    if (data.features.length < 500 && !data.exceededTransferLimit) break;
  }
  save(file, { source: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer", retrieved_at: new Date().toISOString(), simplification_degrees: 0.002, features });
  return features;
}

type Candidate = IngestionCandidate & { slug: string; state: string; state_name: string; county: string | null; county_geoid: string | null; dedupe_status: string; review_required: true };
type Task = { box: Box; depth: number; offset?: number };
type Checkpoint = { state: string; started_at: string; completed_at: string | null; pending: Task[]; queries: number; candidates: Candidate[]; errors: string[]; capped_boxes: Box[]; excluded_rows: number };

async function main() {
  const states = (await boundaries(0, "states")).filter(s => Number(s.properties.GEOID) < 60).sort((a, b) => a.properties.STUSAB.localeCompare(b.properties.STUSAB));
  if (states.length !== 51) throw new Error(`Expected 50 states plus DC, received ${states.length}`);
  const counties = await boundaries(1, "counties");
  const existingIds = new Set<string>();
  const existingSlugs = new Set<string>();
  for (const file of readdirSync("data/reviewed-runs").filter(f => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(`data/reviewed-runs/${file}`, "utf8"));
    for (const p of (Array.isArray(data) ? data : data.candidates ?? [])) {
      if (p.wikidata_id) existingIds.add(p.wikidata_id);
      if (p.slug) existingSlugs.add(p.slug);
    }
  }
  const seed = JSON.parse(readFileSync("data/detroit.seed.json", "utf8"));
  for (const p of seed.people) { if (p.wikidata_id) existingIds.add(p.wikidata_id); existingSlugs.add(p.slug); }
  const requested = arg("--states", "").split(",").filter(Boolean);
  if (requested.some(code => !states.some(s => s.properties.STUSAB === code))) throw new Error("Unknown state code");
  for (const state of states.filter(s => !requested.length || requested.includes(s.properties.STUSAB))) {
    const code = state.properties.STUSAB;
    const file = resolve(directory, `${code}.json`);
    const checkpoint: Checkpoint = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { state: code, started_at: new Date().toISOString(), completed_at: null, pending: boundaryBoxes(state).map(box => ({ box, depth: 0 })), queries: 0, candidates: [], errors: [], capped_boxes: [], excluded_rows: 0 };
    if (checkpoint.capped_boxes.length) {
      checkpoint.pending.push(...checkpoint.capped_boxes.map(box => ({box, depth:10, offset:0})));
      checkpoint.capped_boxes = [];
      checkpoint.completed_at = null;
    }
    if (checkpoint.completed_at) { console.log(`${code}: cached ${checkpoint.candidates.length}`); continue; }
    const localCounties = counties.filter(c => c.properties.STATE === state.properties.GEOID || c.properties.GEOID.startsWith(state.properties.GEOID));
    const seen = new Set(checkpoint.candidates.map(c => `${c.wikidata_id}:${c.burial_place_wikidata_id}`));
    checkpoint.errors = [];
    console.log(`${code}: collecting ${state.properties.NAME}`);
    while (checkpoint.pending.length) {
      const task = checkpoint.pending[0];
      const query = buildBurialBoxQuery(task.box, 2000, task.depth >= 10 ? task.offset ?? 0 : undefined);
      const url = `https://query.wikidata.org/sparql?${new URLSearchParams({query, format: "json"})}`;
      try {
        const response = await request(url) as SparqlResponse;
        if (!Array.isArray(response.results?.bindings)) throw new Error("Invalid SPARQL response");
        checkpoint.queries++;
        if (response.results.bindings.length >= 2000 && task.depth < 10) {
          checkpoint.pending.splice(0, 1, ...splitBox(task.box).map(box => ({box, depth: task.depth + 1})));
          save(file, checkpoint);
          continue;
        }
        for (const c of normalizeSparqlResults(response, new Date().toISOString(), url)) {
          const { burial_place_longitude: lon, burial_place_latitude: lat } = c;
          if (lon === null || lat === null || !containsPoint(state, lon, lat)) { checkpoint.excluded_rows++; continue; }
          const key = `${c.wikidata_id}:${c.burial_place_wikidata_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const county = localCounties.find(f => containsPoint(f, lon, lat));
          const slug = slugify(c.name);
          checkpoint.candidates.push({...c, slug, state: code, state_name: state.properties.NAME, county: county?.properties.NAME ?? null, county_geoid: county?.properties.GEOID ?? null, dedupe_status: existingIds.has(c.wikidata_id) || existingSlugs.has(slug) ? "possible_duplicate" : "new", review_required: true});
        }
        if (response.results.bindings.length >= 2000) {
          checkpoint.pending[0] = {...task, offset:(task.offset ?? 0)+2000};
          console.log(`${code}: paging dense area from row ${checkpoint.pending[0].offset}`);
        } else checkpoint.pending.shift();
        save(file, checkpoint);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        // A slow large query gets smaller geographic requests on retry.
        if (task.depth < 3) {
          checkpoint.pending.splice(0, 1, ...splitBox(task.box).map(box => ({box, depth: task.depth + 1})));
          console.log(`${code}: subdividing slow query`);
          save(file, checkpoint);
          continue;
        }
        checkpoint.errors.push(String(e)); save(file, checkpoint); break;
      }
    }
    if (!checkpoint.pending.length) checkpoint.completed_at = new Date().toISOString();
    save(file, checkpoint);
    console.log(`${code}: ${checkpoint.candidates.length} burial candidates; pending=${checkpoint.pending.length}; capped=${checkpoint.capped_boxes.length}`);
  }
  const reports = states.map(s => {
    const file = resolve(directory, `${s.properties.STUSAB}.json`);
    const run: Checkpoint | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    return { state: s.properties.STUSAB, name: s.properties.NAME, complete: !!run?.completed_at && !run.capped_boxes.length, candidates: run?.candidates.length ?? 0, new_candidates: run?.candidates.filter(c => c.dedupe_status === "new").length ?? 0, pending: run?.pending.length ?? null, errors: run?.errors ?? [] };
  });
  save(resolve(directory, "report.json"), { generated_at: new Date().toISOString(), scope: "50 states and DC; Wikidata deceased people with geocoded burial claims", limitation: "Discovery coverage is not a complete census of burials. Simplified boundaries and source gaps require review. Existing matches use local reviewed files and seed, not private drafts.", states: reports });
  console.log(`Report: ${resolve(directory, "report.json")}`);
  if (reports.some(r => (!requested.length || requested.includes(r.state)) && !r.complete)) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
