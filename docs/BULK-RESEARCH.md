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

Five national candidates (Taft, Kennedy, Eisenhower, Truman, Reagan) passed
independent verification, including a corrected Kennedy grave description, and
are saved in `national-official-wave2.json`. They are not yet published: browser
database access timed out and the direct connector lacks project permission.
Hoover is held for a burial-site mapping correction. The initial four-profile
official batch is already public.

## Bulk release

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
