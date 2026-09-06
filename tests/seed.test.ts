import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seedSchema } from "../src/lib/validation/seed.ts";
import { buildSeed, sqlLiteral } from "../scripts/build-seed.ts";
import { demoPeople, demoNearby, demoInBounds } from "../src/lib/data/demo.ts";
import { dataConfig } from "../src/lib/data/config.ts";
const input = JSON.parse(
  readFileSync(new URL("../data/detroit.seed.json", import.meta.url), "utf8"),
);
const seed = seedSchema.parse(input);

test("22 traceable records preserve cemetery precision and unknown day/month", () => {
  assert.equal(seed.people.length, 22);
  for (const p of seed.people) {
    assert.equal(p.location_precision, "cemetery");
    assert.ok(p.source_url.startsWith("https://"));
    if (p.birth_date !== null)
      assert.ok(p.birth_date.startsWith(String(p.birth_year)));
  }
  assert.equal(demoPeople(seed)[0].latitude, seed.cemeteries[0].latitude);
});
test("seed rejects broken associations, chronology, duplicates and published fixtures", () => {
  for (const mutate of [
    (s: typeof seed) => {
      s.people[0].cemetery_id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    },
    (s: typeof seed) => {
      s.people[0].death_year = 1000;
    },
    (s: typeof seed) => {
      s.people[1].id = s.people[0].id;
    },
    (s: typeof seed) => {
      s.people[0].categories = ["missing"];
    },
  ]) {
    const s = structuredClone(seed);
    mutate(s);
    assert.equal(seedSchema.safeParse(s).success, false);
  }
  assert.equal(
    seedSchema.safeParse({ ...seed, status: "published" }).success,
    false,
  );
});
test("seed generation is deterministic and safely quotes apostrophes", () => {
  assert.equal(
    buildSeed(seed),
    readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
  assert.throws(() => sqlLiteral(NaN));
});
test("offline queries respect radius, category, score, bounds and caps", () => {
  const c = seed.cemeteries[0];
  assert.equal(
    demoNearby(seed, {
      latitude: c.latitude,
      longitude: c.longitude,
      radius_meters: 1,
    }).length,
    12,
  );
  const rows = demoNearby(seed, {
    latitude: c.latitude,
    longitude: c.longitude,
    radius_meters: 1,
    category_slug: "music",
    min_score: 90,
    result_limit: 1,
  });
  assert.equal(rows[0].slug, "aretha-franklin");
  assert.equal(rows[0].distance_meters, 0);
  assert.equal(
    demoInBounds(seed, {
      west: -84,
      east: -82,
      south: 42,
      north: 43,
      result_limit: 2,
    }).length,
    2,
  );
  assert.equal(
    demoInBounds(seed, { west: 170, east: -170, south: -10, north: 10 }).length,
    0,
  );
});
test("data mode is explicit; misconfiguration never silently serves demo", () => {
  assert.equal(dataConfig({}).mode, "demo");
  assert.throws(() => dataConfig({ NODE_ENV: "production" }));
  assert.throws(() => dataConfig({ DATA_MODE: "supabase" }));
  assert.throws(() => dataConfig({ DATA_MODE: "typo" }));
  assert.throws(() =>
    dataConfig({ DATA_MODE: "demo", NODE_ENV: "production" }),
  );
  assert.equal(
    dataConfig({
      DATA_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "read-only-test-key",
    }).mode,
    "supabase",
  );
});
