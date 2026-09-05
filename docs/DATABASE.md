# Database design

## Implemented schema

- `people`: UUID, unique slug/Wikidata ID, name, optional precise dates and known years, descriptions/biography/significance, Wikipedia URL, editorial score, feature flag, publication state, timestamps.
- `cemeteries`: UUID, unique slug, description, city/state/country, WGS84 geography point, website, publication state, timestamps.
- `burials`: person/cemetery foreign keys, optional burial point, precision enum, confidence, source, primary burial flag. One primary burial per person; retain history without duplicating discovery results.
- `person_locations`: typed birth/death/residence/historical-event/burial association, optional point, precision and source. Burial table remains canonical for discovery.
- `categories` and `person_categories`: many-to-many, data-driven taxonomy.
- `sources`: URL/type/external ID/retrieval date/field/confidence plus a foreign-key-backed target (person, cemetery, burial, location or image). Multiple sources can support one field. A nullable source pointer on an entity identifies primary evidence; reverse source targets retain additional evidence.
- `images`: person, URL, source, creator, license, attribution, alt text. No image is publishable without licensing metadata.

Location precision: `exact_grave`, `cemetery_section`, `cemetery`, `approximate`, `unknown`. Confidence is 0–1. Cemetery-only coordinates must never be represented as exact graves. Missing dates remain null; known years do not become invented January 1 dates.

## Queries and safety

Provide nearby people with meter distances, people in map bounds, and cemeteries in bounds. Nearest query uses `ST_DWithin` and GiST; bounds uses geometry expression indexes. Both point sources are searched separately. Bounds crossing longitude ±180 are split into two envelopes. Enforce coordinate, radius, result-limit and score ranges in SQL as well as Zod.

Enable RLS on every public table. Anonymous/authenticated readers see published non-fixture records and related public evidence only. No public write policies. RPCs use invoker privileges, empty search paths, qualified names, and explicit execution grants. Dedicated backend writers must satisfy constraints; publication is an editorial action, not a side effect of seeding.

Development seed rows are drafts and unavailable to anonymous queries. Offline demo reads the same fixture input explicitly; this avoids accidentally publishing a development dataset. SQL tests create temporary published fixtures inside a rolled-back transaction to verify public access.

## Implemented contracts

Migration: `supabase/migrations/20260905162642_discovery_foundation.sql` (created through the Supabase CLI).

| Function | Inputs | Output |
| --- | --- | --- |
| `nearby_people` | latitude, longitude, radius_meters (1–160934.4), min_score (0–100), optional category_slug, result_limit (1–200) | Person DTOs and meter distance, nearest first; score/UUID break ties |
| `people_in_bounds` | west/south/east/north, min_score, category_slug, result_limit | Visible people, highest editorial score first |
| `cemeteries_in_bounds` | west/south/east/north, result_limit | Cemetery DTOs alphabetically |
| `query_envelopes` | west/south/east/north | Validated one or two WGS84 envelopes; internal shared helper |

Bounds west > east means an antimeridian crossing. Bounds -180 to 180 means the full world. Limits cap returned records, not a total count. Future API responses must request an extra row within the 200 ceiling or expose separate counts before showing a complete nearby count.

`discovery_people` is a security-invoker view with effective coordinates. Nearby RPC serializes them as `latitude_out` / `longitude_out` to avoid conflicts with its input arguments; the TypeScript repository normalizes these names. Offline Haversine distances approximate spherical distance; production PostGIS uses spheroidal geography distance. Both implementations share validation and sort rules.

The checked-in TypeScript schema interface is hand-maintained and tested by compilation. Generate a separate `database.generated.ts` from the running local Supabase instance before integrating more complex joins; do not overwrite the domain DTOs. SQL smoke tests run under anonymous and authenticated roles; PGlite tests bootstrap only those roles plus service_role. They exercise actual PostgreSQL and PostGIS, but do not replace a Supabase/PostgREST deployment test.
