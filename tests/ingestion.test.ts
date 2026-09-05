import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSparqlResults } from "../src/lib/ingestion/normalize.ts";
import { dedupeCandidates, slugify } from "../src/lib/ingestion/dedupe.ts";
import type { SparqlResponse } from "../src/lib/ingestion/wikidata.ts";
import type { IngestionCandidate } from "../src/lib/ingestion/types.ts";

function binding(overrides: Record<string, string | undefined>) {
  const out: Record<string, { value: string; type: string }> = {};
  for (const [key, value] of Object.entries(overrides))
    if (value !== undefined) out[key] = { value, type: "literal" };
  return out;
}

test("normalizeSparqlResults: extracts QIDs, dates, coordinates, image, and article", () => {
  const response: SparqlResponse = {
    results: {
      bindings: [
        binding({
          person: "http://www.wikidata.org/entity/Q1000",
          personLabel: "Example Person",
          birth: "1942-03-25T00:00:00Z",
          death: "2018-08-16T00:00:00Z",
          burialPlace: "http://www.wikidata.org/entity/Q2000",
          burialPlaceLabel: "Example Cemetery",
          burialCoord: "Point(-83.1261 42.4419)",
          image: "http://commons.wikimedia.org/wiki/Special:FilePath/Example%20Person.jpg",
          article: "https://en.wikipedia.org/wiki/Example_Person",
        }),
      ],
    },
  };
  const [candidate] = normalizeSparqlResults(response, "2026-09-05T00:00:00Z", "https://query.wikidata.org/sparql?query=...");
  assert.equal(candidate.wikidata_id, "Q1000");
  assert.equal(candidate.name, "Example Person");
  assert.equal(candidate.birth_date, "1942-03-25");
  assert.equal(candidate.birth_year, 1942);
  assert.equal(candidate.death_date, "2018-08-16");
  assert.equal(candidate.death_year, 2018);
  assert.equal(candidate.burial_place_wikidata_id, "Q2000");
  assert.equal(candidate.burial_place_name, "Example Cemetery");
  assert.equal(candidate.burial_place_latitude, 42.4419);
  assert.equal(candidate.burial_place_longitude, -83.1261);
  assert.equal(candidate.commons_file, "Example Person.jpg");
  assert.equal(candidate.wikipedia_url, "https://en.wikipedia.org/wiki/Example_Person");
});

test("normalizeSparqlResults: treats January 1st dates as imprecise (year-only)", () => {
  const response: SparqlResponse = {
    results: {
      bindings: [
        binding({
          person: "http://www.wikidata.org/entity/Q1000",
          personLabel: "Year Only Person",
          death: "1900-01-01T00:00:00Z",
          burialPlace: "http://www.wikidata.org/entity/Q2000",
          burialPlaceLabel: "Example Cemetery",
        }),
      ],
    },
  };
  const [candidate] = normalizeSparqlResults(response, "2026-09-05T00:00:00Z", "https://example.test");
  assert.equal(candidate.death_year, 1900);
  assert.equal(candidate.death_date, null);
});

test("normalizeSparqlResults: missing optional fields become null, not thrown errors", () => {
  const response: SparqlResponse = {
    results: {
      bindings: [
        binding({
          person: "http://www.wikidata.org/entity/Q1000",
          personLabel: "Sparse Person",
          burialPlace: "http://www.wikidata.org/entity/Q2000",
          burialPlaceLabel: "Example Cemetery",
        }),
      ],
    },
  };
  const [candidate] = normalizeSparqlResults(response, "2026-09-05T00:00:00Z", "https://example.test");
  assert.equal(candidate.birth_date, null);
  assert.equal(candidate.birth_year, null);
  assert.equal(candidate.wikipedia_url, null);
  assert.equal(candidate.commons_file, null);
  assert.equal(candidate.burial_place_latitude, null);
});

function candidate(overrides: Partial<IngestionCandidate> = {}): IngestionCandidate {
  return {
    wikidata_id: "Q1",
    name: "New Person",
    birth_date: null,
    birth_year: 1900,
    death_date: null,
    death_year: 1980,
    wikipedia_url: null,
    commons_file: null,
    burial_place_wikidata_id: "Q2",
    burial_place_name: "Some Cemetery",
    burial_place_latitude: 42,
    burial_place_longitude: -83,
    retrieved_at: "2026-09-05T00:00:00Z",
    source_url: "https://example.test",
    ...overrides,
  };
}

test("slugify: strips diacritics and non-alphanumerics", () => {
  assert.equal(slugify("José García"), "jose-garcia");
  assert.equal(slugify("O'Brien-Smith Jr."), "o-brien-smith-jr");
});

test("dedupeCandidates: flags an existing slug as a possible duplicate, never merges", () => {
  const results = dedupeCandidates(
    [candidate({ name: "Aretha Franklin" })],
    new Set(["aretha-franklin"]),
    new Set(),
  );
  assert.equal(results[0].dedupe_status, "possible_duplicate");
  assert.match(results[0].dedupe_reason ?? "", /aretha-franklin/);
});

test("dedupeCandidates: flags an existing wikidata_id as a possible duplicate", () => {
  const results = dedupeCandidates(
    [candidate({ wikidata_id: "Q999", name: "Totally Different Name" })],
    new Set(),
    new Set(["Q999"]),
  );
  assert.equal(results[0].dedupe_status, "possible_duplicate");
  assert.match(results[0].dedupe_reason ?? "", /Q999/);
});

test("dedupeCandidates: a genuinely new person is marked new with no reason", () => {
  const results = dedupeCandidates([candidate()], new Set(), new Set());
  assert.equal(results[0].dedupe_status, "new");
  assert.equal(results[0].dedupe_reason, null);
  assert.equal(results[0].slug, "new-person");
});

test("dedupeCandidates: deduplicates the same wikidata_id within one batch", () => {
  const results = dedupeCandidates(
    [candidate({ wikidata_id: "Q1" }), candidate({ wikidata_id: "Q1" })],
    new Set(),
    new Set(),
  );
  assert.equal(results.length, 1);
});
