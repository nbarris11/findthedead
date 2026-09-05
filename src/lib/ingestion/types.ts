/** One person as fetched and normalized from Wikidata, before any human
 *  review. Deliberately carries no editorial fields (short_description,
 *  categories, dead_score) — those cannot be derived from Wikidata facts
 *  without inventing them, and the `people` table requires a real,
 *  human-written short_description. See docs/DATA-SOURCES.md. */
export type IngestionCandidate = {
  wikidata_id: string;
  name: string;
  birth_date: string | null;
  birth_year: number | null;
  death_date: string | null;
  death_year: number | null;
  wikipedia_url: string | null;
  /** Raw Commons filename (e.g. "Example.jpg"), not yet resolved to a
   *  licensed, attributed image — see docs/DATA-SOURCES.md on why this can
   *  never be inserted into `images` directly. */
  commons_file: string | null;
  burial_place_wikidata_id: string;
  burial_place_name: string;
  burial_place_latitude: number | null;
  burial_place_longitude: number | null;
  retrieved_at: string;
  source_url: string;
};

export type DedupeStatus = "new" | "possible_duplicate";

export type DedupedCandidate = IngestionCandidate & {
  slug: string;
  dedupe_status: DedupeStatus;
  /** Why this was flagged, e.g. "slug matches existing person aretha-franklin".
   *  Null for "new". Never auto-resolved — a human decides what to do with it. */
  dedupe_reason: string | null;
};

export type IngestionRun = {
  run_id: string;
  started_at: string;
  finished_at: string;
  source: "wikidata";
  query_description: string;
  candidate_count: number;
  new_count: number;
  possible_duplicate_count: number;
  candidates: DedupedCandidate[];
};
