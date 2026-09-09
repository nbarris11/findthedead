import test from "node:test";
import assert from "node:assert/strict";
import { entityId, linkedIds, referenceUrls, researchFlags, retryDelay, suggestTags, validResearchPacket } from "../src/lib/ingestion/research.ts";
import type { ResearchCandidate, ResearchEntity, Statement } from "../src/lib/ingestion/research.ts";

const claim = (id: string, overrides = {}): Statement => ({ mainsnak: { datavalue: { value: { id } } }, rank: "normal", ...overrides });
const person: ResearchCandidate = { wikidata_id: "Q23", name: "George Washington", wikipedia_url: null, commons_file: null, burial_place_ids: ["Q99"], name_collision: false };

test("truncated, approved, wrong-ID and changed-candidate packets cannot skip research", () => {
  const packet = { version: 1, wikidata_id: "Q23", retrieved_at: "2026-09-09T22:00:00Z", status: "needs_review", review_required: true, original_candidate: person, claims: {}, flags: ["independent_source_review_required"], suggested_tags: [], burial_reference_urls: [], linked_entities: [], article: null, image: null };
  assert.equal(validResearchPacket(packet, person), true);
  for (const patch of [{ status: "approved" }, { wikidata_id: "Q24" }, { article: undefined }, { review_required: false }]) assert.equal(validResearchPacket({ ...packet, ...patch }, person), false);
  assert.equal(validResearchPacket({ version: 1, wikidata_id: "Q23", status: "needs_review" }, person), false);
  assert.equal(validResearchPacket(packet, { ...person, burial_place_ids: ["Q100"] }), false);
});

test("research preserves ambiguity instead of approving referenced claims", () => {
  const e: ResearchEntity = { id: "Q23", labels: { en: { value: person.name } }, claims: {
    P31: [claim("Q5")], P119: [claim("Q99", { references: [{ snaks: { P854: [{ datavalue: { value: "https://example.org/source" } }] } }] }), claim("Q100", { qualifiers: { P582: [] } })],
    P569: [claim("Q1"), claim("Q2")],
  } };
  const flags = researchFlags(person, e);
  for (const flag of ["independent_source_review_required", "multiple_burial_places", "burial_qualifiers_need_review", "burial_without_attached_reference", "P569_conflicting_values", "P570_missing"]) assert.ok(flags.includes(flag));
  assert.equal(flags.includes("no_direct_burial_reference_url"), false);
});

test("deprecated claims cannot supply a current burial or role", () => {
  const e: ResearchEntity = { id: "Q23", claims: { P119: [claim("Q99", { rank: "deprecated" })], P106: [claim("Q2", { rank: "deprecated" })] } };
  assert.ok(researchFlags(person, e).includes("no_current_burial_value"));
  assert.ok(researchFlags(person, e).includes("burial_changed_since_collection"));
  assert.deepEqual(suggestTags(e, { Q2: "inventor" }), []);
});

test("role suggestions preserve evidence and distinguish company presidents", () => {
  const e: ResearchEntity = { id: "Q23", claims: { P39: [claim("Q1", { id: "office" }), claim("Q2")], P106: [claim("Q3"), claim("Q4")] } };
  const tags = suggestTags(e, { Q1: "President of the United States", Q2: "company president", Q3: "inventor", Q4: "political scientist" });
  assert.deepEqual(tags.map((t) => t.slug), ["inventors", "presidents"]);
  assert.ok(tags.every((t) => t.review_required));
  assert.equal(tags[1].statement_id, "office");
  assert.deepEqual(linkedIds(e), ["Q3", "Q4", "Q1", "Q2"]);
});

test("reference URLs are leads, not executable links or authority judgments", () => {
  const s = claim("Q1", { references: [{ snaks: { P854: ["https://example.org/a", "https://example.org/a", "javascript:alert(1)", "file:///secret", "not a URL"].map((value) => ({ datavalue: { value } })) } }] });
  assert.deepEqual(referenceUrls([s]), ["https://example.org/a"]);
  assert.equal(entityId({ snaktype: "somevalue" }), null);
  assert.equal(entityId({ datavalue: { value: "Q123" } }), null);
});

test("missing entities and name collisions stay flagged", () => {
  const flags = researchFlags({ ...person, name_collision: true }, { id: "Q23", missing: "" });
  assert.ok(flags.includes("missing_or_changed_entity"));
  assert.ok(flags.includes("name_collision"));
  assert.ok(flags.includes("human_identity_check_required"));
});

test("rate-limit backoff honors seconds, HTTP dates, and invalid headers", () => {
  assert.equal(retryDelay("12", 0), 12000);
  assert.equal(retryDelay("Wed, 09 Sep 2026 22:00:10 GMT", 0, Date.parse("2026-09-09T22:00:00Z")), 10000);
  assert.equal(retryDelay("invalid", 2), 8000);
  assert.equal(retryDelay("-1", 0), 1000);
});
