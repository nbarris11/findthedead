import test from "node:test";
import assert from "node:assert/strict";
import { reviewedCandidateSchema } from "../src/lib/ingestion/reviewed.ts";
import {
  cemeterySlugForInsert,
  reviewedImageSourceRow,
} from "../src/lib/ingestion/publish.ts";

function reviewed(overrides: Record<string, unknown> = {}) {
  return {
    wikidata_id: "Q499167",
    slug: "david-dunbar-buick",
    name: "David Dunbar Buick",
    birth_date: "1854-09-17",
    birth_year: 1854,
    death_date: "1929-03-05",
    death_year: 1929,
    wikipedia_url: "https://en.wikipedia.org/wiki/David_Dunbar_Buick",
    burial_place_wikidata_id: "Q8033109",
    burial_place_name: "Woodmere Cemetery",
    burial_place_latitude: 42.3,
    burial_place_longitude: -83.1375,
    short_description: "Founded the Buick Motor Company.",
    categories: ["business", "inventors"],
    dead_score: 70,
    confirmed: true,
    ...overrides,
  };
}

test("reviewedCandidateSchema: accepts a fully reviewed candidate", () => {
  const result = reviewedCandidateSchema.safeParse(reviewed());
  assert.equal(result.success, true);
});

test("reviewedCandidateSchema: confirmed must be exactly true, not just truthy", () => {
  assert.equal(reviewedCandidateSchema.safeParse(reviewed({ confirmed: false })).success, false);
  assert.equal(reviewedCandidateSchema.safeParse(reviewed({ confirmed: 1 })).success, false);
  const withoutConfirmed: Record<string, unknown> = reviewed();
  delete withoutConfirmed.confirmed;
  assert.equal(reviewedCandidateSchema.safeParse(withoutConfirmed).success, false);
});

test("reviewedCandidateSchema: rejects a missing short_description", () => {
  assert.equal(
    reviewedCandidateSchema.safeParse(reviewed({ short_description: "" })).success,
    false,
  );
});

test("reviewedCandidateSchema: rejects an empty categories array", () => {
  assert.equal(reviewedCandidateSchema.safeParse(reviewed({ categories: [] })).success, false);
});

test("reviewedCandidateSchema: rejects an out-of-range dead_score", () => {
  assert.equal(reviewedCandidateSchema.safeParse(reviewed({ dead_score: 101 })).success, false);
  assert.equal(reviewedCandidateSchema.safeParse(reviewed({ dead_score: -1 })).success, false);
});

test("reviewedCandidateSchema: rejects a malformed wikidata_id", () => {
  assert.equal(
    reviewedCandidateSchema.safeParse(reviewed({ wikidata_id: "not-a-qid" })).success,
    false,
  );
});

test("reviewedCandidateSchema: accepts fully attributed Commons images", () => {
  const result = reviewedCandidateSchema.safeParse(
    reviewed({
      image: {
        url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Portrait.jpg",
        alt_text: "Historical portrait of David Dunbar Buick.",
        creator: "Example photographer",
        license: "Public domain",
        attribution: "Example photographer · Public domain · Wikimedia Commons",
        source_url: "https://commons.wikimedia.org/wiki/File:Portrait.jpg",
        source_external_id: "Portrait.jpg",
      },
    }),
  );
  assert.equal(result.success, true);
});

test("reviewed image source belongs only to the image", () => {
  const candidate = reviewedCandidateSchema.parse(
    reviewed({
      image: {
        url: "https://upload.wikimedia.org/wikipedia/commons/a/a1/Portrait.jpg",
        alt_text: "Historical portrait of David Dunbar Buick.",
        creator: "Example photographer",
        license: "Public domain",
        attribution: "Example photographer · Public domain · Wikimedia Commons",
        source_url: "https://commons.wikimedia.org/wiki/File:Portrait.jpg",
        source_external_id: "Portrait.jpg",
      },
    }),
  );
  const source = reviewedImageSourceRow(candidate, "image-id");
  assert.equal(source.image_id, "image-id");
  assert.equal("person_id" in source, false);
});

test("reviewedCandidateSchema: rejects untrusted image hosts and missing attribution", () => {
  const image = {
    url: "https://example.com/portrait.jpg",
    alt_text: "Historical portrait of David Dunbar Buick.",
    creator: "Example photographer",
    license: "Public domain",
    attribution: "",
    source_url: "https://commons.wikimedia.org/wiki/File:Portrait.jpg",
    source_external_id: "Portrait.jpg",
  };
  assert.equal(reviewedCandidateSchema.safeParse(reviewed({ image })).success, false);
});

test("cemetery slugs stay readable but do not merge same-name cemeteries", () => {
  assert.equal(
    cemeterySlugForInsert("Oakwood Cemetery", "Q123", false),
    "oakwood-cemetery",
  );
  assert.equal(
    cemeterySlugForInsert("Oakwood Cemetery", "Q456", true),
    "oakwood-cemetery-q456",
  );
});
