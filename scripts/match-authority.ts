/** Read-only source collection and batch evidence matching. No DB credentials. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { arlingtonAdapterVersion, arlingtonSources, extractArlington, sha256, sourceUrl } from "../src/lib/ingestion/arlington-source.ts";
import { matchAuthorityRecords } from "../src/lib/ingestion/authority-match.ts";
import type { MatchCandidate } from "../src/lib/ingestion/authority-match.ts";
import { WIKIDATA_USER_AGENT } from "../src/lib/ingestion/wikidata.ts";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--refresh")) throw new Error("Usage: npm run match:authority -- [--refresh]");
const root = resolve("data/ingestion-runs/us-national");
const work = resolve(root, "authority-matches");
mkdirSync(work, { recursive: true });
function atomic(name: string, value: unknown) {
  const target = resolve(work, name);
  writeFileSync(`${target}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${target}.tmp`, target);
}

async function main() {
  const lock = resolve(work, "run.lock");
  writeFileSync(lock, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
  try {
    const queueText = readFileSync(resolve(root, "review-queue.json"), "utf8");
    const queue = JSON.parse(queueText) as {
      wikidata_id: string; name: string; review_flags: string[];
      burial_claims: { birth_year: number | null; death_year: number | null; burial_place_wikidata_id: string }[];
    }[];
    const candidates: MatchCandidate[] = queue.map((p) => {
      const births = new Set(p.burial_claims.map((c) => c.birth_year));
      const deaths = new Set(p.burial_claims.map((c) => c.death_year));
      return { wikidata_id: p.wikidata_id, name: p.name,
        birth_year: births.size === 1 ? p.burial_claims[0].birth_year : null,
        death_year: deaths.size === 1 ? p.burial_claims[0].death_year : null,
        burial_place_ids: [...new Set(p.burial_claims.map((c) => c.burial_place_wikidata_id))],
        review_flags: [...p.review_flags, ...(births.size > 1 || deaths.size > 1 ? ["candidate_date_conflict"] : [])],
      };
    });
    const records = [];
    let requests = 0;
    for (const source of arlingtonSources) {
      const path = resolve(work, `${source.key}-snapshot.json`);
      let snapshot: { url: string; retrieved_at: string; sha256: string; html: string } | undefined;
      if (existsSync(path) && !args.includes("--refresh")) {
        snapshot = JSON.parse(readFileSync(path, "utf8"));
        if (!snapshot || snapshot.url !== sourceUrl(source.path) || typeof snapshot.html !== "string" || snapshot.sha256 !== sha256(snapshot.html) || !Number.isFinite(Date.parse(snapshot.retrieved_at))) throw new Error("Invalid source snapshot; use --refresh to retrieve again");
        const age = Date.now() - Date.parse(snapshot.retrieved_at);
        if (age < -60_000 || age > 30 * 86400_000) throw new Error("Source snapshot is stale or future-dated; use --refresh");
      }
      if (!snapshot) {
        if (requests) await new Promise((r) => setTimeout(r, 1000));
        const url = sourceUrl(source.path);
        const response = await fetch(url, { redirect: "error", headers: { "User-Agent": WIKIDATA_USER_AGENT }, signal: AbortSignal.timeout(45000) });
        requests++;
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error(`Official source request failed: ${response.status}. No release attempted.`);
        // Bound the stream, not just Content-Length (which may be absent).
        const reader = response.body!.getReader(); const decoder = new TextDecoder(); let html = "";
        for (;;) { const part = await reader.read(); if (part.done) break; html += decoder.decode(part.value, { stream: true }); if (html.length > 3_000_000) { await reader.cancel(); throw new Error("Source too large"); } }
        html += decoder.decode();
        snapshot = { url, retrieved_at: new Date().toISOString(), sha256: sha256(html), html };
        atomic(`${source.key}-snapshot.json`, snapshot);
      }
      records.push(...extractArlington(snapshot.html, source).map((record) => ({ ...record, retrieved_at: snapshot!.retrieved_at })));
    }
    const matches = matchAuthorityRecords(records, candidates);
    const report = { version: 1, adapter_version: arlingtonAdapterVersion, generated_at: new Date().toISOString(), queue_sha256: sha256(queueText), candidate_count: candidates.length,
      source_requests: requests, source_records: records.length,
      matched: matches.filter((m) => m.status === "matched").length,
      already_public: matches.filter((m) => m.status === "already_public").length,
      held: matches.filter((m) => m.status === "held").length,
      published: 0, note: "Evidence matching only. Source adapter, tags and editorial facts require independent review before guarded bulk release.",
      records: records.map((record, i) => ({ ...record, match: matches[i] })),
    };
    atomic("report.json", report);
    const ready = report.records.filter((r) => r.match.status === "matched");
    const batches = [];
    for (let i = 0; i < ready.length; i += 50) batches.push({ status: "needs_editorial_review", records: ready.slice(i, i + 50) });
    atomic("review-batches.json", { generated_at: report.generated_at, adapter_version: arlingtonAdapterVersion, queue_sha256: report.queue_sha256, batches });
    console.log(JSON.stringify({ ...report, records: undefined }, null, 2));
  } finally { unlinkSync(lock); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
