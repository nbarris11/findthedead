import test from "node:test";
import assert from "node:assert/strict";
import { parseArlingtonPage, arlingtonIdentity, arlingtonOrderGuard } from "../src/lib/ingestion/arlington-api.ts";
const record = { ISS_ID: 42, DECEDENTINTERMENTID: 142, CemeteryId: 46, CemeteryName: "Arlington National Cemetery", PRIMARYFIRSTNAME: "Jane", PRIMARYMIDDLENAME: "A", PRIMARYLASTNAME: "Smith", SUFFIX: "", DOB: "02/29/1904 00:00", DOD: "03/01/1980 00:00", DOI: "03/04/1980 12:00", SECTION: "1", CEMETERYSECTION: "1", GRAVE: "4" };
const page = (r: unknown[] = [record], total = r.length) => ({ SearchResult: { Status: true, ErrorMessage: "", TotalCount: total, Records: r } });
test("pagination accepts unordered interments but rejects repeated composite IDs and backward persons", () => {
  const guard = arlingtonOrderGuard();
  guard({ ...record, DECEDENTINTERMENTID: 150 });
  guard({ ...record, DECEDENTINTERMENTID: 140 });
  assert.throws(() => guard({ ...record, DECEDENTINTERMENTID: 150 }));
  guard({ ...record, ISS_ID: 43 });
  assert.throws(() => guard({ ...record, DECEDENTINTERMENTID: 160 }));
});
test("valid local dates and identity preserve unknown burial disposition and omit images/tags", () => {
  const parsed = parseArlingtonPage(page([{ ...record, Images: [{ secret: "not a portrait" }], IsMemorial: false }]));
  const id = arlingtonIdentity(parsed.records[0]);
  assert.equal(id.birth_date, "1904-02-29"); assert.equal(id.name, "Jane A Smith");
  assert.equal(id.source_record_id, "arlington:42:142"); assert.equal(id.burial_kind, "unknown");
  assert.equal("Images" in parsed.records[0], false); assert.equal("confirmed" in id, false); assert.equal("tags" in id, false);
});
test("invalid real calendar dates and times never supply a year", () => {
  for (const DOB of ["02/29/1900 00:00", "04/31/1904", "01/01/1904 24:00", "01/01/1904 00:60", "00/01/1904", "1904-01-01", "01/01/0000"]) {
    const id = arlingtonIdentity({ ...record, DOB });
    assert.equal(id.birth_date, null); assert.equal(id.birth_year, null); assert.ok(id.flags.includes("birth_date_invalid"));
  }
});
test("date-only, year-only and missing precision remain explicit", () => {
  assert.equal(arlingtonIdentity({ ...record, DOB: "02/29/2000" }).birth_date, "2000-02-29");
  const id = arlingtonIdentity({ ...record, DOB: "1904", DOD: null });
  assert.equal(id.birth_year, 1904); assert.equal(id.birth_date, null);
  assert.ok(id.flags.includes("birth_date_year_only")); assert.ok(id.flags.includes("death_date_missing"));
});
test("failure envelopes, wrong cemeteries, missing fields and duplicate IDs fail closed", () => {
  for (const value of [null, {}, { SearchResult: { ...page().SearchResult, Status: false } }, { SearchResult: { ...page().SearchResult, ErrorMessage: "error" } }, page([{ ...record, CemeteryId: 1 }]), page([{ ...record, CemeteryName: "Other" }]), page([{ ...record, DOB: undefined }]), page([{ ...record, PRIMARYLASTNAME: undefined }]), page([record, record])]) assert.throws(() => parseArlingtonPage(value));
});
test("pagination bounds and chronology are guarded", () => {
  assert.throws(() => parseArlingtonPage(page([], 10), 0));
  assert.throws(() => parseArlingtonPage(page([record], 10), 10));
  assert.deepEqual(parseArlingtonPage(page([], 10), 10), { total: 10, records: [] });
  assert.ok(arlingtonIdentity({ ...record, DOD: "01/01/1900" }).flags.includes("date_chronology_conflict"));
  assert.ok(arlingtonIdentity({ ...record, PRIMARYFIRSTNAME: "" }).flags.includes("incomplete_name"));
});
test("one person can have distinct interment records, never inferred current burial", () => {
  const { records } = parseArlingtonPage(page([record, { ...record, DECEDENTINTERMENTID: 143 }]));
  assert.equal(records.length, 2);
  const identities = records.map(arlingtonIdentity);
  assert.notEqual(identities[0].record_id, identities[1].record_id);
  for (const id of identities) {
    assert.equal(id.burial_kind, "unknown");
    assert.ok(id.flags.includes("interment_vs_memorial_unverified"));
  }
  for (const DECEDENTINTERMENTID of [undefined, 0, -1, "142"]) {
    assert.throws(() => parseArlingtonPage(page([{ ...record, DECEDENTINTERMENTID }])));
  }
  assert.throws(() => parseArlingtonPage(page([record, { ...record }])));
});
