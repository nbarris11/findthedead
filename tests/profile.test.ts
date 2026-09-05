import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seedSchema } from "../src/lib/validation/seed.ts";
import {
  demoPersonProfile,
  demoCemeteryProfile,
} from "../src/lib/data/demo.ts";

const seed = seedSchema.parse(
  JSON.parse(
    readFileSync(new URL("../data/detroit.seed.json", import.meta.url), "utf8"),
  ),
);

test("demoPersonProfile: known slug resolves full profile with cemetery and sources", () => {
  const profile = demoPersonProfile(seed, "aretha-franklin");
  assert.ok(profile);
  assert.equal(profile.name, "Aretha Franklin");
  assert.equal(profile.cemetery?.slug, "woodlawn-detroit");
  assert.equal(profile.cemetery?.name, "Woodlawn Cemetery");
  assert.equal(profile.images.length, 0);
  assert.equal(profile.sources.length, 2);
  assert.ok(profile.sources.every((s) => s.url === profile.sources[0].url));
  assert.deepEqual(
    new Set(profile.sources.map((s) => s.field)),
    new Set(["name,birth_year,death_year,short_description", "cemetery_id"]),
  );
});

test("demoPersonProfile: unknown slug returns null", () => {
  assert.equal(demoPersonProfile(seed, "not-a-real-person"), null);
});

test("demoCemeteryProfile: known slug lists its people sorted by dead_score and represented categories", () => {
  const profile = demoCemeteryProfile(seed, "woodlawn-detroit");
  assert.ok(profile);
  assert.equal(profile.name, "Woodlawn Cemetery");
  assert.equal(profile.latitude, 42.4419);
  assert.equal(profile.longitude, -83.1261);
  assert.ok(profile.people.length > 0);
  assert.ok(
    profile.people.every((p) => p.cemetery_id === profile.id),
    "every listed person must belong to this cemetery",
  );
  for (let i = 1; i < profile.people.length; i++)
    assert.ok(profile.people[i - 1].dead_score >= profile.people[i].dead_score);
  const expectedCategories = new Set(
    profile.people.flatMap((p) => p.categories),
  );
  assert.deepEqual(
    new Set(profile.categories.map((c) => c.slug)),
    expectedCategories,
  );
  assert.equal(profile.sources.length, 1);
});

test("demoCemeteryProfile: unknown slug returns null", () => {
  assert.equal(demoCemeteryProfile(seed, "not-a-real-cemetery"), null);
});
