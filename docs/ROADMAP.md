# Roadmap

1. Foundation: Next.js, TypeScript, Tailwind, layout, minimal homepage, metadata, documentation, environment template. Validate lint/typecheck/build and HTTP response. Commit independently.
2. Database: Supabase/PostGIS migrations, constraints/RLS/indexes, typed contracts, bounded geographic RPCs, 20–50 sourced development records, deterministic seed tooling and critical tests. Validate offline and SQL where local PostGIS is available. Commit independently.
3. Explore: Mapbox native clustering, filters, bounds search, location/errors, accessible mobile preview sheet. Install Mapbox here.
4. Nearby: permission flow, radii, sorting and distances with manual fallback.
5. Profiles: people/cemeteries, sources, precision-aware maps/directions, nearby records, substantive SEO.
6. Search: performant person search; cemetery query contract and distinct result types.
7. Ingestion: bounded Wikidata proof of concept, provenance, normalization and deduplication.

Milestones 1–2 are this session's scope. Never combine unrelated work into one commit. Preserve the next milestones until the schema and development flow are stable.

Before public launch: complete real-database tests, review all seed evidence and locations, license images, add observability without location leakage, validate the actual map/location flow on mobile and keyboard, and enable SEO only for reviewed pages. Authentication/admin/tours are separate later decisions.

## Foundation delivery status

Milestones 1 and 2 are implemented. Milestone 1 was committed as `18456fb`. Milestone 2 adds 22 sourced development people, two cemeteries, 10 categories, 46 provenance records, protected geographic RPCs, an explicit offline repository, and database-backed featured reads. No later milestone has started.

Validation: lint, strict TypeScript, seed reproducibility, 16 tests (including executable PostgreSQL/PostGIS checks), production build, and local HTTP response. Docker/Supabase/PostgREST integration and the Supabase security advisor require a running local Supabase instance and remain pre-deployment checks. Browser interaction testing is deferred with the map milestone.
