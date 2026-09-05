# Architecture

## Stack and boundaries

Next.js App Router, strict TypeScript, React, Tailwind, Zod, Supabase PostgreSQL and PostGIS. Target Vercel's Node runtime. Mapbox GL JS renders `/explore`'s map. Versions are pinned with package-lock.json. Node 22+ is the supported baseline; no remote font fetch is required during builds.

Server Components own page rendering and metadata. `/explore` is a Server Component that fetches the first paint of visible people and categories, then hands off to `ExploreClient`, the one meaningful client boundary: it owns map state, filters, geolocation, and the bottom sheet. `src/lib/data` is the server-only repository boundary; ordinary requests use Supabase, never Wikidata. A separate, explicit development mode reads committed seed fixtures with no credentials. Supabase failures must not silently fall back to demo content. Never use service-role keys for public reads.

`supabase/migrations` defines schema and SQL query functions. `data` holds reviewed development seed inputs. `scripts` contains deterministic local seed tooling; network ingestion comes in milestone 7. `tests` covers validation and geographic edge cases. `supabase/tests` exercises schema and access rules on a real PostGIS database.

## Geographic design

Store WGS84 geography points and GiST indexes. A burial has an optional location more precise than its cemetery. The effective discovery point is burial point first, cemetery point second. Index each source point separately and query both branches, rather than relying on an unindexed join-time coalesce. Distances are meters internally; miles are presentation/query inputs. Bounds queries support antimeridian wrapping. Region defaults belong in product configuration, never database logic.

## Map and APIs

`GET /api/people/bounds` is a bounded, Zod-validated route handler (via `peopleInBounds`) calling the security-invoker `people_in_bounds` RPC in Supabase mode, or the equivalent in-memory filter in demo mode. It returns compact serializable coordinates, provenance/precision, categories, and is capped at `MAP_RESULT_LIMIT` (200) — a truncation signal, not a claim of completeness; a future response should request one extra row or expose a separate count before implying "all of them." `MapCanvas` renders people through one native Mapbox GeoJSON source with clustering (`clusterRadius`/`clusterMaxZoom` in `src/lib/explore/config.ts`), not a React marker per person, so hundreds of pins stay smooth on mobile. Bounds changes are debounced 250ms and superseded requests are aborted via `AbortController`. Distinct UI states cover loading, server failure, geolocation denied, and geolocation unavailable; the visitor's coordinates are held only in client React state and are never sent to our server or logged. Clusters whose leaves share one coordinate (cemetery-precision burials) resolve to a plain list instead of an infinite expansion-zoom loop. Coincident points also stay stacked as one dot past `clusterMaxZoom`, where Mapbox stops clustering entirely; clicking that dot runs a small bounding-box `queryRenderedFeatures` (not a point query or `e.features[0]`) so every person under it opens the list rather than one arbitrary person silently hiding the rest. Mapbox's container is a nested mount div, not the positioned wrapper itself: mapbox-gl appends its own `mapboxgl-map` class and ships CSS for it that fights same-specificity layout rules applied directly to that element (verified in-browser — the map rendered at a stale, undersized canvas without this). An explicit `ResizeObserver` calls `map.resize()` because Mapbox does not reliably pick up the container reaching its final flex-computed size on its own.

If `NEXT_PUBLIC_MAPBOX_TOKEN` is unset, `/explore` renders `MapFallback`, an accessible list of the same bounds query result, rather than a broken map.

## Nearby

`/nearby` is a static page (no server data fetch — it has no meaningful content without the visitor's location) that renders `NearbyClient`. Its permission gate is explicit (a "Share my location" button) rather than prompting on load, matching `/explore`; a "Browse Detroit instead" button and automatic fallback on denial/unavailability both use the same default-region origin as Explore, always labeled as not the visitor's real location. `GET /api/people/nearby` wraps the existing `nearbyPeople` repository function the same way the bounds route wraps `peopleInBounds`. The three sort options (nearest, most notable, recently added) are a client-side re-sort of one fetched batch — no refetch or extra query parameter — because the API already returns `distance_meters` and `dead_score`, and `created_at` was added to the discovery pipeline for exactly this (see docs/DATABASE.md).

Data fetching lives in `useNearbyResults`, a dedicated hook, not inline in `NearbyClient` — and deliberately does not set a `loading` flag synchronously at the top of its effect. `eslint-plugin-react-hooks`'s `set-state-in-effect` rule flags that pattern even from a helper function called by the effect; the intended fix is to derive loading state instead of imperatively setting it. The hook keeps only the last *settled* (or errored) request, keyed by `{latitude, longitude, radius}`, and compares that key against the current render's inputs: mismatched means still loading, and a stale response arriving after a newer request started can never overwrite it. This has a real UX benefit beyond satisfying the linter — the previous result list stays on screen while a new radius or location loads, instead of flashing empty.

## Profiles

`/people/[slug]` and `/cemeteries/[slug]` need fields no discovery feed does (biography, external IDs, provenance, full cemetery detail), so `personProfile`/`cemeteryProfile` in the repository read the base tables directly instead of stretching `discovery_people` to cover every consumer. In Supabase mode this is a handful of small, targeted queries per page load (the person or cemetery's own row, its category/image/source rows) rather than one large nested join — simpler to get right, and profile pages are not a hot path the way the map's bounds queries are. `personProfile` still starts from `discovery_people` for the coordinate/precision/category fields it already solves correctly, then layers the profile-only columns on top from `people` directly. `cemeteryProfile` needed one new function, `cemetery_by_slug` (migration `20260905200000_cemetery_by_slug.sql`), because a cemetery's own coordinate — not a person's effective discovery point — isn't otherwise exposed as plain lat/lng anywhere; it mirrors `cemeteries_in_bounds`'s existing `ST_X`/`ST_Y` extraction, just keyed by slug instead of a bounding box. A cemetery's "categories represented" is derived from its actual current people list on every read, not stored or hand-maintained, so it can never drift out of sync with who is actually listed there.

Both repository functions return `null` for a slug that doesn't exist *or* isn't published/is a fixture — RLS enforces that distinction identically at the database layer, so the page's `notFound()` call can't be used to probe which case it was.

`ProfileMap` (a single fixed marker, no clustering or click handling) hit the exact same Mapbox container-sizing bug `MapCanvas` did on `/explore` — mapbox-gl's own `mapboxgl-map` class fighting a same-specificity `position: relative` — and needed the identical fix: a nested mount div plus a `ResizeObserver`. Verified in-browser rather than assumed, since it's the same underlying library issue in a new place, not a one-off.

## Future identity and admin

Core reads are public. Saved/visited/collections later use Supabase Auth and owner-scoped RLS. A private admin needs explicit server-side role checks, audit history, draft/publish review, coordinate correction, source management, score adjustment, featured records, and correction triage. Never authorize with editable user metadata. No admin browser may receive a service-role key.

## Deployment

Import the repository into Vercel after local verification; configure public origin and Supabase read credentials there. Apply migrations through the deployment process before enabling database-backed reads. Do not run development seeds against production. This task does not create remote resources or deploy.

## Toolchain compatibility decision

On 2026-09-05 npm reports Next.js 16.3.4 and React 19.2.8 as stable. TypeScript 7.0.2 was tested, but Next's typescript-eslint dependency rejects its API. Pin TypeScript 6.0.3 until that support lands; do not suppress lint or add a parallel compiler solely to claim the newest version. npm resolves ESLint 9.39.5 for the compatible lint dependency graph. Revisit both together. Supabase's July 2026 extension change deprecates explicit extension versions, so migrations use the platform's default PostGIS version.

## Executable database checks

Docker is not installed in the initial workspace. Two test-only packages, PGlite and its PostGIS extension, make real SQL and spatial checks repeatable without external infrastructure. The deployment still uses Supabase; there is no embedded production database. Role bootstrap in the harness approximates Supabase's anonymous/authenticated/service roles. Run the standalone SQL smoke file on local Supabase before deployment to cover platform differences.

The homepage is a Server Component that reads featured records through the server-only repository. It is dynamically rendered so missing deployment credentials do not break the build and configuration/data changes do not require rebuilding. Errors reach a user-friendly retry boundary; empty published datasets show an honest empty state. Only explicit demo mode returns source-backed development fixtures, with a visible label. Demo mode is rejected on Vercel production.
