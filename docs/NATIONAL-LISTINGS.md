# National source-labeled listings

The user authorized a Wikidata-sourced listing tier on September 9, 2026 after
being shown the tradeoff with requiring an official cemetery source first.
This tier is a source-attributed association, not a verified grave or an official
cemetery record. Existing profiles and official records retain their stronger labels.

The input is the existing 97,165-person national query cache. Each query explicitly
requires a human identity, a burial association and a recorded death. A separate
national query checks US cemetery classification and coordinates in bulk. This
avoids one operator adapter or external lookup per person. Structured Wikidata
facts are CC0: https://www.wikidata.org/wiki/Wikidata:Licensing .

The preparer checks identifiers, labels, one cemetery, coordinates, source origin,
source recency, same-name/lifespan collisions and known cached claim conflicts.
Non-cemetery places, ambiguous locations, missing names and multiple associations
remain held. Years are omitted unless original cached date precision was checked.
No biography, photo, role category or editorial score is generated.

The first prepared result is 80,538 listings across 13,167 cemetery identities;
15,565 candidates are held and 1,062 national candidates were already public.
Read RESEARCH-HANDOFF.md for the actual publication state, not this preparation count.

## Repeatable commands

From `/Users/barris/Documents/ChatGPT/Find The Dead`:

```sh
npm run collect:cemetery-types
npm run prepare:national
npm run publish:national -- /absolute/path/to/prepared-directory
npm run publish:national -- /absolute/path/to/prepared-directory --confirm --canary
# After live canary verification; replaying the first batch is safe:
npm run publish:national -- /absolute/path/to/prepared-directory --confirm
```

The CLI uses the existing Supabase authentication; there is no browser or service
key requirement. Each immutable batch contains up to 2,000 people and its cemetery
mappings. PostgreSQL performs set-based inserts in one transaction per batch.
The private ledger rejects changed payloads, duplicate identities and conflicting
existing cemetery mappings. The local publisher lock prevents concurrent releases.
On a failed transaction, fix the specific cause; do not bypass its guards. Replaying
an already released exact batch is idempotent. Never remove a live publisher lock.

Withdraw an exact batch with an admin SQL call to
`private.withdraw_wikidata_listing_batch('exact-batch-id')`. Evidence remains and
upgraded records require review. Cemetery identity pages remain source-attributed.

## Map and public access

`/api/people/map` returns complete filtered counts in bounded geographic cells,
with no person-count cutoff. Mapbox sums each cell's record count. Opening a
location fetches names in pages of 50, using an ID cursor. Older bounded search
and nearby result limits remain appropriate for lists, not map totals.

Cemetery pages paginate 100 names. `/sitemap.xml` is a sitemap index; individual
files contain up to 10,000 data URLs. These changes support the national data size.
Verify actual public totals, all batch identities/sources, map sum, pagination,
source wording and sitemap shards after release. Record throughput separately
for preparation and publication; no claimed future collection rate is guaranteed.
