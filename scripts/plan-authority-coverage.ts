/** Local-only coverage planning: no network, database, or publication. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { planAuthorityCoverage } from "../src/lib/ingestion/authority-coverage.ts";
import type { CoverageCandidate } from "../src/lib/ingestion/authority-coverage.ts";

if (process.argv.length > 2) throw new Error("Usage: node --experimental-strip-types scripts/plan-authority-coverage.ts");
const root = resolve("data/ingestion-runs/us-national");
const queue = JSON.parse(readFileSync(resolve(root, "review-queue.json"), "utf8")) as CoverageCandidate[];
const report = { generated_at: new Date().toISOString(), ...planAuthorityCoverage(queue) };
const escape = (text: string) => text.replace(/[|\r\n]/g, " ");
const markdown = ["# Authority source coverage plan", "", report.note, "",
  `${report.unique_people.toLocaleString("en-US")} unique candidates; ${report.burial_places.toLocaleString("en-US")} claimed burial-place entities. ${report.held_place_identities} place identities held from the source-priority ranking.`, "",
  "## Cumulative unique coverage", "", "Ranked by candidate count, excluding known coarse, missing-label, invalid-ID and conflicting-label places. Overlapping people are counted once.", "",
  "| Top places | Available | Unique candidates | Share of all candidates | Complete unpublished inputs |", "| --- | --- | --- | --- | --- |",
  ...report.cumulative_unique_coverage.map((row) => `| ${row.top_places} | ${row.places_available} | ${row.unique_people} | ${row.percent_of_all_candidates}% | ${row.readiness.structurally_matchable_unpublished} |`), "",
  "## Readiness (overlapping counts)", "", ...Object.entries(report.readiness).map(([key, count]) => `- ${key}: ${count}`), "",
  "## Top 100 source-discovery targets", "", "These are unverified burial-place entities, not confirmed cemeteries or available official datasets. Secure a suitable authoritative source and verify place identity before matching.", "",
  "| Rank | Burial-place label | Wikidata ID | Unique candidates | Complete unpublished inputs |", "| --- | --- | --- | --- | --- |",
  ...report.source_priority.slice(0, 100).map((row) => `| ${row.rank} | ${escape(row.names.join(" / "))} | ${row.burial_place_id} | ${row.unique_people} | ${row.readiness.structurally_matchable_unpublished} |`), "",
  "## Held place identities", "", "| Label | ID | Unique candidates | Reason |", "| --- | --- | --- | --- |",
  ...report.held_places.map((row) => `| ${escape(row.names.join(" / "))} | ${row.burial_place_id} | ${row.unique_people} | ${row.flags.join(", ")} |`), "",
  "The JSON report contains all ranked places and up to 10 candidate examples per place, with all of each example's claimed burial-place IDs preserved. No records were published.", "",
].join("\n");
mkdirSync(root, { recursive: true });
for (const [name, content] of [["authority-coverage.json", JSON.stringify(report, null, 2)], ["authority-coverage.md", markdown]]) {
  const target = resolve(root, name); const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, content); renameSync(temp, target);
}
console.log(JSON.stringify({ unique_people: report.unique_people, burial_places: report.burial_places,
  held_place_identities: report.held_place_identities, cumulative_unique_coverage: report.cumulative_unique_coverage,
  report: resolve(root, "authority-coverage.md"), published: 0 }, null, 2));
