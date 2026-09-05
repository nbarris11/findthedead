import test from "node:test";
import assert from "node:assert/strict";
import {
  toFeatureCollection,
  isCoincident,
} from "../src/lib/explore/geojson.ts";
import {
  formatDistance,
  formatLifespan,
  formatPrecision,
  pluralizePeople,
} from "../src/lib/explore/format.ts";
import type { DiscoveryPerson } from "../src/types/database.ts";

function person(overrides: Partial<DiscoveryPerson> = {}): DiscoveryPerson {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "example-person",
    name: "Example Person",
    birth_year: 1900,
    death_year: 1980,
    short_description: "A person.",
    dead_score: 50,
    burial_id: "00000000-0000-0000-0000-000000000002",
    cemetery_id: "00000000-0000-0000-0000-000000000003",
    cemetery_name: "Example Cemetery",
    location_precision: "cemetery",
    location_confidence: 0.5,
    latitude: 42.4419,
    longitude: -83.1261,
    categories: ["history"],
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("toFeatureCollection maps coordinates and carries id/score only", () => {
  const collection = toFeatureCollection([
    person({ id: "a", latitude: 1, longitude: 2, dead_score: 90 }),
    person({ id: "b", latitude: 3, longitude: 4, dead_score: 10 }),
  ]);
  assert.equal(collection.features.length, 2);
  assert.deepEqual(collection.features[0].geometry.coordinates, [2, 1]);
  assert.deepEqual(collection.features[0].properties, {
    id: "a",
    dead_score: 90,
  });
  assert.notEqual(collection.features[0].id, collection.features[1].id);
});

test("isCoincident detects burials sharing one cemetery-precision point", () => {
  assert.equal(isCoincident([]), true);
  assert.equal(isCoincident([[-83.1261, 42.4419]]), true);
  assert.equal(
    isCoincident([
      [-83.1261, 42.4419],
      [-83.1261, 42.4419],
    ]),
    true,
  );
  assert.equal(
    isCoincident([
      [-83.1261, 42.4419],
      [-83.02, 42.35],
    ]),
    false,
  );
});

test("formatDistance never overstates precision", () => {
  assert.equal(formatDistance(-1), "Distance unknown");
  assert.equal(formatDistance(NaN), "Distance unknown");
  assert.equal(formatDistance(80), "Less than 0.1 mi away");
  assert.equal(formatDistance(8047), "5.0 mi away");
  assert.equal(formatDistance(160934), "100 mi away");
});

test("formatLifespan and formatPrecision handle missing data honestly", () => {
  assert.equal(formatLifespan(1900, 1980), "1900 – 1980");
  assert.equal(formatLifespan(null, null), "Dates unknown");
  assert.equal(formatLifespan(1900, null), "1900 – ?");
  assert.equal(formatPrecision("cemetery"), "Cemetery location only");
  assert.equal(formatPrecision("exact_grave"), "Exact grave location");
});

test("pluralizePeople", () => {
  assert.equal(pluralizePeople(0), "0 interesting dead people");
  assert.equal(pluralizePeople(1), "1 interesting dead person");
  assert.equal(pluralizePeople(2), "2 interesting dead people");
});
