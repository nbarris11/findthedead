# National candidate collector

The collector gathers a local research library from public Wikidata, Wikipedia, Wikimedia Commons, and Census APIs. It does not insert database records or publish profiles. An initial national discovery run includes all 50 states and Washington, DC; territories are outside this run.

## Run and resume

From the project directory:

```sh
npm run ingest:us
npm run report:us
npm run enrich:us -- --per-state 10
```

`ingest:us` resumes saved checkpoints automatically. A finished state is skipped. To retry unfinished states only, run the same command again. To restrict a run, use `npm run ingest:us -- --states MI,OH,IN`. All three commands accept `--output <directory>`; use a new output directory for a fresh collection rather than deleting the existing research.

`report:us` uses the configured public Supabase key to page through existing profiles, then builds one review entry per Wikidata person. It never needs a service key. Run it again after adding states or publishing profiles so duplicate flags stay current.

`enrich:us` defaults to ten source-rich candidates per state. It stores article revision links, research excerpts, and Commons image metadata in separate per-person files, resuming from its cache. `npm run enrich:us -- --per-state 0` requests enrichment of the entire collected library and may take substantially longer. Images and excerpts are research inputs, not approved editorial content. Failed enrichment records are retried by rerunning the command.

## Outputs

All raw output lives under the gitignored `data/ingestion-runs/us-national/` directory by default:

- `states.json`, `counties.json`: cached Census boundaries with source URL, retrieval time, and simplification precision.
- `AK.json` through `WY.json`, plus `DC.json`: state checkpoints and candidate burial claims.
- `report.json`: geographic query coverage, errors, and pending work.
- `review-queue.json`: unique people, all recorded burial claims, public-profile matches, name collisions, and missing-data flags.
- `summary.json`, `REPORT.md`: aggregate counts and state coverage after public-database deduplication.
- `research/Q….json`, `research-report.json`: source material and metadata for editorial review.

## Coverage and review rules

Census polygons determine state and county membership; holes, islands, and Alaska's two sides of the dateline are supported. Boundaries are simplified to 0.002 degrees, so records close to borders still need individual verification. An unmatched county stays null. City names are not guessed from counties or nearby cities.

Queries start from each state's geographic bounds. A response hitting 2,000 rows is subdivided and retried so a query limit is not mistaken for complete coverage. Very dense locations that still hit the limit at maximum depth are explicitly flagged as capped. Interrupted/failed boxes remain pending, and the process exits unsuccessfully if the requested state searches are incomplete. A completed search means the planned API searches finished without a detected cap, not that Wikidata contains every U.S. burial.

Repeated appearances of the same person at the same burial place are merged during discovery. Different burial places are preserved for review; no automatic decision is made between a grave, former burial place, or memorial. Optional images and date values in discovery are preliminary. The existing Wikidata date-normalization heuristic still applies: do not treat an imported exact date as independently verified.

The review queue is the next editorial input. Verify identity, death and burial claims, coordinate precision, and image licensing; write original biographies and hooks; then create a reviewed batch for the existing draft/publish workflow. Commons metadata can contain HTML and source-supplied text. Keep it as research data and never render it as trusted HTML. A filename alone is not image permission; check the per-file license and attribution. Wikipedia research excerpts should not be copied into site biographies.

## Source references

- [Wikidata access methods](https://www.wikidata.org/wiki/Help:Data_access)
- [Wikidata geographic query documentation](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)
- [Census state and county API](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer)
- [Wikimedia image metadata API](https://www.mediawiki.org/wiki/API:Imageinfo)

Requests identify FindTheDead, run sequentially within each collector, retry temporary failures, and honor rate-limit delays. No commercial cemetery directory is scraped by these commands.
