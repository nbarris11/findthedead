import test from "node:test";
import assert from "node:assert/strict";
import { matchAuthorityRecords, normalizeAuthorityName } from "../src/lib/ingestion/authority-match.ts";
import type { AuthorityRecord, MatchCandidate } from "../src/lib/ingestion/authority-match.ts";

const source: AuthorityRecord = {
  record_id: "cemetery:123", name: "Grace Hopper", birth_year: 1906, death_year: 1992,
  cemetery_id: "Q216344", source_url: "https://www.arlingtoncemetery.mil/record/123",
  source_sha256: "a".repeat(64), burial_kind: "grave", flags: [],
};
const candidate: MatchCandidate = {
  wikidata_id: "Q11641", name: "Grace Hopper", birth_year: 1906, death_year: 1992,
  burial_place_ids: ["Q216344"], review_flags: [],
};
const match = (record: Partial<AuthorityRecord> = {}, person: Partial<MatchCandidate> = {}) =>
  matchAuthorityRecords([{ ...source, ...record }], [{ ...candidate, ...person }])[0];

test("exact unique name, both years, and single cemetery match without publication approval", () => {
  assert.deepEqual(match(), { record_id: source.record_id, status: "matched", wikidata_id: "Q11641", reasons: [] });
  assert.equal("confirmed" in match(), false);
});

test("name normalization handles Unicode, apostrophes and punctuation without expanding or dropping name parts", () => {
  assert.equal(normalizeAuthorityName("  JOSÉ O’Connor, Jr.  "), "jose oconnor jr");
  assert.equal(match({ name: "José O’Connor, Jr." }, { name: "Jose O'Connor Jr" }).status, "matched");
  for (const name of ["Grace M. Hopper", "G. Hopper", "Grace Hopper Jr.", "Amazing Grace"]) {
    assert.equal(match({ name }).status, "held");
  }
});

test("dates must both be present, valid, and exactly agree", () => {
  for (const birth_year of [null, 1907, 1993, NaN, Infinity, 1906.5, 0]) {
    assert.equal(match({ birth_year }).status, "held");
    assert.equal(match({}, { birth_year }).status, "held");
  }
  assert.equal(match({ death_year: null }).status, "held");
  assert.equal(match({}, { death_year: null }).status, "held");
  assert.equal(match({}, { death_year: 1991 }).status, "held");
});

test("same-name candidate QIDs always hold even when dates distinguish them", () => {
  const result = matchAuthorityRecords([source], [candidate, { ...candidate, wikidata_id: "Q2", birth_year: 1800 }])[0];
  assert.equal(result.status, "held");
  assert.equal(result.wikidata_id, null);
  assert.ok(result.reasons.includes("candidate_name_collision"));
});

test("duplicate state rows for the same QID cannot mask conflicting claims", () => {
  assert.equal(matchAuthorityRecords([source], [candidate, { ...candidate }])[0].status, "matched");
  for (const conflicting of [{ birth_year: 1907 }, { burial_place_ids: ["Q2"] }, { name: "Grace Murray Hopper" }, { review_flags: ["name_collision"] }]) {
    assert.equal(matchAuthorityRecords([source], [candidate, { ...candidate, ...conflicting }])[0].status, "held");
  }
});

test("duplicate source IDs and normalized source names hold every involved record", () => {
  for (const duplicate of [{ ...source }, { ...source, record_id: "other", name: "GRACE HOPPER" }, { ...source, name: "Other Name" }]) {
    const results = matchAuthorityRecords([source, duplicate], [candidate]);
    assert.ok(results.every((result) => result.status === "held"));
  }
});

test("cemetery mismatch, missing or multiple burial places hold", () => {
  for (const burial_place_ids of [[], ["Q2"], ["Q216344", "Q2"]]) assert.equal(match({}, { burial_place_ids }).status, "held");
  assert.equal(match({}, { burial_place_ids: ["Q216344", "Q216344"] }).status, "matched");
  assert.equal(match({ cemetery_id: "not-a-QID" }).status, "held");
});

test("memorials, unknown burials, source flags, or incomplete provenance hold", () => {
  for (const burial_kind of ["memorial", "unknown"] as const) assert.equal(match({ burial_kind }).status, "held");
  for (const patch of [{ flags: ["reinterred"] }, { source_sha256: "" }, { source_url: "http://example.com" }, { source_url: "invalid" }, { record_id: "" }, { name: "" }]) {
    assert.equal(match(patch).status, "held");
  }
});

test("candidate risk and unknown flags fail closed; enrichment-only flags do not", () => {
  for (const flag of ["name_collision", "multiple_burial_claims", "multiple_burial_places", "burial_changed_since_collection", "burial_statement_changed_or_missing", "missing_english_name", "future_unknown_flag"]) {
    assert.equal(match({}, { review_flags: [flag] }).status, "held");
  }
  assert.equal(match({}, { review_flags: ["burial_reference_check_pending", "burial_claim_without_attached_reference", "missing_english_article", "county_needs_review"] }).status, "matched");
});

test("already public is emitted only for an otherwise safe match", () => {
  assert.equal(match({}, { review_flags: ["existing_public_profile"] }).status, "already_public");
  assert.equal(match({ birth_year: 1907 }, { review_flags: ["existing_public_profile"] }).status, "held");
  assert.equal(match({}, { review_flags: ["existing_public_profile", "name_collision"] }).status, "held");
});
