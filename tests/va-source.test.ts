import test from "node:test";
import assert from "node:assert/strict";
import { VA_FIELDS, chunkVa, parseVaRows, planVa, sqlVa, vaDate, vaQuery, vaSurname } from "../src/lib/ingestion/va-source.ts";
test("VA dates retain source precision and reject guessed or impossible dates", () => {
  assert.deepEqual(vaDate("1925"), { year: 1925, date: null, precision: "year" });
  assert.deepEqual(vaDate("02/29/2000"), { year: 2000, date: "2000-02-29", precision: "day" });
  for (const value of ["02/29/1900", "01/01/0192", "2000-01-01", "13/01/2000", null, ""]) assert.equal(vaDate(value), null);
});
test("VA surname leads are conservative retrieval hints", () => {
  assert.equal(vaSurname("John O'Brien"), "O'BRIEN");
  for (const name of ["Prince", "John Smith Jr.", "John Smith (writer)", "Smith, John", "Q123"]) assert.equal(vaSurname(name), null);
  const candidate = { wikidata_id: "Q1", name: "John Smith", review_flags: [], burial_claims: [{ birth_year: 1900, death_year: 1980 }] };
  const p = planVa([candidate, { ...candidate, wikidata_id: "Q2", burial_claims: [{ birth_year: 1901, death_year: null }] }, { ...candidate, wikidata_id: "Q3", review_flags: ["existing_public_profile"] }]);
  assert.deepEqual(p.groups, [[{ surname: "SMITH", death_years: [1980] }]]); assert.equal(p.held.length, 1);
});
test("VA query safely escapes names and limits surname retrieval by death year", () => {
  assert.equal(sqlVa("O'BRIEN"), "'O''BRIEN'");
  const u = new URL(vaQuery([{ surname: "O'BRIEN", death_years: [1980] }], "123"));
  assert.ok(u.searchParams.get("$where")!.includes("'O''BRIEN'"));
  assert.ok(u.searchParams.get("$where")!.includes("d_death_date like '%/1980'"));
  assert.ok(u.searchParams.get("$where")!.includes("decedent_id > 123"));
  assert.equal(u.searchParams.get("$limit"), "1000"); assert.equal(u.searchParams.get("$order"), "decedent_id ASC");
  assert.equal(VA_FIELDS.some((f) => /^(branch|rank|war|v_|image)/.test(f)), false);
  assert.throws(() => vaQuery([], "0")); assert.throws(() => vaQuery([{ surname: "X", death_years: [1980] }], "0 OR 1=1"));
});
test("VA chunks are bounded and rows reject malformed values while excluding other-person fields", () => {
  assert.deepEqual(chunkVa(Array.from({ length: 41 }, (_, i) => i)).map((g) => g.length), [20, 20, 1]); assert.throws(() => chunkVa([], 0));
  const [row] = parseVaRows([{ decedent_id: "123", d_first_name: "Jane", branch: "US ARMY", v_first_name: "Other", location_point: { type: "Point", coordinates: [-80, 40] } }]);
  assert.equal("branch" in row, false); assert.equal("v_first_name" in row, false); assert.equal("confirmed" in row, false);
  for (const value of [{}, [{ decedent_id: "bad" }], [{ decedent_id: "1", d_death_date: 1980 }], [{ decedent_id: "1", location_point: { type: "Point", coordinates: [200, 40] } }]]) assert.throws(() => parseVaRows(value));
});
test("common surnames split into bounded disjoint year queries without losing leads", () => {
  const queue = Array.from({ length: 220 }, (_, i) => ({ wikidata_id: `Q${i + 1}`, name: "John Smith", review_flags: [], burial_claims: [{ birth_year: 1700, death_year: 1800 + i }] }));
  const plan = planVa(queue);
  assert.equal(plan.groups.flat().flatMap((g) => g.death_years).length, 220);
  assert.ok(plan.groups.every((g) => g.length <= 20 && vaQuery(g).length <= 7000));
});
