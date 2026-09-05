# Sources and ingestion policy

Use Wikidata (structured facts, CC0), Wikipedia (fact checking and pointers; prose licensing requires care), Wikimedia Commons (per-file license), official cemetery material, and public historical records. Do not scrape Find a Grave, BillionGraves, or other third-party cemetery directories. Link to sources; never copy biographies wholesale.

Every factual seed field needs traceable evidence. Record retrieval time, URL, field scope, confidence, and entity association. Editorial descriptions and Dead Scores must be distinguished from imported facts. Unknown date components and images remain absent. Coordinates require separate verification from burial membership.

Development seeds will be committed and usable offline. Unverified data must remain labeled fixtures with draft status and no public read access. Public release requires source/coordinate review and licensed images. A cemetery center is not an entrance or exact grave; future directions must explain that distinction.

## Ingestion boundary (milestone 7)

A small region-specific Wikidata proof of concept will fetch deceased people, dates, occupations, burial links and image identifiers; normalize; deduplicate by Wikidata ID and reviewed slug; then upsert through a trusted script. Cache imported facts in our database, use an identifiable User-Agent, honor Retry-After, back off, and bound query sizes. Never call Wikidata during ordinary page loads. Uncertain matches enter review, not automatic name-based merging. Record import run IDs and raw-source fingerprints for later auditing. Do not build a national importer now.

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
