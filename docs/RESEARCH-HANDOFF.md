# Find The Dead — research and publishing handoff

Updated September 9, 2026 (local); live release verified September 10, 00:36 UTC.
Read this and `docs/BULK-RESEARCH.md` before continuing. Inspect current progress
and processes before starting collectors. Preserve the user-owned, untracked
`SESSION-SUMMARY.md`; never overwrite or commit it. Keep credentials out of docs.

## Current result

- Live: https://findthedead.netlify.app
- Repository: https://github.com/nbarris11/findthedead, branch `main`.
- Supabase: `ttssyodmfybcadqahfeg`.
- **1,084 public people: 145 existing profiles + 939 cemetery records.**
- **69 cemeteries, 38 images.** No images or role tags added by directory release.
- Code commit `c2681f0` pushed; record-aware frontend verified live before release.
- Migration `20260910000749_cemetery_record_batches.sql` applied and recorded.
- All 939 passed public database checks: identity, fields, citations, cemetery
  mapping, discovery visibility, empty categories/photos and unconfirmed remains.
- Twelve representative live pages passed HTTP/wording/source checks. Public
  search, nearby and bounds APIs passed. Sitemap includes all 1,084 person URLs;
  Arlington's cemetery page contains all 939 new directory links.
- Existing wave 4's twelve profiles passed the read-only release guard again.
- Full suite: 112 passing tests; TypeScript, lint and diff checks passed.
  Production build passed with `next build --webpack`. Local Turbopack hit OS
  process/port restrictions, including elevated execution; existing Netlify
  build command was preserved and the updated frontend is live.

## User-approved operating model

Publish accurate, source-backed cemetery records in full eligible cohorts, then
add biographies, actual-role tags and licensed photos separately. Do not return
to individually written batches of twelve as the main publication strategy.
The user approved persistent direct database access and the directory tier.

Directory entries explicitly say whether an official record is an interment or
memorial has not been independently confirmed. They do not assert confirmed
physical remains, exact grave coordinates, exact birth/death days or occupations.
Do not infer military roles from burial at a military cemetery. Source rows,
identity candidates, reviewed profiles and public entries are different counters.
Raw matches and research packets never become approvals by themselves.

No authorization to bypass access restrictions, purchase datasets or contact
operators. No recurring automation or goal was created. Do not assume a chat
continues researching after its turn ends.

## Database access is fixed

Use the authenticated, project-linked Supabase CLI. A query ran as postgres and
publication of all 939 records succeeded with it. Browser access and service-role
keys are unnecessary for routine SQL, migrations and the new directory publisher.
Read `docs/DATABASE-ACCESS.md` for commands. The app connector sees a different
organization; leave that connection alone. No credentials are in the project,
frontend, Git or handoff. The CLI manages its own authentication persistence.

Wave 4 was previously released through authorized dashboard access using a
short-lived local copy of an existing server credential. That temporary file and
browser/clipboard values were removed. The persistent CLI supersedes that method.

## Arlington release and evidence

Completed official collection: **431,355 source rows, 432 pages**. Collector PID
54836 is stopped; completion recorded at `2026-09-10T00:13:31.102Z`.

Preparation examined **1,088 exact identity candidates**, freshly checking English
labels, human identity, date precision/qualifiers and Arlington cemetery claims.
**939 eligible; 149 held** for conflicts, precision or claim qualifiers. This
count is not all Arlington candidates; incomplete names/lifespans, duplicate
source identities and earlier matching holds remain outside this cohort.

Evidence and immutable batch payloads (gitignored):
`data/ingestion-runs/us-national/directory-preparation/arlington-directory-20260910002322/`

- `manifest.json`: source/entity snapshot hashes, revisions, per-person holds.
- `batch-001.json` through `batch-005.json`: original prepared cohort.
- `release/canary.json`: first three; `release/batch-001-remainder.json`: other 197.
- Actual released IDs: prefix `arlington-directory-20260910002322-`, suffixes
  `001-canary` (3), `001-remainder` (197), `002` (200), `003` (200), `004` (200),
  `005` (139). All six ledger rows confirmed released.
- Do NOT publish original `batch-001.json`: its rows were split into the two
  release files. Replaying exact released payloads is idempotent; new IDs with
  existing identities are rejected.
- `release/canary-check.json`, `release/release-results.json`,
  `release/final-public-check.json` and `release/verify.mjs`: verification evidence.
- The remaining 936 took **10.822 seconds** across five release child processes.
  That is database publication time, not collection or identity-verification time.

The private publisher uses one transaction per batch of up to 200 records, immutable ledger
payloads, identity/source uniqueness and source/cemetery guards. Tests cover
rollback after a failed row, retry idempotency, changed payload rejection, public
visibility, anonymous privilege denial and batch withdrawal. Security advisors
reported no issues after the migration. Never use SECURITY DEFINER to bypass RLS.

## Collector checkpoints

National candidate input: **97,165 people**, 97,439 burial claims, 16,876 burial
place entities across all 51 state/DC searches. Not all places are cemeteries.
Queue: `data/ingestion-runs/us-national/review-queue.json`.

- Biography/image researcher PID 34106 is **paused**, 30,120 packets, recorded at
  `2026-09-10T00:14:54.305Z`. It was stopped gracefully to prioritize publication.
  Check `bulk-research/progress.json` and process state before resuming.
- Arlington collector PID 54836 completed, as above.
- VA collector PID 54906 completed its 1,490 query groups: **918,325 source rows**,
  **1,467 completed uncapped groups and 23 capped groups**. No live collector or
  lock remained when checked. Read `va-evidence/checkpoint.json` before reuse.
  Capped groups are incomplete, not silently successful.
- Queue/plan hashes bind existing caches. Keep the original queue unchanged when
  reusing VA caches. Public deduplication is a separate fresh snapshot:
  `data/ingestion-runs/us-national/public-identities.json`, now 1,084 public people.
- No collector publishes or independently verifies physical interment.

## Source semantics and adapters

Arlington official API docs:
https://www.arlingtoncemetery.mil/Developers/Burial-Record-Public-Service-Methods
Terms: https://www.arlingtoncemetery.mil/Developers/Terms-of-Service

Endpoint `https://wspublic.eiss.army.mil/IssRetrieveServices.svc/search`,
`q=CemeteryId=46`, `sortColumn=ISS_ID`, `sortOrder=asc`, `start=0`, `limit=1000`.
Unique composite key `ISS_ID:DECEDENTINTERMENTID`; interment order within a person
is arbitrary. Individual citation queries also REQUIRE the sort parameters or
may return HTTP500. Full snapshot checksums, ordering and totals are checked.

API includes memorials without an explicit physical-remains flag. Explicit MEM
sections are held. Source disclaimer and retrieval dates are shown on every
public directory page. Dates are local text; never UTC-shift or invent January 1.
Documentary qualifiers P965/P625/P585/P373/P1442 are allowed without asserting
current remains or publishing exact coordinates/days. Other, temporal-end,
disposition or conflicting claims remain held.

VA: https://www.data.va.gov/resource/3u66-fxug.json
Metadata: https://www.data.va.gov/api/views/3u66-fxug.json
Official catalog identifies CC0; source rows have a November 2022 snapshot date,
despite a newer catalog timestamp. ~8.42 million overall rows, not our collection
count. No explicit memorial flag; MEM sections exist. Coordinates are cemetery
level. Branch/rank may describe a related veteran. Do not add automatic roles.
Cemetery crosswalks and source semantics require validation before another adapter
can publish VA-derived directory entries. Current publisher allows Arlington only.

Green-Wood operator repository `Green-Wood-Cemetery/burial-registry-search` holds
~1.9GB across 61 JSON files; license unspecified and historical 1840–1937 records do
not prove current remains. Do not bulk republish without resolving reuse terms.
Salt Lake City official ArcGIS viewer discovered (no adapter): app
`7e79ff915cec4b098c131d7a4d910ccc`, webmap
`a43cd0387d8e453dbacb4133e1f64c65`, host `slcgov.maps.arcgis.com`.

## Next cohort

Read `docs/BULK-PUBLICATION-PLAN.md`. Both completed datasets were reconciled
against the post-release public snapshot. Output:
`data/ingestion-runs/us-national/bulk-reconciliation/2026-09-10T00-36-13-267Z/`.
The 1,349,680 source rows yielded 4,309 unique candidates with evidence leads:
954 already public, 418 exact-match review candidates, 2,374 name variants and
563 conflicts. These lanes are not approvals; the 418 include records with
precision/source holds. Do not treat them as the next guaranteed release count.
Arlington has 1,213 remaining name variants; explicit aliases offer the largest
current cohort to resolve. Other exact-match cohorts include Riverside (27),
Long Island (26), San Francisco (25), Pacific (23) and Los Angeles (23).
Reconciliation does not approve publication. Resolve name variants using explicit
alias evidence; retain namesake/date/source conflicts. Validate VA cemetery
crosswalks once per cohort and extend the tested adapter/publisher deliberately.

Top 100 structurally eligible burial places cover 33,017 national candidates;
coverage is not verification. Prioritize operators by usable yield. The current
sources do not cover all 97,165 candidates. The remaining long tail needs more
public operator/archival sources. Enrichment stays secondary to usable directory
coverage. Cemetery page reads currently have a1,000-row default limit; current
Arlington page fits and was checked. Add pagination before any cemetery exceeds
1,000 public entries; sitemap reads already paginate.

## Commands

Run from `/Users/barris/Documents/ChatGPT/Find The Dead`:

```sh
npm run db:check
npm run prepare:directory
npm run publish:directory -- /absolute/path/to/batch.json
npm run publish:directory -- /absolute/path/to/batch.json --confirm
npm run reconcile:bulk -- data/ingestion-runs/us-national/public-identities.json
npm test
npx tsc --noEmit
npm run lint
```

Preparation is read-only against public data. Directory release uses direct CLI.
Full editorial profiles still use reviewed files and the separate guarded legacy
publisher described in `docs/BULK-RESEARCH.md`. Waves 1–4 are already published
(4+5+8+12). Keep their independent review and image-license guards intact.


## September 9 continuation: map cap and national listing tier

The user's screenshot revealed a map cap: 200 people were being clustered, hiding
most public records. The new map summary counts every matching public record,
returns bounded geographic cells and loads names in cursor pages of 50. Cemetery
pages now paginate 100 names; sitemap output is split into 10,000-row shards.

The user authorized clearly labeled Wikidata-sourced burial listings ("do whatever
makes the most sense"). Read `NATIONAL-LISTINGS.md`. One national classification
query returned 197,016 coordinate rows for 196,945 US cemetery identities. Joining
that shared source to the national cache yielded 80,538 eligible listings across
13,167 cemeteries; 15,565 held and 1,062 national people already public. There are
22 additional public people outside the national queue, so the public baseline is
1,084. Dates are absent unless original precision was checked. No new biographies,
images or role tags. Known cached conflicting claims remain held.

Prepared directory:
`data/ingestion-runs/us-national/national-directory/wikidata-listings-20260910005441`.
The first batch is a 20-record canary; remaining batches contain up to 2,000.
Both migrations (`20260910004144_map_aggregate_counts.sql` and
`20260910004653_wikidata_listing_batches.sql`) are applied remotely. Database map
count verified at 1,084 before national release; security advisors found no issues.
Tests passed at 115, TypeScript/lint passed, webpack production build passed.
Frontend deployment and national publication are in progress at this checkpoint.
