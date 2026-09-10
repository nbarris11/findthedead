# Bulk publication: directory first, editorial enrichment second

September 9, 2026 (local time). The user rejected a workflow that collects tens
of thousands of records but publishes only a dozen per pass.

## Decision

The current system mixes two jobs: a sourced cemetery directory and individually
written historical profiles. Separate them. A person's presence in an official
cemetery register can be presented accurately without claiming independently
verified physical remains, inventing an occupation, or writing a biography.

Recommended public tiers:

1. **Cemetery record**: resolved person identity, mapped cemetery, source citation,
   source retrieval date, source-provided section/grave reference when present,
   supported lifespan precision, and an explicit record type. Visible wording for
   unresolved disposition: “Listed in Arlington National Cemetery records. Whether
   this entry identifies an interment or memorial has not been independently
   confirmed.” Never label this “verified burial” or “Resting place.” The map is a
   cemetery reference point; directions are to the cemetery, not a grave.
2. **Verified profile**: current interment independently checked, with reviewed
   biography, actual-role categories and optional licensed photos. Existing 145
   public profiles retain their present behavior.

Cemetery-record publication still requires a resolved identity and cemetery,
usable public evidence, reuse terms/attribution, and per-record validation. A
source's inclusion of memorials is a reason to label disposition accurately,
not a reason to claim physical burial or discard all of its documentary value.
Ambiguous person identities and cemetery conflicts remain private.

The user approved this product change. The database migration and frontend
implementation now exist; consult the latest research handoff for deployment
and publication status. The reconciliation script alone still never approves
records. The separate documentary preparation policy checks every released entry.

## What changed locally

`scripts/reconcile-bulk-evidence.ts` reads the Arlington and VA caches up to
captured collector checkpoints. It validates hashes and source URLs, checks the
VA queue identity, preserves source rows and duplicate interments, and writes a
separate immutable evidence report. Live collector input is unchanged.

- Name plus lifespan indexing can distinguish different-lifespan namesakes.
- Exact names and name variations are separate review lanes. No silent alias
  approval; initials are not expanded.
- Exact-day conflicts are flagged. SPARQL dates do not establish day precision;
  original Wikidata statement precision must be checked before public exact days.
- VA cemetery crosswalk proposals require matching normalized site names and
  coordinates within 2 km, with only one matching entity. They still need review.
- Multiple burials/interments, MEM sections, capped queries, incomplete collection,
  source independence and current-interment uncertainties remain attached.
- Current public identities come from a separate timestamped snapshot; the live
  VA collector's queue is not regenerated.
- Output has `publication_approved: false` and cannot pass the verified importer.
- Review packages contain up to 200 candidates each, with hashes and source rows.

Measured first pass (partial collectors, 2026-09-10 00:03:52 UTC):

| Measure | Count |
| --- | ---: |
| Arlington source rows processed | 273,000 |
| VA source rows processed | 304,002 |
| Unique candidates with evidence leads | 2,613 |
| Exact name/lifespan/cemetery review lane | 976 |
| Name-variation review lane | 1,354 |
| Conflict/unresolved cemetery lane | 270 |
| Already-public candidates among those leads | 13 |
| Newly approved or published by reconciliation | 0 |

These 976 are candidates for the next checks, not a promise of 976 safe releases.
The run produced five review files. The Arlington cohort accounts for 821 exact
identity candidates; validating one cemetery adapter/crosswalk serves this whole
cohort. VA and Arlington feeds are not assumed to be independent evidence.

## Implementation sequence

1. **Finish identity and cemetery resolution for the 976-candidate lane.** Check
   original statement precision/qualifiers, conflicting interments, source row
   uniqueness and the official cemetery entity once per source/cemetery cohort.
   Run per-record tests for all entries; manually inspect examples and exceptions
   to validate adapter behavior, not to pretend a sample proves every grave.
2. **Add the cemetery-record tier across data, UI, and release code together.**
   Store explicit editorial tier and burial/disposition status. Keep unresolved
   documentary entries from the existing “Resting place” presentation and any
   verified-burial structured data. A separate importer must accept optional
   biography/categories and absent editorial ranking without fake filler.
3. **Release validated cemetery records in transactional batches.** Existing
   publisher is multiple REST calls, not one transaction. Use staging tables,
   stable candidate/source IDs, batch validation, and an atomic release operation.
   Keep existing verified-profile guards intact. Require post-release public
   visibility, citation, search/filter and map-label checks, and a batch rollback
   path. Use an initial small canary to check the implementation, then release
   full eligible cohorts; do not make tiny canaries the ongoing operating model.
4. **Resolve name variants efficiently.** Read candidate aliases from cached
   Wikidata entities and source full names; produce explicit alias evidence.
   Birth/death plus middle initial alone is a lead, not an approved identity.
5. **Expand by expected usable yield.** Top 100 eligible burial-place entities
   cover 33,017 candidates. Prioritize official operators with structured records,
   usable terms and adequate source semantics. The long tail needs additional
   operator/public archives and audited extraction adapters; VA is not a source
   for all 97,165 people. No unbounded per-person scraping or access bypass.
6. **Enrich after directory publication.** Queue biographies, actual-role tags and
   licensed photos by user demand and editorial importance. Stop spending the
   primary publication budget fetching optional images for every candidate.

## Throughput and completion criteria

Track unique candidates with resolved identity, mapped cemetery, supported public
record claim, source-review completion, staged rows, and public pages. Raw source
row/packet counts are secondary diagnostics. Record reject reasons and eligible
records per adapter request/review hour. Set publishing-rate targets only after
the first full cohort release; no invented “100k by tomorrow” estimate.

Done means searchable public records with accurate labels and provenance, not a
larger folder of JSON. The remaining 94,552 candidates without evidence leads in
this partial pass are not automatically covered by the two government collectors.

## Re-run

Use a fresh (<24-hour) public identity JSON snapshot shaped as
`{ retrieved_at, people: [{ wikidata_id, slug }] }`. Saved public snapshot currently
lives at `data/ingestion-runs/us-national/public-identities.json`.

```sh
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm run reconcile:bulk -- data/ingestion-runs/us-national/public-identities.json
```

Read `data/ingestion-runs/us-national/bulk-reconciliation/latest.json` for the
report directory. Never treat `review-*.json` as reviewed publication input.
Five new tests cover namesakes, date conflicts, alias holds, cemetery ambiguity,
and multiple interments. Full suite: 109 passing tests; TypeScript and lint pass.

## Implemented and released September 9

The first full cohort is live: **939 documentary cemetery records**, bringing
public people to **1,084**. Persistent Supabase CLI access, record-aware UI,
transactional batch publishing, private immutable ledger and withdrawal are in
place. All 939 passed public field/provenance checks; live page samples, search,
map APIs, Arlington links and all 1,084 sitemap URLs passed. The remaining 936
published in10.822 seconds after a 3-record canary; preparation time is separate.

Fresh identity validation held 149 of 1,088 exact candidates. The Arlington source
is complete at 431,355 rows. VA collection finished at 918,325 rows, with 23 capped
query groups retained as incomplete. A fresh public identity
snapshot produced the next review lanes: 418 exact candidates, 2,374 name variants
and 563 conflicts, with 954 already-public candidates excluded. These are review
lanes, not approved records. Earlier partial counts in this document are
historical, not current publication totals. Read `RESEARCH-HANDOFF.md` first.
