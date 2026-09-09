import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifiedBatchSchema } from "../src/lib/ingestion/batch.ts";
import { assertReviewedContent, assertReviewedCemetery } from "../src/lib/ingestion/release-guards.ts";

const batch = JSON.parse(readFileSync(new URL("../data/reviewed-runs/national-official-wave1.json", import.meta.url), "utf8"));
test("verified batch requires sourced biographies, burial evidence and unique identities", () => {
  assert.equal(verifiedBatchSchema.safeParse(batch).success, true);
  assert.equal(verifiedBatchSchema.safeParse({ ...batch, candidates: [batch.candidates[0], batch.candidates[0]] }).success, false);
  for (const field of ["biography", "profile_source_url", "burial_evidence", "confirmed"]) {
    const candidate = { ...batch.candidates[0] }; delete candidate[field];
    assert.equal(verifiedBatchSchema.safeParse({ ...batch, candidates: [candidate] }).success, false, field);
  }
  assert.equal(verifiedBatchSchema.safeParse({ wikidata_id: "Q23", status: "needs_review", suggested_tags: [] }).success, false);
});
test("release rejects stale content and wrong cemetery even when names match", () => {
  const candidate = verifiedBatchSchema.parse(batch).candidates[0];
  assert.doesNotThrow(() => assertReviewedContent(candidate, { ...candidate }));
  assert.throws(() => assertReviewedContent(candidate, { ...candidate, biography: "Unreviewed text" }), /stored biography/);
  assert.throws(() => assertReviewedContent(candidate, { ...candidate, wikidata_id: "Q23" }), /stored wikidata_id/);
  const source = { cemetery_id: "cemetery", external_id: candidate.burial_place_wikidata_id, source_type: "wikidata" };
  assert.doesNotThrow(() => assertReviewedCemetery(candidate, "cemetery", [source]));
  assert.throws(() => assertReviewedCemetery(candidate, "other-cemetery", [source]), /primary cemetery/);
  assert.throws(() => assertReviewedCemetery(candidate, "cemetery", [{ ...source, external_id: "Q23" }]), /primary cemetery/);
});
