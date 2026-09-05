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
