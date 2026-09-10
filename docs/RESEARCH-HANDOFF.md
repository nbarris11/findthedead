# Find The Dead — research and publishing handoff

Last updated: September 9, 2026. Read this before continuing national ingestion.
This is a persistent project checkpoint, not a claim that background jobs are
still running. Inspect current files/processes before restarting anything.

## User intent and operating rules

- Get as many of the roughly 97,000 national candidates onto the site as the
  evidence supports. Do not return to batches of a dozen as the main strategy.
- Prioritize authoritative bulk datasets, cemetery-wide matching, essential
  source-backed profiles, then richer biographies/photos later.
- The user delegated research and independent verification to agents. They do
  not want to review records themselves. Parallel agent work is authorized.
- Publish supported records in guarded bulk batches; hold ambiguous identities,
  memorials, former burials, unsupported tags, dates and image licenses.
- Tag based on actual roles (presidents, sports, inventors, scientists, writers,
  military, civil rights, etc.), not page category or a relative's occupation.
- Raw candidates, research packets, source rows, identity matches, verified
  profiles and published profiles are different counters. Never conflate them.
- No authorization to bypass access restrictions, scrape private data, purchase
  datasets, or contact cemetery operators. Ask if such authority is needed.
- Preserve the user-owned, untracked `SESSION-SUMMARY.md`; do not overwrite it.
  Its older human-review workflow does not supersede the current delegation.

## Site and publication state

- Project: `/Users/barris/Documents/ChatGPT/Find The Dead`
- Live site: https://findthedead.netlify.app
- Git repository: https://github.com/nbarris11/findthedead
- Supabase project: `ttssyodmfybcadqahfeg`
- Last verified public totals: **145 people, 69 cemeteries, 38 images**.
- `national-official-wave1.json`: four published profiles.
- `national-official-wave2.json`: five published presidents.
- `national-official-wave3.json`: eight published Arlington profiles.
- Waves 2–3 passed public-key release checks, live HTTP 200 profile checks,
  biography/burial citation checks, and category-filter checks.
- `national-official-wave4.json`: **12 independently verified profiles**, schema
  validation passes; published September 9, 2026. Hammett, O'Hara, Bemelmans, Sabin, DeBakey,
  Delano, Ginsburg, Henson, Powell, Westinghouse, Rickover, Elizebeth Friedman.
  Reviewer and independent auditor both passed it. Uncertain exact dates were
  intentionally withheld. All 12 passed public release guards and live HTTP 200
  checks after release; existing identity checks ran during staging/release.

### Publication access recovered September 9, 2026

The user explicitly instructed us to access their open Supabase dashboard.
Chrome extension tab access succeeded for the exact Find The Dead project;
unrelated tabs/content were not read. The connector still returns permission
denied, so connector access itself remains unresolved. Dashboard access is usable.

Wave 4 was released through the existing guarded publisher using the existing
legacy server credential. It was transferred without displaying it to a temporary
owner-only local file, loaded into the release child process and immediately
deleted. Browser variables/clipboard were cleared and the dashboard returned to
Project Overview. No keys were created, rotated, put in Git, or saved persistently.
Do not assume a server key is available on the next turn. Use the authorized
project dashboard again if needed; do not read unrelated browser content.

Public read-only release guards passed for all 12 profiles; live pages returned
HTTP 200. Evidence: `data/ingestion-runs/wave4-release-check.json`. Current public
totals: 145 people, 69 cemeteries, 38 images. No frontend/schema changes needed.
Do not refresh the national queue until the VA collector stops: its checkpoint
is tied to the current queue hash. Refresh public deduplication before next release.

## National collection and live job

- 51 state/DC searches completed: **97,165 unique candidate people**, 97,439
  burial claims, 16,876 burial-place entities (NOT all verified cemeteries).
- Queue: `data/ingestion-runs/us-national/review-queue.json`.
- State input files: `data/ingestion-runs/us-national/XX.json`.
- Bulk research observed **21,240 packets**, status running, PID **34106**,
  updated `2026-09-09T23:51:30.321Z`. PID was confirmed live this session.
- `data/ingestion-runs/us-national/bulk-research/progress.json` and `run.lock`
  describe the actual collector. Check fresh counts and PID before resuming.
- Do NOT start a duplicate collector. Resume only once confirmed stopped.
- This job creates unverified research packets, not approvals or database writes.
- No recurring automation or goal was created. Agents are not durable jobs and
  should not be assumed to keep reviewing after a chat ends.

## Coverage strategy — already calculated against all candidates

Use `npm run plan:authority`. Reports are saved as
`data/ingestion-runs/us-national/authority-coverage.json` and `.md`.

- Top 10 eligible burial places cover 13,679 unique candidates.
- Top 25: 19,538; top 50: 25,969; top 100: **33,017 (33.98%)**.
- Arlington 4,338; Green-Wood 1,826; Woodlawn Bronx 1,518; Forest Lawn Q1437214
  1,446; Mount Auburn 1,386.
- 63 place identities are held for coarse/missing/conflicting labels. Examples:
  Vermont and Wisconsin appeared as burial places and cannot become grave pins.
- Coverage and structural matchability do NOT mean source verification.

## Working small source pilot

`npm run match:authority` fetches six allowlisted Arlington official collections.
It extracted 88 entries: 30 clear identity/lifespan/cemetery matches, five already
public, 53 held. All are evidence only; the first five new matches were separately
verified by the independent agent. Snapshots, hashes, adapter version, queue hash,
hold reasons and 50-record review groups are under `authority-matches/`.

Keep this as a tested adapter example, not the primary national scaling strategy.
It catches paragraph-boundary errors, memorial/reinterment language, date and
name conflicts. It must not copy source typos or infer a role from page membership.

## High-coverage source discoveries and implementation in progress

### Arlington — first full-cemetery collector

Official API docs:
https://www.arlingtoncemetery.mil/Developers/Burial-Record-Public-Service-Methods
Terms: https://www.arlingtoncemetery.mil/Developers/Terms-of-Service

Working endpoint:
`https://wspublic.eiss.army.mil/IssRetrieveServices.svc/search`
Query `q=CemeteryId=46`, `sortColumn=ISS_ID`, `sortOrder=asc`, `start=0`,
`limit=1000`. Live total observed: **431,355 records**. Serial paging and caching
can replace thousands of individual searches. Docs allow pages up to 1,000.

Implementation: `scripts/collect-arlington.ts`,
`src/lib/ingestion/arlington-api.ts`, `tests/arlington-api.test.ts`.

**Pagination fix and successful pilot (September 9):**

- Collector now uses accepted `sortColumn=ISS_ID`. It retains distinct
  `ISS_ID:DECEDENTINTERMENTID` records in arbitrary interment order within a
  person, rejects repeat composite IDs across pages and backward person IDs,
  and keeps the snapshot-consistency hold. Seven API tests pass.
- Two-page pilot succeeded: **2,000 source records, 10 candidate-name leads**.
- Full collection started, PID **54836**, exec session **23755**. Last observed
  **7,000/431,355 source records**, 35 candidate-name leads, status running at
  `2026-09-09T23:51:28.858Z`. Check `arlington-api/progress.json` and `run.lock`.
- Source rows/name leads are NOT verified people. No publication performed.
- Network calls require execution outside the filesystem sandbox; the bounded
  pilot and full collector were approved by automatic review. Dashboard publication access was subsequently recovered; see above.

Source API includes memorials and does not expose an explicit physical-remains
flag in the observed schema. Identity outputs ALWAYS keep burial kind unknown.
No automatic military tags: relationship may be spouse/child; images are headstone
images, not portraits. Dates are local MM/DD/YYYY text; never UTC-shift or invent
January 1. Required source retrieval date and API disclaimer must accompany any
future reuse/publication. Finished pagination is not proof of source consistency.

### VA — selective national collector being built

Official dataset: https://catalog.data.gov/dataset/national-cemetery-administration-gravesite-locator
Metadata: https://www.data.va.gov/api/views/3u66-fxug.json
Working public SODA2 endpoint: https://www.data.va.gov/resource/3u66-fxug.json

Live count: **8,423,164 person-level records**, CC0. Metadata row timestamp is
November 8, 2022 despite a 2026 catalog timestamp: do not call the rows fresh.
No explicit memorial flag; `section_id=MEM` exists. Cemetery-level coordinates.
Military branch/rank may describe the deceased person's related veteran.

Implementation now exists in `scripts/collect-va-evidence.ts`,
`src/lib/ingestion/va-source.ts`, and `tests/va-source.test.ts` (five tests pass).
Queries group surnames with candidate death-year sets, split common surnames
into bounded URLs, page by decedent_id, and cap each group at 10,000 rows.

- One-group live pilot passed: **29 raw source rows**, no cap reached.
- Plan has **1,490 query groups** and **10,392 unqueryable candidates** held for
  surname/date limitations. These are retrieval groups, not verified matches.
- Full targeted collection started, PID **54906**, exec session **69305**.
- Outputs: `data/ingestion-runs/us-national/va-evidence/`; inspect
  `checkpoint.json` for counts and `collector.lock` for PID. No progress.json.
- Cache/checkpoints are atomic and tied to queue/plan hashes. Do not refresh the
  queue while this collector runs; changed input is rejected on resume.
- No database writes, role inference or publication. Independent identity,
  cemetery mapping and actual-interment verification still required.

### Other sources

Green-Wood's operator repository (`Green-Wood-Cemetery/burial-registry-search`)
has 61 JSON files totaling about 1.9 GB. Historical 1840–1937 records do not prove
current interment, and repository license metadata is unspecified. Do not bulk
republish this as a current verified source. Official white paper links it.

Salt Lake City official website links its public ArcGIS cemetery viewer:
app `7e79ff915cec4b098c131d7a4d910ccc`, webmap `a43cd0387d8e453dbacb4133e1f64c65`
on `slcgov.maps.arcgis.com`. Only configuration inspected; no adapter built.

## Commands and verification

Run from `/Users/barris/Documents/ChatGPT/Find The Dead`:

```sh
npm run plan:authority
npm run match:authority
npm run collect:arlington -- --pages 2
# Only after corrected pilot succeeds, no other collector/lock is active:
npm run collect:arlington -- --pages 0

# Research collector: ONLY if existing PID has stopped:
npm run research:us -- --limit 0

# Public DB access; refresh dedupe:
npm run report:us
# Local validation only, no database writes:
npm run release:batch -- data/reviewed-runs/national-official-wave4.json
# After authorized server credentials are securely loaded: same command --confirm.
# Read-only verification for an ALREADY published batch:
node --env-file=.env.local --experimental-strip-types scripts/release-reviewed-candidates.ts data/reviewed-runs/national-official-wave3.json --check

npm test
npx tsc --noEmit
npm run lint
git diff --check
```

Full suite passed at **104 tests** after integration on September 9.
`npx tsc --noEmit`, `npm run lint`, and `git diff --check` also passed.
Bulk publisher is guarded but not one database transaction; failed staging may
leave hidden drafts requiring repair. Do not publish source packets directly.

## Persistence and next actions

- All source code and reviewed JSON files are saved locally; several are still
  untracked/uncommitted. Latest known commit was `23c72fc`, not pushed. Check Git
  rather than assuming remote backup or deployment. Preserve unrelated files.
- Raw datasets/progress are gitignored, intentionally local and resumable.
- Read `docs/BULK-RESEARCH.md` for existing pipeline details.
- Arlington pagination is fixed and both official-source pilots passed. Full
  Arlington and targeted VA collectors are now started. Inspect processes and
  checkpoints before restarting either. Next: assess completed evidence, resolve
  source-consistency/identity/interment holds, and independently verify batches.
  Save measured results, not estimates of verified coverage.
- Keep this handoff updated after collector fixes, source findings, tests,
  publications and access changes. Never save secrets here.

## Latest observed collector checkpoint

Latest checkpoint: national 21,640 research packets; Arlington 35,000/431,355 source rows, 127 name leads (running); VA 38,444 source rows, 33 completed groups, 1 capped groups. All remain unverified evidence; zero published by these collectors.

Observed at 2026-09-09T23:52:34.927Z. Recheck files and processes on continuation.

## User-directed strategy change: bulk publication, not tiny editorial batches

The user explicitly rejected the rate of 12 published profiles after extensive
collection. Read `docs/BULK-PUBLICATION-PLAN.md` before continuing. The recommended
next product change is a clearly labeled cemetery-record tier separate from full
verified profiles; it is NOT implemented or deployed yet. Do not simply remove
review guards or label unknown remains as verified graves.

A new local reconciliation pipeline is implemented and tested:
`npm run reconcile:bulk -- data/ingestion-runs/us-national/public-identities.json`.
It reads captured checkpoints without disturbing live collectors, validates
provenance, groups source evidence by person/cemetery, separates exact identities
from variants/conflicts, and produces 200-record review packages. Publication
approval remains false. It does not modify existing matching/release rules.

First pass: 273,000 Arlington rows and 304,002 VA rows yielded 2,613 unique candidate
leads: 976 exact name/lifespan/cemetery review candidates, 1,354 name variants,
270 conflicts/unresolved sites and 13 already-public people. Five review packages
were saved. They are not approvals. Arlington accounts for 821 exact candidates.
See `bulk-reconciliation/latest.json` for the output directory. Current public
identity snapshot contains 145 people; VA's original queue remains unchanged.

Next: resolve the shared source/cemetery questions for the exact cohort, implement
accurate cemetery-record semantics across schema/UI/importer, and release full
eligible cohorts transactionally; enrich biographies/photos later. Current code
hard-requires editorial copy/tags/score for bulk release, and the UI says “Resting
place,” so a mere importer bypass is insufficient. No claim of future publication
throughput has been verified. Full suite passed at 109 tests after reconciliation;
TypeScript and lint passed. All changes remain local; no frontend/schema deployment.

## September 9: faster model authorized and implemented

The user authorized the directory-entry operating model and persistent direct
access. Supabase CLI login and project link now work; a query ran as postgres
and confirmed 145 public people. Read `docs/DATABASE-ACCESS.md`. Use CLI commands,
not Chrome or the app connector (which sees another organization). No project
service key is required by the new publisher.

Migration `20260910000749_cemetery_record_batches.sql` is applied remotely and
recorded in migration history. It adds `profile_tier`/`record_details`, preserves
existing profiles, propagates the tier through discovery APIs, and adds private,
transactional, idempotent publish/withdraw functions. Security advisors: no issues.
Frontend labels distinguish documentary cemetery records from resting places and
hide unassigned editorial scores. Sitemap reads paginate beyond 1,000 rows.

Arlington collection completed: 431,355 rows, 432 pages. Targeted fresh identity
checks examined 1,088 exact candidates, producing 939 eligible documentary records
and holding 149. Prepared batch directory:
`data/ingestion-runs/us-national/directory-preparation/arlington-directory-20260910002322`.
The source includes memorials; all prepared entries explicitly keep physical
interment unconfirmed. No biographies, invented role tags, exact days, photos or
exact grave coordinates are included. Documentary metadata qualifiers are handled
explicitly; unknown/temporal-end/disposition qualifiers and actual conflicts hold.

The bulk biography/image researcher (PID 34106) was asked to stop after its current
batch to prioritize publication. Check progress before resuming. VA continues
independently; do not change its queue while it runs. First directory release and
frontend deployment still in progress at this checkpoint. Tests passed at 112;
production build passed with `next build --webpack`. Local Turbopack build was
blocked by OS process/port restrictions even with escalation; no frontend code
error was found. Remote Netlify can use its existing build command.
