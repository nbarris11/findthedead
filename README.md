# FindTheDead

Find interesting dead people around you. A location-first history discovery product, beginning in Detroit and Southeast Michigan.

This repository covers milestones 1–2: the app foundation and geographic database. The interactive map is the next milestone. No login, Mapbox token, or remote database is needed for the local preview.

## Run locally

Install Node.js 22 or newer, then:

```bash
cd "/Users/barris/Documents/ChatGPT/Find The Dead"
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. `DATA_MODE=demo` explicitly selects offline development data. The preview is noindex. The homepage links to existing preview content; map and location controls arrive in milestone 3.

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
| `SUPABASE_SERVICE_ROLE_KEY` | Future trusted ingestion only; never a public variable or normal app read credential |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Future map milestone; use a URL-restricted public Mapbox token |

Keep actual keys in ignored `.env.local` or Vercel settings. Never commit secrets. A configured database failure must not be hidden by switching to demo data.

## Product and architecture

Read [Product](docs/PRODUCT.md), [Architecture](docs/ARCHITECTURE.md), [Database](docs/DATABASE.md), [Data sources](docs/DATA-SOURCES.md), [Design](docs/DESIGN.md), and [Roadmap](docs/ROADMAP.md).

Deployment target: Vercel with Supabase PostgreSQL/PostGIS. No remote project or deployment is created by this foundation.

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

**`db reset --local` deletes and recreates this local development database.** Use it only when local data is disposable. It applies migrations and loads the 22-person development seed. Never use this seed/reset procedure against production.

Copy the local project URL and publishable (or legacy anon) key printed by `supabase start` into `.env.local`, set `DATA_MODE=supabase`, and restart Next.js. All seed people and cemeteries are deliberately drafts, so anonymous database mode initially shows the empty state. Continue using demo mode to inspect source-backed development content. Publish only individually reviewed records, with both the person and cemetery approved; removing `is_fixture` and setting `status=published` is a trusted editorial operation. Never give the public app a service-role key to bypass this.

## Database verification without Docker

```bash
npm run seed:check
npm run test:db
```

The test-only PGlite/PostGIS dependencies execute the migration, seed it twice to verify reruns, and test spatial queries, precision constraints and public access. They are not used by the deployed app. `npm test` includes these checks plus geographic utilities, validation and transformations. Full Supabase/PostgREST verification still requires Docker or a configured development project.

Edit `data/detroit.seed.json` and run `npm run seed:build` to regenerate the SQL. See the source review in `docs/DATA-SOURCES.md`. No ingestion requests are made during builds or ordinary page loads.
