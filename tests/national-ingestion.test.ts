import test from "node:test";
import assert from "node:assert/strict";
import { containsPoint, boundaryBoxes, splitBox, buildBurialBoxQuery, type Boundary } from "../src/lib/ingestion/national.ts";

const boundary: Boundary = { type: "Feature", properties: {STUSAB: "TEST"}, geometry: {type: "MultiPolygon", coordinates: [
  [[[0,0],[10,0],[10,10],[0,10],[0,0]], [[2,2],[4,2],[4,4],[2,4],[2,2]]],
  [[[20,20],[22,20],[22,22],[20,22],[20,20]]],
]}};
test("national boundaries retain islands and exclude polygon holes and invalid points", () => {
  assert.equal(containsPoint(boundary, 1, 1), true);
  assert.equal(containsPoint(boundary, 3, 3), false);
  assert.equal(containsPoint(boundary, 21, 21), true);
  assert.equal(containsPoint(boundary, 15, 15), false);
  assert.equal(containsPoint(boundary, NaN, 1), false);
});
test("Alaska bounds split at the dateline instead of scanning most of Earth", () => {
  const alaska: Boundary = {type: "Feature", properties: {STUSAB:"AK"}, geometry: {type:"MultiPolygon", coordinates:[
    [[[-179,51],[-130,51],[-130,72],[-179,51]]],
    [[[172,51],[179,51],[179,54],[172,51]]],
  ]}};
  assert.deepEqual(boundaryBoxes(alaska), [[-179,51,-130,72],[172,51,179,54]]);
});
test("query subdivisions cover both halves and invalid limits cannot enter SPARQL", () => {
  assert.deepEqual(splitBox([-100,30,-80,40]), [[-100,30,-90,40],[-90,30,-80,40]]);
  assert.match(buildBurialBoxQuery([-100,30,-80,40]), /wikibase:box/);
  assert.doesNotMatch(buildBurialBoxQuery([-100,30,-80,40]), /wikibase:around/);
  assert.throws(() => buildBurialBoxQuery([-100,30,-80,40], Infinity));
  assert.throws(() => buildBurialBoxQuery([100,30,-80,40]));
});

test("dense-area pagination uses stable ordering and validates offsets", () => {
  const query = buildBurialBoxQuery([-78,38,-76,40], 2000, 4000);
  assert.match(query, /ORDER BY .*\nLIMIT 2000\nOFFSET 4000/);
  assert.throws(() => buildBurialBoxQuery([-78,38,-76,40], 2000, -1));
  assert.throws(() => buildBurialBoxQuery([-78,38,-76,40], 2000, NaN));
});
