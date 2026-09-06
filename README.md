# FindTheDead

Find interesting dead people around you. A location-first history discovery product, beginning in Detroit and Southeast Michigan.

All seven planned milestones are implemented: foundation, database, `/explore` (the interactive map), `/nearby`, person and cemetery profiles, `/search`, and a bounded Wikidata ingestion pipeline. No login, Supabase project, or remote database is needed for the local preview; a Mapbox token is only needed to see the actual map tiles (see Environment, below) — without one, `/explore` degrades to an accessible list instead of breaking.

## Run locally

Install Node.js 22 or newer, then:

```bash
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. `DATA_MODE=demo` explicitly selects offline development data — the seeded 22 people and two Detroit cemeteries. The preview is noindex.

## Check the application

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For a production-mode local server, run `npm run start` after building. Build does not need external font services or ingestion APIs.

## Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Full canonical origin; localhost for development, https://findthedead.com at launch |
| `DATA_MODE` | `demo` for explicit offline preview; `supabase` for database reads |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, required in database mode |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preferred public read key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional legacy fallback if no publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted offline ingestion only (`npm run publish:reviewed`); never a public variable or normal app read credential |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public token from account.mapbox.com for `/explore`'s map; without it the route falls back to an accessible list |

Keep actual keys in ignored `.env.local` locally, or your host's environment variable settings in production (Netlify, in this project's case). Never commit secrets. A configured database failure must not be hidden by switching to demo data.

## Product and architecture

Read [Product](docs/PRODUCT.md), [Architecture](docs/ARCHITECTURE.md), [Database](docs/DATABASE.md), [Data sources](docs/DATA-SOURCES.md), [Design](docs/DESIGN.md), and [Roadmap](docs/ROADMAP.md).

## Deployment

Live at [findthedead.netlify.app](https://findthedead.netlify.app) on Netlify, connected to `github.com/nbarris11/findthedead` for continuous deployment — every push to `main` redeploys automatically. `netlify.toml` declares the build command and the official `@netlify/plugin-nextjs` explicitly rather than relying on auto-detection. Nothing here is Vercel-specific, so any standard Next.js host works the same way.

Environment variables (`NEXT_PUBLIC_SITE_URL`, `DATA_MODE=supabase`, the Supabase URL/publishable key, the Mapbox token) are set directly in Netlify's project configuration, not committed. `SUPABASE_SERVICE_ROLE_KEY` is intentionally not set there — the deployed app never needs it; only the offline ingestion scripts (below) do.

The deployed site currently shows the honest empty state ("The first stories are being prepared") — real infrastructure, real database, no published content yet. That's a deliberate, separate editorial decision (see docs/ROADMAP.md).

## Local Supabase database

Install Docker Desktop (and start it) plus Supabase CLI 2.84.2 or newer. On macOS with Homebrew, install the CLI with `brew install supabase/tap/supabase`. The repository includes CLI-generated `supabase/config.toml`.

```bash
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
supabase start
supabase db reset --local
supabase db query --local --file supabase/tests/discovery.sql
supabase db advisors --local --type security --fail-on error
supabase gen types --local --lang typescript --schema public > src/types/database.generated.ts
```

**`db reset --local` deletes and recreates this local development database.** Use it only when local data is disposable. It applies all five migrations and loads the 22-person development seed. Never use this seed/reset procedure against production.

Copy the local project URL and publishable (or legacy anon) key printed by `supabase start` into `.env.local`, set `DATA_MODE=supabase`, and restart Next.js. All seed people and cemeteries are deliberately drafts, so anonymous database mode initially shows the empty state. Continue using demo mode to inspect source-backed development content. Publish only individually reviewed records, with both the person and cemetery approved; removing `is_fixture` and setting `status=published` is a trusted editorial operation. Never give the public app a service-role key to bypass this.

## Database verification without Docker

```bash
npm run seed:check
npm run test:db
```

The test-only PGlite/PostGIS dependencies execute every migration in order, seed it twice to verify reruns, and test spatial queries, precision constraints and public access. They are not used by the deployed app. `npm test` includes these checks plus geographic utilities, validation, transformations, and the ingestion pipeline's normalize/dedupe/schema logic. Full Supabase/PostgREST verification still requires Docker or a configured development project.

Edit `data/detroit.seed.json` and run `npm run seed:build` to regenerate the SQL. See the source review in `docs/DATA-SOURCES.md`. No ingestion requests are made during builds or ordinary page loads.

## Data ingestion (development)

```bash
npm run ingest:wikidata -- --limit 25 --radius-km 40
```

Queries Wikidata's public SPARQL endpoint once for deceased people with a documented place of burial near Detroit, normalizes and deduplicates them against the existing seed, and writes a reviewable run to `data/ingestion-runs/<uuid>.json` (gitignored — raw fetch output, not reviewed content). This makes exactly one real network request and never touches any database.

To turn reviewed candidates into real draft records, copy a run file, add `short_description`, `categories`, `dead_score`, and `confirmed: true` to each candidate you approve (delete the rest), then:

```bash
DATA_MODE=supabase npm run publish:reviewed -- path/to/reviewed-run.json --confirm
```

This requires `SUPABASE_SERVICE_ROLE_KEY` and inserts `status='draft', is_fixture=false` records only — publishing them is a separate, later editorial action, same as the seed. See `docs/DATA-SOURCES.md` for the full policy and a real example run.
