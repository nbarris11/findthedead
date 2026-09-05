import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seedSchema } from "../src/lib/validation/seed.ts";
import { demoSearchPeople } from "../src/lib/data/demo.ts";

const seed = seedSchema.parse(
  JSON.parse(
    readFileSync(new URL("../data/detroit.seed.json", import.meta.url), "utf8"),
  ),
);

test("demoSearchPeople: matches by prefix", () => {
  const results = demoSearchPeople(seed, { q: "aret" });
  assert.equal(results.length, 1);
  assert.equal(results[0].slug, "aretha-franklin");
});

test("demoSearchPeople: every query word must match (AND)", () => {
  assert.equal(
    demoSearchPeople(seed, { q: "aret fran" })[0]?.slug,
    "aretha-franklin",
  );
  assert.equal(demoSearchPeople(seed, { q: "aret nomatch" }).length, 0);
});

test("demoSearchPeople: case-insensitive and tolerates punctuation", () => {
  assert.equal(demoSearchPeople(seed, { q: "ARETHA" }).length, 1);
  assert.equal(demoSearchPeople(seed, { q: "rosa!!" }).length, 1);
});

test("demoSearchPeople: no matches returns an empty array", () => {
  assert.deepEqual(demoSearchPeople(seed, { q: "zzzznomatch" }), []);
});

test("demoSearchPeople: respects result_limit", () => {
  const results = demoSearchPeople(seed, { q: "a", result_limit: 3 });
  assert.equal(results.length, 3);
});

test("demoSearchPeople: rejects an empty query", () => {
  assert.throws(() => demoSearchPeople(seed, { q: "" }));
});
