/** Whole-cemetery public API collection. Identity evidence, never publication. */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArlingtonPage, arlingtonIdentity, arlingtonOrderGuard } from "../src/lib/ingestion/arlington-api.ts";
import { matchAuthorityRecords } from "../src/lib/ingestion/authority-match.ts";
import type { AuthorityRecord, MatchCandidate } from "../src/lib/ingestion/authority-match.ts";
import { retryDelay } from "../src/lib/ingestion/research.ts";
import { WIKIDATA_USER_AGENT } from "../src/lib/ingestion/wikidata.ts";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--pages")) throw new Error("Usage: npm run collect:arlington -- [--pages 2 | 0]");
const maxNewPages = Number(args[1] ?? 2);
if (!Number.isSafeInteger(maxNewPages) || maxNewPages < 0) throw new Error("--pages must be a nonnegative integer; 0 means all remaining pages");
const root = resolve("data/ingestion-runs/us-national");
const work = resolve(root, "arlington-api");
mkdirSync(work, { recursive: true });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pageSize = 1000;
const endpoint = "https://wspublic.eiss.army.mil/IssRetrieveServices.svc/search";
const pageUrl = (start: number) => `${endpoint}?${new URLSearchParams({ q: "CemeteryId=46", sortColumn: "ISS_ID", sortOrder: "asc", limit: String(pageSize), start: String(start) })}`;
const version = 1;
function atomic(name: string, value: unknown) {
  const target = resolve(work, name);
  writeFileSync(`${target}.tmp`, JSON.stringify(value));
  renameSync(`${target}.tmp`, target);
}
type Snapshot = { version: number; url: string; retrieved_at: string; sha256: string; body: string };
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
let requests = 0;
async function retrieve(url: string): Promise<Snapshot> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1000);
    requests++;
    const response = await fetch(url, { headers: { "User-Agent": WIKIDATA_USER_AGENT }, redirect: "error", signal: AbortSignal.timeout(45000) });
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      if (attempt === 3) throw new Error(`API retry limit reached: HTTP ${response.status}`);
      await sleep(retryDelay(response.headers.get("retry-after"), attempt));
      continue;
    }
    if (!response.ok) throw new Error(`API HTTP ${response.status}; stopping without bypass`);
    const reader = response.body!.getReader(); const decoder = new TextDecoder(); let body = "";
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      body += decoder.decode(next.value, { stream: true });
      if (body.length > 20_000_000) { await reader.cancel(); throw new Error("API page exceeds 20 MB text limit"); }
    }
    body += decoder.decode();
    JSON.parse(body); // Never evaluate JSONP or scripts received from a source.
    return { version, url, retrieved_at: new Date().toISOString(), sha256: hash(body), body };
  }
  throw new Error("API retry limit reached");
}

async function main() {
  const lock = resolve(work, "run.lock");
  writeFileSync(lock, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
  let rows = 0; let total: number | null = null; let pages = 0; let fetched = 0;
  const checkOrder = arlingtonOrderGuard();
  const startedAt = new Date().toISOString();
  const evidence: (AuthorityRecord & { interment_date: string | null; retrieved_at: string })[] = [];
  const sourceNames = new Map<string, number>();
  const sourceManifests: { start: number; count: number; sha256: string; retrieved_at: string }[] = [];
  const report = (status: string, error?: string) => atomic("progress.json", {
    version, status, pid: process.pid, started_at: startedAt, updated_at: new Date().toISOString(),
    total_source_records: total, source_records_processed: rows, pages_processed: pages,
    new_pages: fetched, requests_this_run: requests, candidate_name_leads: evidence.length,
    verified: 0, published: 0, error: error ?? null,
    note: "Source includes interments and memorials. Identity matches are not burial verification.",
  });
  try {
    const queueBody = readFileSync(resolve(root, "review-queue.json"), "utf8");
    const queue = JSON.parse(queueBody) as { wikidata_id: string; name: string; review_flags: string[]; burial_claims: { birth_year: number | null; death_year: number | null; burial_place_wikidata_id: string }[] }[];
    const candidates: MatchCandidate[] = queue.map((p) => {
      const births = [...new Set(p.burial_claims.map((c) => c.birth_year))];
      const deaths = [...new Set(p.burial_claims.map((c) => c.death_year))];
      return { wikidata_id: p.wikidata_id, name: p.name, birth_year: births.length === 1 ? births[0] : null,
        death_year: deaths.length === 1 ? deaths[0] : null,
        burial_place_ids: [...new Set(p.burial_claims.map((c) => c.burial_place_wikidata_id))],
        review_flags: [...p.review_flags, ...(births.length > 1 || deaths.length > 1 ? ["candidate_date_conflict"] : [])] };
    });
    // All candidates remain in the identity index to catch cross-cemetery namesakes.
    const { normalizeAuthorityName } = await import("../src/lib/ingestion/authority-match.ts");
    const targetNames = new Set(candidates.filter((p) => p.burial_place_ids.includes("Q216344")).map((p) => normalizeAuthorityName(p.name)));
    report("running");
    for (let start = 0; (total === null || start < total) && !stopping; start += pageSize) {
      const name = `page-${String(start).padStart(7, "0")}.json`;
      const path = resolve(work, name);
      let snapshot: Snapshot;
      if (existsSync(path)) {
        snapshot = JSON.parse(readFileSync(path, "utf8"));
        const age = Date.now() - Date.parse(snapshot.retrieved_at);
        if (snapshot.version !== version || snapshot.url !== pageUrl(start) || typeof snapshot.body !== "string" || hash(snapshot.body) !== snapshot.sha256 || !Number.isFinite(age) || age < -60_000 || age > 30 * 86400_000) throw new Error(`Invalid/stale snapshot ${name}; investigate before starting a new snapshot set`);
      } else {
        if (maxNewPages && fetched >= maxNewPages) break;
        snapshot = await retrieve(pageUrl(start));
        // Validate before committing any page to the resumable cache.
        parseArlingtonPage(JSON.parse(snapshot.body), start);
        atomic(name, snapshot); fetched++;
      }
      const page = parseArlingtonPage(JSON.parse(snapshot.body), start);
      if (total !== null && total !== page.total) throw new Error("Source total changed during pagination; incomplete snapshot requires reconciliation");
      total = page.total;
      if (page.records.length !== Math.min(pageSize, total - start)) throw new Error("Unexpected page size; refusing to skip missing source rows");
      for (const row of page.records) {
        checkOrder(row);
        const identity = arlingtonIdentity(row);
        sourceNames.set(identity.normalized_name, (sourceNames.get(identity.normalized_name) ?? 0) + 1);
        if (targetNames.has(identity.normalized_name)) evidence.push({
          record_id: identity.source_record_id, name: identity.name, birth_year: identity.birth_year, death_year: identity.death_year,
          cemetery_id: "Q216344", source_url: snapshot.url, source_sha256: snapshot.sha256,
          burial_kind: "unknown", flags: identity.flags,
          interment_date: identity.interment_date, retrieved_at: snapshot.retrieved_at,
        });
      }
      rows += page.records.length; pages++;
      sourceManifests.push({ start, count: page.records.length, sha256: snapshot.sha256, retrieved_at: snapshot.retrieved_at });
      report("running");
      if (pages === 1 || pages % 10 === 0) console.log(`Arlington: ${rows}/${total} source records; ${evidence.length} candidate-name leads. No publishing.`);
    }
    const complete = total !== null && rows === total;
    // Until every page has been seen, later namesakes can still invalidate matches.
    const checked = evidence.map((r) => ({ ...r, flags: [...r.flags, "source_snapshot_consistency_unverified", ...(!complete ? ["source_snapshot_incomplete"] : []), ...((sourceNames.get(normalizeAuthorityName(r.name)) ?? 0) > 1 ? ["source_name_collision"] : [])] }));
    const matches = matchAuthorityRecords(checked, candidates);
    const results = checked.map((record, i) => ({ ...record, match: matches[i] }));
    atomic("matches.json", {
      version, generated_at: new Date().toISOString(), queue_sha256: hash(queueBody), pagination_complete: complete, snapshot_consistency_verified: false,
      source_records_processed: rows, source_records_total: total, source_pages: sourceManifests,
      records: results, verified: 0, published: 0,
      terms_url: "https://www.arlingtoncemetery.mil/Developers/Terms-of-Service",
      note: "No record is approved for publication. Resolve memorial/current-interment ambiguity, roles and required source attribution before release. Partial snapshots cannot establish uniqueness.",
    });
    report(complete ? "complete" : "paused");
    console.log(JSON.stringify({ complete, source_records_processed: rows, total, candidate_name_leads: evidence.length, verified: 0, published: 0 }));
  } catch (error) { report("failed", error instanceof Error ? error.message : String(error)); throw error; }
  finally { unlinkSync(lock); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
