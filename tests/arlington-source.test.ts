import test from "node:test";
import assert from "node:assert/strict";
import { arlingtonSources, extractArlington, sourceText } from "../src/lib/ingestion/arlington-source.ts";
const wrap = (body: string) => `<div id="dnn_ctr1076_ModuleContent"><h2>Sports</h2>${body}</div><!-- End_Module_1076 -->`;
test("official adapter extracts bounded name, lifespan and grave, not surrounding navigation", () => {
  const records = extractArlington(`<strong>Navigation</strong>${wrap('<p><strong>Test Person</strong>, U.S. Army (1900–1980) — An officer. (Section 1, Grave 2)<p><strong>Other Person</strong> (1901-1981) — A person. (Section 2, Grave 3)')}`, arlingtonSources[1]);
  assert.equal(records.length, 2); assert.equal(records[0].name, "Test Person");
  assert.equal(records[0].birth_year, 1900); assert.equal(records[0].burial_kind, "grave");
  assert.deepEqual(records[0].suggested_tags, ["military"]);
  assert.equal(records[0].source_sha256.length, 64);
  assert.equal(records[0].source_text.includes("Other Person"), false);
  assert.equal("confirmed" in records[0], false);
});
test("page category never establishes a role; memorials and ambiguous graves are held", () => {
  const [r] = extractArlington(wrap('<p><strong>Test Person</strong> (1900-1980) — A memorial, not an inventor. (Section 1, Grave 2) (Section 2, Grave 3)'), arlingtonSources[1]);
  assert.deepEqual(r.suggested_tags, []);
  assert.ok(r.flags.includes("burial_history_requires_review"));
  assert.ok(r.flags.includes("source_grave_ambiguous_or_missing"));
});
test("layout drift fails closed and entities preserve identity", () => {
  assert.throws(() => extractArlington("<h2>Sports</h2>", arlingtonSources[1]));
  assert.throws(() => extractArlington(wrap("<p>No named entries"), arlingtonSources[1]));
  assert.equal(sourceText("O&#39;Brien &amp; Smith&nbsp;&unknown;"), "O'Brien & Smith &unknown;");
});
test("an unrecognized following entry cannot donate its grave to the preceding person", () => {
  for (const next of ["<p><b>Different Person</b>", "<p><span><strong>Different Person</strong></span>"]) {
    const [r] = extractArlington(wrap(`<p><strong>Test Person</strong> (1900-1980) — No grave supplied.${next} (1901-1981) — (Section 3, Grave 5)`), arlingtonSources[1]);
    assert.equal(r.burial_kind, "unknown");
    assert.equal(r.source_text.includes("Different Person"), false);
    assert.ok(r.flags.includes("source_grave_ambiguous_or_missing"));
  }
});
