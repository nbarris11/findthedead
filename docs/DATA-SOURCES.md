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
