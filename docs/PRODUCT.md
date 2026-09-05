# FindTheDead product

Find interesting dead people around you. This is location-first history discovery, not genealogy, obituary search, memorial hosting, or a grave-record directory.

Start in Detroit and Southeast Michigan; accept arbitrary global coordinates throughout the database and query layer. Visitors should eventually open the site, request location, browse a clustered map, preview a person, then open a profile or external directions. Core use never requires authentication.

## This release

Milestones 1–2 only: locally runnable Next.js foundation, restrained homepage, documented product decisions, PostGIS schema, development seeds, geographic query contracts, validation, and tests. The final sentence of the first assignment says the map is next; therefore `/explore` is deliberately deferred. Homepage preview links scroll to existing content. Do not offer nonfunctional location/map buttons.

## Next experience

Navigation: Explore, Search, Nearby, Saved (future placeholder). Map pins open an accessible bottom sheet rather than immediately navigating. Nearby supports 5/10/25/50 miles and nearest, notable, or newly added ordering. Profiles distinguish exact grave, section, cemetery, approximate, and unknown precision. Exact coordinates do not establish public access; cemetery visiting rules still apply.

## Editorial policy

Respect individual people and victims. Explain significance without glorification. Never invent burial facts or turn cemetery coordinates into grave coordinates. Unverified fixtures are clearly labeled and excluded from public database access. Do not publish thin pages. No authentication, admin UI, optimized tours, national importer, or scraping restricted cemetery sites in this release.

## Dead Score

An editorial 0–100 discovery weight, not a scientific measurement or claim of human worth. Seed values are provisional. Future ranking may blend Wikipedia views, article prominence and links, awards, historical importance, occupation, cultural relevance, local significance, and editorial review. Version the future scoring method and retain explanations. Thresholds must be configurable; low-scoring people must remain searchable.
