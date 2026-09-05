# Roadmap

1. Foundation: Next.js, TypeScript, Tailwind, layout, minimal homepage, metadata, documentation, environment template. Validate lint/typecheck/build and HTTP response. Commit independently.
2. Database: Supabase/PostGIS migrations, constraints/RLS/indexes, typed contracts, bounded geographic RPCs, 20–50 sourced development records, deterministic seed tooling and critical tests. Validate offline and SQL where local PostGIS is available. Commit independently.
3. Explore: Mapbox native clustering, filters, bounds search, location/errors, accessible mobile preview sheet. Install Mapbox here.
4. Nearby: permission flow, radii, sorting and distances with manual fallback.
5. Profiles: people/cemeteries, sources, precision-aware maps/directions, nearby records, substantive SEO.
6. Search: performant person search; cemetery query contract and distinct result types.
7. Ingestion: bounded Wikidata proof of concept, provenance, normalization and deduplication.

Never combine unrelated work into one commit. Preserve the next milestones until the schema and development flow are stable.

Before public launch: complete real-database tests, review all seed evidence and locations, license images, add observability without location leakage, validate the actual map/location flow on mobile and keyboard, and enable SEO only for reviewed pages. Authentication/admin/tours are separate later decisions.

## Foundation delivery status

Milestones 1–5 are implemented. Milestone 1 was committed as `18456fb`; Milestone 2 as `07155d8`; Milestone 3 as `431a0eb`; Milestone 4 as `1f40cf3`. Milestone 2 adds 22 sourced development people, two cemeteries, 10 categories, 46 provenance records, protected geographic RPCs, an explicit offline repository, and database-backed featured reads. Milestone 3 adds `/explore`: a bounded `GET /api/people/bounds` route handler, Mapbox GL native clustering (no per-marker React nodes), a data-driven category/notable filter bar, an accessible bottom sheet with precision-aware directions, a cluster-to-list fallback for coincident cemetery-precision burials, geolocation with distinct denied/unavailable/loading states, and a token-less fallback list so the route degrades instead of breaking.

Milestone 4 adds `/nearby`: a `GET /api/people/nearby` route handler over the existing `nearbyPeople` repository function, an explicit location-permission gate with a manual "Browse Detroit instead" fallback, radius selection (5/10/25/50 mi), and client-side nearest/most-notable/recently-added sorting. Exposing `created_at` through `discovery_people` and `nearby_people` (migration `20260905190000_expose_created_at.sql`) was the one schema change this milestone needed; see docs/DATABASE.md for why it isn't backdated or fabricated per person.

Milestone 5 adds `/people/[slug]` and `/cemeteries/[slug]`: real pages behind every "View profile" link and cemetery link already written into Explore, Nearby, and each other. `personProfile`/`cemeteryProfile` read the base tables directly for fields no discovery feed carries (biography, external IDs, full provenance), reusing `discovery_people` for the parts it already solves. One new function, `cemetery_by_slug` (migration `20260905200000_cemetery_by_slug.sql`), exposes a cemetery's own coordinate for its map. Both pages carry canonical URLs, Open Graph, and Person/Cemetery JSON-LD, but remain `noindex` — SEO infrastructure exists; indexing itself is still gated on editorial review of the underlying records, which hasn't happened. No later milestone has started.

Validation: lint, strict TypeScript, seed reproducibility, tests (including executable PostgreSQL/PostGIS checks against all three migrations), production build, and local HTTP response for `/`, `/explore`, `/nearby`, `/people/[slug]`, and `/cemeteries/[slug]` (including a genuine 404 for an unknown slug). Docker/Supabase/PostgREST integration and the Supabase security advisor require a running local Supabase instance and remain pre-deployment checks. The project now has a project-scoped Supabase MCP server (`.mcp.json`) pointed at the real FindTheDead project; the app itself still runs in `DATA_MODE=demo` until that project's schema is applied and credentials are set. Automated browser interaction testing (e.g. Playwright) is still not set up; every milestone's flows were verified with the in-app browser tool instead.
