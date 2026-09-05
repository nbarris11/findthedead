import test from "node:test";
import assert from "node:assert/strict";
import { sortNearbyPeople } from "../src/lib/nearby/sort.ts";
import type { NearbyPerson } from "../src/types/database.ts";

function person(overrides: Partial<NearbyPerson> = {}): NearbyPerson {
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
    distance_meters: 1000,
    ...overrides,
  };
}

test("sortNearbyPeople: nearest orders by distance ascending", () => {
  const people = [
    person({ id: "a", distance_meters: 5000 }),
    person({ id: "b", distance_meters: 1000 }),
    person({ id: "c", distance_meters: 3000 }),
  ];
  assert.deepEqual(
    sortNearbyPeople(people, "nearest").map((p) => p.id),
    ["b", "c", "a"],
  );
});

test("sortNearbyPeople: notable orders by dead_score descending", () => {
  const people = [
    person({ id: "a", dead_score: 40 }),
    person({ id: "b", dead_score: 90 }),
    person({ id: "c", dead_score: 65 }),
  ];
  assert.deepEqual(
    sortNearbyPeople(people, "notable").map((p) => p.id),
    ["b", "c", "a"],
  );
});

test("sortNearbyPeople: recent orders by created_at descending", () => {
  const people = [
    person({ id: "a", created_at: "2026-01-01T00:00:00.000Z" }),
    person({ id: "b", created_at: "2026-03-01T00:00:00.000Z" }),
    person({ id: "c", created_at: "2026-02-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    sortNearbyPeople(people, "recent").map((p) => p.id),
    ["b", "c", "a"],
  );
});

test("sortNearbyPeople: ties break by id and input is not mutated", () => {
  const original = [
    person({ id: "b", distance_meters: 1000 }),
    person({ id: "a", distance_meters: 1000 }),
  ];
  const sorted = sortNearbyPeople(original, "nearest");
  assert.deepEqual(sorted.map((p) => p.id), ["a", "b"]);
  assert.deepEqual(original.map((p) => p.id), ["b", "a"]);
});
