import test from "node:test";
import assert from "node:assert/strict";
import { isCoarseBurialPlace, planAuthorityCoverage } from "../src/lib/ingestion/authority-coverage.ts";
import type { CoverageCandidate } from "../src/lib/ingestion/authority-coverage.ts";
const person = (id: string, places: string[], overrides: Partial<CoverageCandidate> = {}): CoverageCandidate => ({
  wikidata_id: id, name: `Person ${id}`, review_flags: ["burial_reference_check_pending"],
  burial_claims: places.map((place) => ({ birth_year: 1900, death_year: 1980, burial_place_wikidata_id: place, burial_place_name: `Cemetery ${place}` })), ...overrides,
});
test("coverage deduplicates people across state rows and overlapping burial claims", () => {
  const report = planAuthorityCoverage([person("Q1", ["Q101", "Q102"]), person("Q1", ["Q101"]), person("Q2", ["Q102"])]);
  assert.equal(report.unique_people, 2); assert.equal(report.raw_claim_rows, 4);
  assert.equal(report.source_priority[0].unique_people, 2);
  assert.equal(report.cumulative_unique_coverage[0].unique_people, 2);
  assert.equal(report.cumulative_unique_coverage[0].percent_of_all_candidates, 100);
  assert.equal(report.readiness.multiple_burials, 1);
  assert.equal(report.readiness.structurally_matchable_unpublished, 1);
  assert.deepEqual(report.source_priority[0].candidate_sample[0].burial_place_ids, ["Q101", "Q102"]);
});
test("known state and DC labels are coarse locations, never source-priority cemeteries", () => {
  for (const name of ["Vermont", "Wisconsin", "State of Michigan", "Washington, D.C.", "District of Columbia"]) assert.equal(isCoarseBurialPlace(name), true);
  assert.equal(isCoarseBurialPlace("Michigan Memorial Park"), false);
  const row = person("Q1", ["Q101"]); row.burial_claims[0].burial_place_name = "Vermont";
  const report = planAuthorityCoverage([row]);
  assert.equal(report.source_priority.length, 0); assert.deepEqual(report.held_places[0].flags, ["coarse_location"]);
  assert.equal(report.cumulative_unique_coverage[0].unique_people, 0);
});
test("readiness counts missing years, name collisions, public state, and missing labels without approval", () => {
  const a = person("Q1", ["Q101"], { name: "Same Name" }); a.burial_claims[0].birth_year = null;
  const b = person("Q2", ["Q101"], { name: "Same Name", review_flags: ["existing_public_profile"] });
  const c = person("Q3", ["Q102"]); c.burial_claims[0].burial_place_name = "Q102";
  const report = planAuthorityCoverage([a, b, c]);
  assert.equal(report.readiness.missing_or_invalid_years, 1); assert.equal(report.readiness.name_collision, 2);
  assert.equal(report.readiness.existing_public_profile, 1); assert.equal(report.readiness.missing_place_name, 1);
  assert.equal(report.readiness.structurally_matchable_unpublished, 0);
  assert.ok(report.held_places[0].flags.includes("missing_place_name"));
  assert.equal("confirmed" in report, false);
});
test("conflicting state-row dates and place names stay visible and candidate samples are bounded", () => {
  const a = person("Q1", ["Q101"]); const b = person("Q1", ["Q101"]);
  b.burial_claims[0].birth_year = 1901; b.burial_claims[0].burial_place_name = "Different Cemetery";
  const report = planAuthorityCoverage([a, b, person("Q2", ["Q101"])], 1);
  assert.equal(report.readiness.conflicting_years, 1);
  assert.equal(report.readiness.conflicting_place_names, 2);
  assert.equal(report.readiness.structurally_matchable_unpublished, 0);
  assert.ok(report.held_places[0].flags.includes("conflicting_place_names"));
  assert.equal(report.held_places[0].candidate_sample.length, 1); assert.equal(report.held_places[0].candidate_sample_truncated, true);
  assert.throws(() => planAuthorityCoverage([], -1));
});
test("empty coverage has finite zero percentages", () => {
  assert.equal(planAuthorityCoverage([]).cumulative_unique_coverage[0].percent_of_all_candidates, 0);
});
