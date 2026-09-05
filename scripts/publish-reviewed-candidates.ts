/** The human-gated second half of Milestone 7's ingestion pipeline. Takes a
 *  copy of an ingest-wikidata.ts run file that a person has actually
 *  reviewed and edited — adding short_description, categories, and
 *  dead_score to each candidate they approved, deleting the rest — and
 *  upserts those as draft (never published) records. This never runs
 *  automatically from ingest-wikidata.ts; publication readiness is a human
 *  decision, and even this script only marks records draft, not published.
 *  See docs/DATABASE.md.
 *
 *  Usage: npm run publish:reviewed -- <path-to-reviewed-run.json> --confirm
 *
 *  Requires DATA_MODE=supabase, NEXT_PUBLIC_SUPABASE_URL, and
 *  SUPABASE_SERVICE_ROLE_KEY — the service role key because RLS grants
 *  anon/authenticated read-only access; this is the trusted writer path
 *  those policies describe. Never expose that key to a browser.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { reviewedCandidateSchema } from "../src/lib/ingestion/reviewed.ts";
import { publishReviewedCandidate } from "../src/lib/ingestion/publish.ts";
import type { Database } from "../src/types/database.ts";

async function main() {
  const filePath = process.argv[2];
  const confirmed = process.argv.includes("--confirm");
  if (!filePath || filePath.startsWith("--")) {
    console.error("Usage: npm run publish:reviewed -- <path-to-reviewed-run.json> --confirm");
    process.exitCode = 1;
    return;
  }
  if (!confirmed) {
    console.error(
      "Refusing to run without --confirm. This writes draft people/cemetery records to a live Supabase project.",
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.DATA_MODE !== "supabase") {
    console.error("DATA_MODE must be 'supabase' to publish reviewed candidates.");
    process.exitCode = 1;
    return;
  }
  const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const candidatesRaw = Array.isArray(raw) ? raw : raw.candidates;
  if (!Array.isArray(candidatesRaw)) {
    console.error("Expected a JSON array, or an object with a `candidates` array.");
    process.exitCode = 1;
    return;
  }

  const parseResults = candidatesRaw.map((c, i) => ({
    index: i,
    result: reviewedCandidateSchema.safeParse(c),
  }));
  const invalid = parseResults.filter((r) => !r.result.success);
  if (invalid.length > 0) {
    console.error(`${invalid.length} candidate(s) failed validation — nothing was published:`);
    for (const { index, result } of invalid)
      if (!result.success)
        console.error(`  [${index}] ${JSON.stringify(candidatesRaw[index]?.name)}: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  const db = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let failures = 0;
  for (const { result } of parseResults) {
    if (!result.success) continue;
    const candidate = result.data;
    try {
      const outcome = await publishReviewedCandidate(db, candidate);
      console.log(`${outcome.outcome === "inserted" ? "Inserted" : "Already existed"}: ${candidate.name} (${candidate.slug})`);
    } catch (error) {
      failures++;
      console.error(`Failed to publish ${candidate.name} (${candidate.slug}):`, error);
    }
  }
  if (failures > 0) process.exitCode = 1;
  console.log(
    `Done. All inserted records are drafts (status='draft', is_fixture=false) — publishing them is a separate, later editorial action.`,
  );
}

main().catch((error) => {
  console.error("Publish run failed:", error);
  process.exitCode = 1;
});
