# Role tags and discovery filters

The researcher verifies category assignments alongside identity, biography, and
burial evidence. The founder does not need to review the candidate queue.

Every published person needs at least one supported category; multiple relevant
categories are encouraged. Use documented achievements, occupations, and public
roles, not name matching or assumptions. Record the supporting biography source
in the reviewed record. A Wikidata occupation is a research lead, not approval.

- Presidents: people who served as a country's head of state with the title
  president; not company presidents. Also assign Politics. Confirm the identity
  and office from the biography, especially for names shared with presidents.
- Sports: athletes, coaches, and other people notable for a sporting career.
- Inventors: documented inventions; business ownership alone is not enough.
- Military: documented military service or leadership, not merely being
  commander-in-chief by holding the presidency.
- History: a documented historical contribution; do not add it to every deceased
  person simply because they lived in the past.
- Music, Entertainment, Business, Writers, Scientists, Artists, Civil Rights,
  Politics, and Local Legends: use when the sourced biography supports the role.
- Crime: use for documented significance to crime history; do not turn an
  unproven allegation into a label.

The controlled vocabulary lives in `src/lib/ingestion/categories.ts`. Keep
existing slugs stable. New categories are inserted only when used in a reviewed
batch. The Explore dropdown reads the database category list automatically and
filters by any matching person-category link. Filtering narrows results; it does
not change their ranking. Person pages also show their assigned category slugs.

Publishing is additive: rerunning a reviewed profile adds missing tags and
preserves earlier assignments. Incorrect existing tags require a separate,
explicitly scoped correction; they are never silently erased by a batch retry.
