# Sources and ingestion policy

Use Wikidata (structured facts, CC0), Wikipedia (fact checking and pointers; prose licensing requires care), Wikimedia Commons (per-file license), official cemetery material, and public historical records. Do not scrape Find a Grave, BillionGraves, or other third-party cemetery directories. Link to sources; never copy biographies wholesale.

Every factual seed field needs traceable evidence. Record retrieval time, URL, field scope, confidence, and entity association. Editorial descriptions and Dead Scores must be distinguished from imported facts. Unknown date components and images remain absent. Coordinates require separate verification from burial membership.

Development seeds will be committed and usable offline. Unverified data must remain labeled fixtures with draft status and no public read access. Public release requires source/coordinate review and licensed images. A cemetery center is not an entrance or exact grave; future directions must explain that distinction.

## Ingestion (Milestone 7)

`npm run ingest:wikidata -- [--limit N] [--radius-km N]` (default 25 people, 40km; hard ceiling 100 — a proof of concept, not a national importer) queries Wikidata's public SPARQL endpoint for deceased people (`wdt:P31 wd:Q5`) with a documented place of burial (`wdt:P119`) whose coordinates fall within the given radius of Detroit, via Blazegraph's `wikibase:around` geospatial service. That one query returns name, birth/death dates, the burial place and its coordinates, a Wikipedia URL, and a Commons image filename — everything the pipeline needs from exactly one HTTP request, regardless of result count. Requests identify themselves with a real User-Agent per Wikimedia's User-Agent policy and retry on 429/5xx with backoff, honoring `Retry-After` when the endpoint sends one.

Occupation is deliberately not fetched. It would need multi-value aggregation for a field with nowhere to go: category assignment is an editorial decision (see below), never derived automatically from Wikidata's occupation ontology.

Results are normalized (`src/lib/ingestion/normalize.ts`) and deduplicated (`src/lib/ingestion/dedupe.ts`) against the existing seed by `wikidata_id` first, then by a generated slug — a slug match is flagged `possible_duplicate` with a reason, never silently merged. Run live against Detroit, this correctly caught Aretha Franklin, James Jamerson, and David Ruffin as already in the seed, while surfacing genuinely new real people with a documented burial nearby (Erma Franklin, C. L. Franklin, Barrett Strong, David Dunbar Buick, Henry M. Leland, among others) — a real proof, not a hypothetical one. The run is written to `data/ingestion-runs/<uuid>.json` (gitignored — raw fetch output is not reviewed content) with a run ID, query description, and every candidate's source URL for later auditing. Nothing is written to any database by this step.

A raw candidate cannot become a real `people` row on its own: the schema requires a human-written `short_description` (1–500 characters, `not null`), and this project will not fabricate one to make ingestion look more automated than it is. `src/lib/ingestion/reviewed.ts` defines what a candidate needs after a human has actually reviewed it — `short_description`, at least one category, a Dead Score, and an explicit `confirmed: true` that is not a default a reviewer can leave in place by accident. `npm run publish:reviewed -- <file> --confirm` (`scripts/publish-reviewed-candidates.ts`) takes a copy of a run file that has been edited to add those fields, validates every candidate before writing anything, and upserts each as `status='draft', is_fixture=false` — a real draft record, but never published. Publication stays the separate, later, human action it already was for the seed (see docs/DATABASE.md). This script requires `SUPABASE_SERVICE_ROLE_KEY`, since RLS grants anon/authenticated read-only access; it has not been run against a live project in this repository, since no such project has write credentials configured yet.

A known, documented limitation: Wikidata's SPARQL results don't expose date precision, so a year-precision date ("just 1942") is indistinguishable from a genuine January 1st and is treated as imprecise (year kept, exact date dropped) — a heuristic, not a guarantee a reviewer should skip checking. Commons image filenames are captured but never inserted into `images`: resolving an actual license and attribution needs a separate Commons API call this proof of concept does not make, and per this document's own policy, no image is publishable without that metadata.

## Technical references consulted

- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/database/extensions/postgis
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Initial seed review — 2026-09-05

`data/detroit.seed.json` contains 22 real deceased people and two Detroit cemeteries, not invented identities. Names, known years, brief factual occupation labels and burial membership were checked against these revision-specific reference lists:

- [Woodlawn Cemetery](https://en.wikipedia.org/w/index.php?title=Woodlawn_Cemetery_(Detroit)&oldid=1365624171): 12 people; cemetery reference coordinate 42.4419, -83.1261.
- [Elmwood Cemetery](https://en.wikipedia.org/w/index.php?title=Elmwood_Cemetery_(Detroit)&oldid=1372400484): 10 people; cemetery reference coordinate 42.34722, -83.01861.
- [Official Woodlawn site](https://www.woodlawncemeterydetroit.com/) additionally names Aretha Franklin, Rosa Parks, the Dodge brothers, Edsel Ford, James Jamerson, David Ruffin and Levi Stubbs among those resting there.

Original short labels summarize factual roles; no biographies or images were copied. `birth_date`/`death_date` remain null because this review only established years. `why_interesting` and `biography` await profile research. Category assignments, featured flags, confidence values and Dead Scores are provisional editorial decisions, not sourced metrics. The citation URLs are reference evidence, not personal Wikipedia URLs or Wikidata IDs.

All seed entities remain drafts with `is_fixture=true` (meaning development-only, not fictitious). This is a source-backed starter set, not a publication-grade fact-check. Confirm burial membership with official records and validate coordinate precision/access before removing that flag. Do not bulk publish the seed. No exact graves or entrance coordinates are asserted. The public read role correctly returns no development records.

`npm run seed:build` validates JSON, uses stable IDs, escapes SQL literals, and generates `supabase/seed.sql`. It performs no network access or database writes. `npm run seed:check` detects drift. Reapplying SQL is idempotent; existing rows are not overwritten. Source records target each person, burial, and cemetery through actual foreign keys. Never seed production; these fixed IDs are reserved for development.
