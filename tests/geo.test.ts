import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceMeters,
  milesToMeters,
  isInBounds,
} from "../src/lib/geo/distance.ts";
import {
  nearbyQuerySchema,
  boundsQuerySchema,
} from "../src/lib/validation/geo.ts";

test("distance conversion and great-circle approximation", () => {
  assert.equal(milesToMeters(1), 1609.344);
  assert.equal(
    distanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
    0,
  );
  assert.ok(
    Math.abs(
      distanceMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ) - 111195,
    ) < 2,
  );
  assert.ok(
    distanceMeters(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    ) < 23000,
  );
  assert.ok(
    Number.isFinite(
      distanceMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 180 },
      ),
    ),
  );
});
test("rejects invalid and unbounded geographic inputs", () => {
  for (const q of [
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: NaN },
    { latitude: 0, longitude: 0, radius_meters: -1 },
    { latitude: 0, longitude: 0, result_limit: 201 },
    { latitude: 0, longitude: 0, min_score: 101 },
    { latitude: 0, longitude: 0, radius_meters: Infinity },
  ])
    assert.equal(nearbyQuerySchema.safeParse(q).success, false);
  assert.throws(() => milesToMeters(-1));
  assert.equal(
    boundsQuerySchema.safeParse({ west: 0, east: 1, south: 20, north: 10 })
      .success,
    false,
  );
});
test("antimeridian bounds include both sides and exclude Greenwich", () => {
  const bounds = { west: 170, east: -170, south: -20, north: 20 };
  assert.equal(isInBounds({ latitude: 0, longitude: 179 }, bounds), true);
  assert.equal(isInBounds({ latitude: 0, longitude: -179 }, bounds), true);
  assert.equal(isInBounds({ latitude: 0, longitude: 0 }, bounds), false);
  assert.equal(isInBounds({ latitude: 20, longitude: 170 }, bounds), true);
});
