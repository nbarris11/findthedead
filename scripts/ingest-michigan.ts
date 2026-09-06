/** Statewide candidate discovery. Queries bounded regional hubs, combines the
 * results, deduplicates against the public database and within the batch, and
 * writes one review file. It never writes to the database. */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { seedSchema } from "../src/lib/validation/seed.ts";
import { dataConfig } from "../src/lib/data/config.ts";
import { buildBurialRadiusQuery, runSparqlQuery } from "../src/lib/ingestion/wikidata.ts";
import { normalizeSparqlResults } from "../src/lib/ingestion/normalize.ts";
import { dedupeCandidates } from "../src/lib/ingestion/dedupe.ts";
import { MICHIGAN_INGESTION_TARGETS } from "../src/lib/ingestion/michigan.ts";
import { isPointInMichigan } from "../src/lib/geo/michigan.ts";
import type { Database } from "../src/types/database.ts";
import type { IngestionCandidate, IngestionRun } from "../src/lib/ingestion/types.ts";

const DEFAULT_LIMIT_PER_REGION = 40;
const MAX_LIMIT_PER_REGION = 60;
const DEFAULT_RADIUS_KM = 55;

function positiveArg(flag: string, fallback: number, max?: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${flag} must be a positive number`);
  return max ? Math.min(value, max) : value;
}

async function existingPersonKeys() {
  const seedPath = new URL("../data/detroit.seed.json", import.meta.url);
  const seed = seedSchema.parse(JSON.parse(readFileSync(seedPath, "utf8")));
  const slugs = new Set(seed.people.map((person) => person.slug));
  const wikidataIds = new Set<string>();
  const config = dataConfig(process.env);
  if (config.mode === "demo") return { slugs, wikidataIds };

  const db = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.from("people").select("slug,wikidata_id");
  if (error)
    throw new Error("Published people could not be loaded for deduplication", {
      cause: error,
    });
  for (const person of data ?? []) {
    slugs.add(person.slug);
    if (person.wikidata_id) wikidataIds.add(person.wikidata_id);
  }
  return { slugs, wikidataIds };
}

async function main() {
  const limit = positiveArg(
    "--limit-per-region",
    DEFAULT_LIMIT_PER_REGION,
    MAX_LIMIT_PER_REGION,
  );
  const radiusKm = positiveArg("--radius-km", DEFAULT_RADIUS_KM);
  const runId = randomUUID();
  const retrievedAt = new Date().toISOString();
  const candidates: IngestionCandidate[] = [];
  const existing = await existingPersonKeys();
  const outDir = new URL("../data/ingestion-runs/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  const outPath = new URL(`${runId}.json`, outDir);

  function saveCheckpoint(completedTargets: number): IngestionRun {
    const inMichigan = candidates.filter(
      (candidate) =>
        candidate.burial_place_latitude !== null &&
        candidate.burial_place_longitude !== null &&
        isPointInMichigan(
          candidate.burial_place_latitude,
          candidate.burial_place_longitude,
        ),
    );
    const deduped = dedupeCandidates(
      inMichigan,
      existing.slugs,
      existing.wikidataIds,
    );
    const run: IngestionRun = {
      run_id: runId,
      started_at: retrievedAt,
      finished_at: new Date().toISOString(),
      source: "wikidata",
      query_description: `Michigan statewide discovery across ${MICHIGAN_INGESTION_TARGETS.length} regional hubs (${radiusKm}km radius, limit ${limit} per hub)`,
      candidate_count: deduped.length,
      new_count: deduped.filter((candidate) => candidate.dedupe_status === "new").length,
      possible_duplicate_count: deduped.filter(
        (candidate) => candidate.dedupe_status === "possible_duplicate",
      ).length,
      excluded_outside_scope_count: candidates.length - inMichigan.length,
      completed_targets: completedTargets,
      target_count: MICHIGAN_INGESTION_TARGETS.length,
      candidates: deduped,
    };
    writeFileSync(outPath, JSON.stringify(run, null, 2));
    return run;
  }

  for (const [index, target] of MICHIGAN_INGESTION_TARGETS.entries()) {
    console.log(
      `[${index + 1}/${MICHIGAN_INGESTION_TARGETS.length}] ${target.label} — ${target.region}`,
    );
    const query = buildBurialRadiusQuery(
      target.latitude,
      target.longitude,
      radiusKm,
      limit,
    );
    const sourceUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const response = await runSparqlQuery(query);
    candidates.push(...normalizeSparqlResults(response, retrievedAt, sourceUrl));
    saveCheckpoint(index + 1);
  }

  const run = saveCheckpoint(MICHIGAN_INGESTION_TARGETS.length);
  console.log(
    `Saved ${run.candidate_count} Michigan candidates: ${run.new_count} new, ${run.possible_duplicate_count} possible duplicates, and ${run.excluded_outside_scope_count} outside-state records excluded.`,
  );
  console.log(`Review file: ${outPath.pathname}`);
  console.log("Nothing was written to the database or published.");
}

main().catch((error) => {
  console.error("Michigan ingestion run failed:", error);
  process.exitCode = 1;
});
