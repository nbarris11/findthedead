# Architecture

## Stack and boundaries

Next.js App Router, strict TypeScript, React, Tailwind, Zod, Supabase PostgreSQL and PostGIS. Target Vercel's Node runtime. Mapbox GL JS is reserved for milestone 3; do not add its bundle before needed. Versions are pinned with package-lock.json. Node 22+ is the supported baseline; no remote font fetch is required during builds.

Server Components own page rendering and metadata. Future browser map/location components are small client boundaries. `src/lib/data` is the server-only repository boundary; ordinary requests use Supabase, never Wikidata. A separate, explicit development mode reads committed seed fixtures with no credentials. Supabase failures must not silently fall back to demo content. Never use service-role keys for public reads.

`supabase/migrations` defines schema and SQL query functions. `data` holds reviewed development seed inputs. `scripts` contains deterministic local seed tooling; network ingestion comes in milestone 7. `tests` covers validation and geographic edge cases. `supabase/tests` exercises schema and access rules on a real PostGIS database.

## Geographic design

Store WGS84 geography points and GiST indexes. A burial has an optional location more precise than its cemetery. The effective discovery point is burial point first, cemetery point second. Index each source point separately and query both branches, rather than relying on an unindexed join-time coalesce. Distances are meters internally; miles are presentation/query inputs. Bounds queries support antimeridian wrapping. Region defaults belong in product configuration, never database logic.

## Future map and APIs

Add bounded Zod-validated route handlers calling security-invoker RPCs. Return compact serializable coordinates, provenance/precision, categories and distance. Cap result counts; return a truncation signal before claiming complete counts. Mapbox native GeoJSON sources/layers handle clusters. Debounce bounds changes, abort stale requests, and distinguish permission denied, unavailable, loading, empty, and server failure. Do not persist visitor coordinates or log them by default.

## Future identity and admin

Core reads are public. Saved/visited/collections later use Supabase Auth and owner-scoped RLS. A private admin needs explicit server-side role checks, audit history, draft/publish review, coordinate correction, source management, score adjustment, featured records, and correction triage. Never authorize with editable user metadata. No admin browser may receive a service-role key.

## Deployment

Import the repository into Vercel after local verification; configure public origin and Supabase read credentials there. Apply migrations through the deployment process before enabling database-backed reads. Do not run development seeds against production. This task does not create remote resources or deploy.

## Toolchain compatibility decision

On 2026-09-05 npm reports Next.js 16.3.4 and React 19.2.8 as stable. TypeScript 7.0.2 was tested, but Next's typescript-eslint dependency rejects its API. Pin TypeScript 6.0.3 until that support lands; do not suppress lint or add a parallel compiler solely to claim the newest version. npm resolves ESLint 9.39.5 for the compatible lint dependency graph. Revisit both together. Supabase's July 2026 extension change deprecates explicit extension versions, so migrations use the platform's default PostGIS version.

## Executable database checks

Docker is not installed in the initial workspace. Two test-only packages, PGlite and its PostGIS extension, make real SQL and spatial checks repeatable without external infrastructure. The deployment still uses Supabase; there is no embedded production database. Role bootstrap in the harness approximates Supabase's anonymous/authenticated/service roles. Run the standalone SQL smoke file on local Supabase before deployment to cover platform differences.

The homepage is a Server Component that reads featured records through the server-only repository. It is dynamically rendered so missing deployment credentials do not break the build and configuration/data changes do not require rebuilding. Errors reach a user-friendly retry boundary; empty published datasets show an honest empty state. Only explicit demo mode returns source-backed development fixtures, with a visible label. Demo mode is rejected on Vercel production.
