# Bulk research and controlled release

The researcher gathers evidence; an independent verifier checks proposed
publication batches; one publisher stages and releases the checked records.
The founder has delegated this editorial work. They do not need to review the
97,165-person queue. Raw collection is not verification.

## Collection

From the project directory:

```sh
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm run research:us -- --limit 200
```

For every remaining candidate:

```sh
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm run research:us -- --limit 0
```

The default is 200 new packets per run. Each batch covers 20 people using grouped,
serial requests to Wikidata, English Wikipedia, and Wikimedia Commons. It
honors rate limits, Retry-After, maxlag and bounded retries. No paid API or
database credentials are needed. It does not scrape restricted directories or
automatically visit arbitrary URLs found in source references.

Outputs are gitignored under `data/ingestion-runs/us-national/bulk-research/`:

- `packets/<last-two-ID-digits>/Q….json`: dates and their precision, complete
  relevant statements/ranks/qualifiers/references, linked burial/occupation/office
  labels, biography excerpt with article revision and identity, image metadata,
  suggested role tags, and conflict flags.
- `entities/…`: versioned statement caches with their actual retrieval times.
- `labels.json`: shared role/place labels to avoid repeat requests.
- `progress.json`: counts, process ID, timestamps, request count, and failure or
  pause state. `total_packets` is NOT a count of verified people.
- `run.lock`: prevents overlapping collectors writing the same cache.

Requests are batched, not multiplied across agents. Agents can research and
verify different publication batches while this collector runs. They must not
run duplicate collectors or publish concurrently.

Successful packets are atomic and validated when resuming. An interrupted
incomplete batch may repeat its article/image requests; completed packets are
skipped. SIGINT/SIGTERM requests a stop after the current batch. A hard crash can
leave a lock: inspect its PID and confirm the collector is no longer running
before removing that specific lock file. Never remove a live process's lock.

## Verification

Every packet stays `needs_review`, including packets with references and no
obvious conflicts. A Wikidata reference may be a directory import, and Wikipedia
may repeat the same source; neither automatically provides independent evidence.

The researcher reads the strongest actual cited records and confirms identity,
dates, current interment (not a memorial or former grave), the site identity,
and role tags. The verifier checks those sources independently. Missing sources,
ambiguous dates, conflicting burials, licenses, and unmapped occupations remain
explicitly unresolved. Coordinates stay site-level unless separately verified.
No extracted Wikipedia prose or unreviewed images go directly onto the site.

National official waves 1–3 are published: 17 independently reviewed profiles.
Wave 2 adds Taft, Kennedy, Eisenhower, Truman, and Reagan. Wave 3 adds Hopper,
Glenn, Louis, Marshall, Evers, Young, Marvin, and Reed. Public-key release guards
passed for all 13 wave 2–3 profiles on September 9, 2026, and each live profile
returned HTTP 200 with both its biography and burial citation. Live presidents,
scientists, sports, and civil-rights filters returned the relevant new records.
The public database then contained 133 people, 69 cemeteries, and 38 images.

Independent review corrected Kennedy's eternal-flame wording, resolved Young's
reinterment identity, and withheld Reed's exact death day because official
sources disagree. No photos or exact grave coordinates were added. Hoover
remains held for a burial-site mapping correction. Database access was recovered
through the authorized dashboard; temporary release credentials were removed
after publication. The direct connector still lacks project permission.

## Cemetery-source matching (working pilot)

```sh
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm run report:us
npm run match:authority
```

`report:us` refreshes public-profile deduplication using public database access.
`match:authority` reads that queue and fetches only six explicitly allowlisted
Arlington official collections: science, sports, arts, medicine, Supreme Court,
and explorers. This is a source-specific adapter, not a nationwide authority
database or an unrestricted scraper. It needs no database key and writes only
local, gitignored evidence. Re-runs reuse checksummed source snapshots; pass
`--refresh` to fetch new versions. Cached snapshots older than 30 days are refused.

September 9 pilot: 88 extracted entries, 30 clear identity/lifespan/cemetery
matches, five already-public matches, and 53 held entries. Six source requests
were needed in total; the cached re-run needed zero. These are evidence matches,
not 30 publication approvals. The independent verifier checked the first five
matches against the two initial pages. The expanded matches still need editorial
review. This small pilot demonstrates reuse, not coverage of all 97,165 people.

Outputs under `data/ingestion-runs/us-national/authority-matches/`:

- `*-snapshot.json`: original HTML, official URL, retrieval time and SHA-256.
- `report.json`: person-level extracted text, lifespan, grave reference,
  source hash, adapter version, queue hash, match identity and hold reasons.
- `review-batches.json`: clear matches grouped in batches of up to 50 for agents.
- `run.lock`: prevents concurrent writes. Never remove a live process's lock.

The matching gate requires one exact normalized name, both matching birth/death
years, and one matching cemetery ID. It does not expand initials or guess aliases.
Same-name people, duplicate source names, conflicting dates, multiple burials,
reinterment/memorial language, missing grave references, unknown risk flags, and
layout changes are held. Publication still rechecks current database identities.
An existing official page is not proof that every sentence on it is correct.

Agent workflow:

1. Researcher reviews a source batch once, checking each matched paragraph's
   identity and actual interment, resolving aliases and contradictions separately.
2. Verifier independently checks the proposed facts. Approval must identify the
   source hash, adapter version, and candidate identity; changed inputs require
   renewed review. A match alone never creates `confirmed: true`.
3. Prepare essential profiles with original concise descriptions/biographies,
   supported role tags and citations. Year-only dates are acceptable. Do not copy
   source prose, propagate source typos, infer exact dates, reuse unlicensed photos,
   or turn section/grave identifiers into guessed map coordinates.
4. Use the existing verified-batch importer in chunks of at most 200. Larger
   biographies and licensed images can be researched after essential publication.
5. Run public release checks and refresh the queue before the next batch.

The extractor deliberately supports one named paragraph per entry. Missing or
changed paragraph structures yield incomplete/held entries rather than borrowing
the next person's grave. Page membership never assigns roles: the official sports
page includes the debunked Doubleday baseball-invention story.

Wave 4's 12 independently reviewed profiles were published September 9, 2026.
The user authorized access to the open Supabase project; Chrome extension access
worked. The direct connector still lacks permission, but dashboard access enabled
the existing guarded release. Temporary credentials were deleted. All 12 passed
public read-only release checks and live HTTP 200 checks. Current public totals:
145 people, 69 cemeteries, 38 images. See `docs/RESEARCH-HANDOFF.md` for details.

## Bulk release command

Verified editorial files live under `data/reviewed-runs/`. The new command accepts
1–200 profiles with original biographies, supported tags, profile citations,
reviewed burial evidence, reviewer identity and review time. Raw research
packets fail this schema. Validate without credentials or writes:

```sh
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm run release:batch -- data/reviewed-runs/national-official-wave1.json
```

With server-side Supabase configuration already loaded securely, the publisher
adds `--confirm` to run staging and release against one immutable batch snapshot.
Never put a service-role key in the command, Git, browser code, or public env.

Staging creates drafts and assigns tags. Release verifies identities, stored
editorial fields, category links, cemetery IDs, and the specified official burial,
biography and image citations before making records public. A staging error stops
release; already-created drafts stay hidden. This is not a database transaction:
an incomplete draft may need repair before a retry. Existing mismatched content
is rejected rather than silently overwritten. A release cannot be described as
fully atomic or automatically self-repairing.

After release, verify public profiles, their source links, and category-filter
results. Persist the batch's outcome. No agents should mark a batch published
merely because collection, drafting, or the first database insert succeeded.

Read-only verification of an already public batch uses only the public key:

```sh
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
node --env-file=.env.local --experimental-strip-types scripts/release-reviewed-candidates.ts data/reviewed-runs/national-official-wave1.json --check
```

Pilot result: 100 packets generated in 20 requests, including 61 biography
excerpts, 47 image metadata records, and 82 people with suggested tags. All
remained unverified. The all-candidate collector was then started with `--limit
0`; consult `progress.json` for current progress rather than treating this
document as a live counter.

Implementation follows [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette):
batch items, cache results, and make considerate serial requests.


## Official bulk collectors — September 9 continuation

Arlington pagination now uses the supported person-ID ordering and preserves
multiple interments. The two-page pilot collected 2,000 rows and 10 name leads;
the full collector has started. Inspect `arlington-api/progress.json` and
`arlington-api/run.lock` before resuming with `npm run collect:arlington -- --pages 0`.
All leads retain unknown burial kind and unverified snapshot consistency.

The selective VA pilot collected 29 source rows. Its 1,490 surname/death-year
query groups are now running using:

```sh
node --experimental-strip-types scripts/collect-va-evidence.ts --groups 0
```

Inspect `va-evidence/checkpoint.json` and `va-evidence/collector.lock` before
resuming. Never start a duplicate. Keep the queue unchanged during this run;
resume rejects changed queue/plan hashes. A 10,000-row group cap marks that group
incomplete. Neither collector verifies people or publishes profiles.

The integrated suite passed 104 tests, TypeScript and lint. See the research
handoff for observed PIDs/counts; they are checkpoints, not live status claims.


## Faster documentary release

The user authorized a separate cemetery-record tier. Use `docs/DATABASE-ACCESS.md`
for the persistent CLI connection and transactional directory publisher. Documentary
entries preserve unconfirmed interment/memorial status and omit editorial copy,
role tags, exact days and photos. The existing verified-profile workflow above
remains in place for enriched profiles. Read the latest handoff before publishing.
