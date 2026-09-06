/** Bounded Wikidata proof of concept (Milestone 7). Fetches deceased people
 *  with a documented place of burial near a given city (Detroit by default),
 *  normalizes them, dedupes against the existing development seed, and
 *  writes a reviewable run file. Makes exactly one network request. Never
 *  writes to any database — see src/lib/ingestion/publish.ts and
 *  scripts/publish-reviewed-candidates.ts for the separate, explicit,
 *  human-gated step that does. See docs/DATA-SOURCES.md for the full policy.
 *
 *  Usage: npm run ingest:wikidata -- [--limit N] [--radius-km N]
 *                                    [--lat N --lon N --label "City, ST"]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { seedSchema } from "../src/lib/validation/seed.ts";
import { DEFAULT_VIEW } from "../src/lib/explore/config.ts";
import { buildBurialRadiusQuery, runSparqlQuery } from "../src/lib/ingestion/wikidata.ts";
import { normalizeSparqlResults } from "../src/lib/ingestion/normalize.ts";
import { dedupeCandidates } from "../src/lib/ingestion/dedupe.ts";
import type { IngestionRun } from "../src/lib/ingestion/types.ts";

const MAX_LIMIT = 100; // hard ceiling: a proof of concept, not a national importer

function readIntArg(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${flag} must be a positive number`);
  return value;
}

function readFloatArg(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error(`${flag} must be a number`);
  return value;
}

function readStringArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${flag} needs a value`);
  return value;
}

async function main() {
  const limit = Math.min(readIntArg("--limit", 25), MAX_LIMIT);
  const radiusKm = readIntArg("--radius-km", 40);
  const latitude = readFloatArg("--lat", DEFAULT_VIEW.latitude);
  const longitude = readFloatArg("--lon", DEFAULT_VIEW.longitude);
  const label = readStringArg("--label", "Detroit");

  const seedPath = new URL("../data/detroit.seed.json", import.meta.url);
  const seed = seedSchema.parse(JSON.parse(readFileSync(seedPath, "utf8")));
  const existingSlugs = new Set(seed.people.map((p) => p.slug));
  // No seed person currently has a wikidata_id (see docs/DATA-SOURCES.md);
  // this set exists so the check is already correct once one does.
  const existingWikidataIds = new Set<string>();

  const query = buildBurialRadiusQuery(latitude, longitude, radiusKm, limit);
  const sourceUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  const retrievedAt = new Date().toISOString();

  console.log(
    `Querying Wikidata: deceased people with a place of burial within ${radiusKm}km of ${label} (limit ${limit})...`,
  );
  const response = await runSparqlQuery(query);
  const candidates = normalizeSparqlResults(response, retrievedAt, sourceUrl);
  const deduped = dedupeCandidates(candidates, existingSlugs, existingWikidataIds);

  const run: IngestionRun = {
    run_id: randomUUID(),
    started_at: retrievedAt,
    finished_at: new Date().toISOString(),
    source: "wikidata",
    query_description: `Deceased people (P31 human) with a documented place of burial (P119) within ${radiusKm}km of ${label}`,
    candidate_count: deduped.length,
    new_count: deduped.filter((c) => c.dedupe_status === "new").length,
    possible_duplicate_count: deduped.filter((c) => c.dedupe_status === "possible_duplicate").length,
    candidates: deduped,
  };

  const outDir = new URL("../data/ingestion-runs/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const outPath = new URL(`${run.run_id}.json`, outDir);
  writeFileSync(outPath, JSON.stringify(run, null, 2));

  console.log(
    `Fetched ${run.candidate_count} candidates: ${run.new_count} new, ${run.possible_duplicate_count} possible duplicates (already in the seed).`,
  );
  console.log(`Run saved to ${outPath.pathname} for editorial review.`);
  console.log(
    "Nothing was written to any database. New candidates still need a human-written short_description, category assignment, and Dead Score before they can become real records — see docs/DATA-SOURCES.md.",
  );
}

main().catch((error) => {
  console.error("Ingestion run failed:", error);
  process.exitCode = 1;
});
