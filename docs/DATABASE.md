# Database design

## Proposed schema (implemented in milestone 2)

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
