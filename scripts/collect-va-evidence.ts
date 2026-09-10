/** Selective public VA retrieval only. No database, credentials, tags or publication. */
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { VA_VERSION, VA_HOLDS, parseVaRows, planVa, vaQuery } from "../src/lib/ingestion/va-source.ts";
import type { VaCandidate } from "../src/lib/ingestion/va-source.ts";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--groups" || !/^\d+$/.test(args[1]))) throw new Error("Usage: node --experimental-strip-types scripts/collect-va-evidence.ts [--groups 1|0|N] (0 = all remaining)");
const requested = args.length ? Number(args[1]) : 1;
if (!Number.isSafeInteger(requested)) throw new Error("Invalid groups limit");
const root = resolve("data/ingestion-runs/us-national/va-evidence");
mkdirSync(root, { recursive: true });
const lock = resolve(root, "collector.lock");
// Deliberately never auto-remove stale locks: inspect the PID before manual recovery.
const fd = openSync(lock, "wx"); writeFileSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })); closeSync(fd);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const atomic = (path: string, value: unknown) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 2)); renameSync(tmp, path); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Checkpoint = { version: number; input_sha256: string; plan_sha256: string; group: number; after: string; page: number; group_rows: number; total_rows: number; completed_groups: number; capped_groups: number[] };
let lastRequest = 0;
async function fetchPage(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await pause(Math.max(0, 1000 - (Date.now() - lastRequest))); lastRequest = Date.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000), redirect: "error", headers: { Accept: "application/json" } });
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      if (attempt === 3) throw new Error(`VA retries exhausted: ${response.status}`);
      const retry = response.headers.get("retry-after");
      const wait = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : 2000 * 2 ** attempt;
      if (wait > 60_000) throw new Error("VA requested a longer cooldown; retry this collector later");
      await pause(Math.max(1000, wait)); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`VA HTTP ${response.status}`); }
    if (!response.headers.get("content-type")?.includes("json")) { await response.body?.cancel(); throw new Error("VA response is not JSON"); }
    if (!response.body) throw new Error("VA empty response body");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 5_000_000) { await reader.cancel(); throw new Error("VA page exceeded 5 MB limit"); } chunks.push(value); }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("Unreachable retry state");
}
try {
  const raw = readFileSync(resolve("data/ingestion-runs/us-national/review-queue.json"), "utf8");
  const queue = JSON.parse(raw) as VaCandidate[];
  if (!Array.isArray(queue)) throw new Error("Review queue must be an array");
  const plan = planVa(queue); const inputHash = hash(raw); const planHash = hash(JSON.stringify(plan));
  const cpPath = resolve(root, "checkpoint.json");
  let cp: Checkpoint = { version: VA_VERSION, input_sha256: inputHash, plan_sha256: planHash, group: 0, after: "0", page: 0, group_rows: 0, total_rows: 0, completed_groups: 0, capped_groups: [] };
  if (existsSync(cpPath)) {
    cp = JSON.parse(readFileSync(cpPath, "utf8"));
    if (cp.version !== VA_VERSION || cp.input_sha256 !== inputHash || cp.plan_sha256 !== planHash) throw new Error("VA checkpoint input/adapter changed. Preserve this evidence directory and begin a separately reviewed fresh run.");
    if (![cp.group, cp.page, cp.group_rows, cp.total_rows, cp.completed_groups].every((n) => Number.isSafeInteger(n) && n >= 0) || cp.group > plan.groups.length || !/^\d+$/.test(cp.after) || !Array.isArray(cp.capped_groups)) throw new Error("Invalid VA checkpoint");
  }
  atomic(resolve(root, "plan.json"), { version: VA_VERSION, input_sha256: inputHash, plan_sha256: planHash, ...plan, holds: VA_HOLDS, note: "Surname/death-year retrieval only. Last-token derivation can miss compound surnames. Every result is unverified; no military tags or publication. Dates may have limited precision; coordinates are cemetery-level. Groups capped at 10,000 rows remain incomplete." });
  atomic(cpPath, cp);
  const stop = requested === 0 ? plan.groups.length : Math.min(plan.groups.length, cp.group + requested);
  while (cp.group < stop) {
    const url = vaQuery(plan.groups[cp.group], cp.after);
    const pagePath = resolve(root, `group-${String(cp.group).padStart(5, "0")}-page-${String(cp.page).padStart(4, "0")}.json`);
    let snapshot: { input_sha256: string; query: string; response_sha256: string; fetched_at: string; rows: ReturnType<typeof parseVaRows> };
    if (existsSync(pagePath)) {
      snapshot = JSON.parse(readFileSync(pagePath, "utf8"));
      if (snapshot.input_sha256 !== inputHash || snapshot.query !== url || snapshot.response_sha256 !== hash(JSON.stringify(snapshot.rows))) throw new Error("Cached VA page provenance mismatch");
      snapshot.rows = parseVaRows(snapshot.rows);
    } else {
      const body = await fetchPage(url); const rows = parseVaRows(JSON.parse(body));
      snapshot = { input_sha256: inputHash, query: url, response_sha256: hash(JSON.stringify(rows)), fetched_at: new Date().toISOString(), rows };
      atomic(pagePath, snapshot);
    }
    let after = BigInt(cp.after);
    for (const row of snapshot.rows) { const id = BigInt(row.decedent_id); if (id <= after) throw new Error("VA pagination is not strictly increasing"); after = id; }
    cp.after = String(after); cp.page++; cp.group_rows += snapshot.rows.length; cp.total_rows += snapshot.rows.length;
    const capped = cp.group_rows >= 10_000 && snapshot.rows.length === 1000;
    if (snapshot.rows.length < 1000 || capped) {
      console.log(JSON.stringify({ group: cp.group, rows: cp.group_rows, incomplete_row_cap: capped, status: "held_evidence_only" }));
      if (capped) cp.capped_groups.push(cp.group); else cp.completed_groups++;
      cp.group++; cp.after = "0"; cp.page = 0; cp.group_rows = 0;
    }
    atomic(cpPath, cp);
  }
  console.log(JSON.stringify({ groups_total: plan.groups.length, next_group: cp.group, completed_groups: cp.completed_groups, capped_groups: cp.capped_groups, raw_evidence_rows: cp.total_rows, unqueryable_candidates: plan.held.length, verified: 0, published: 0, output: root }));
} finally { unlinkSync(lock); }
