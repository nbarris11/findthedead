# FindTheDead product

Find interesting dead people around you. This is location-first history discovery, not genealogy, obituary search, memorial hosting, or a grave-record directory.

Start in Detroit and Southeast Michigan; accept arbitrary global coordinates throughout the database and query layer. Visitors should eventually open the site, request location, browse a clustered map, preview a person, then open a profile or external directions. Core use never requires authentication.

## This release

Milestones 1–3: locally runnable Next.js foundation, restrained homepage, documented product decisions, PostGIS schema, development seeds, geographic query contracts, validation, tests, and the `/explore` map. The homepage's primary and secondary CTAs both lead to `/explore`; "Find the dead near me" is the visitor asking the map for their location, not a separate flow. Map pins open an accessible bottom sheet with the person's story, cemetery, distance (once location is shared), precision-aware directions, and a link to their profile — the visitor stays on the map rather than being bounced away. A cluster whose burials share one coordinate (common at cemetery precision) hands off to a plain list instead of spinning at maximum zoom. Category and "Notable only" filters are data-driven from the `categories` table. If `NEXT_PUBLIC_MAPBOX_TOKEN` is unset, `/explore` degrades to an accessible list of the same records rather than a broken page.

## Next experience

Navigation: Explore, Search, Nearby, Saved (future placeholder) — only Explore exists as a real route today. Nearby supports 5/10/25/50 miles and nearest, notable, or newly added ordering. Profiles (`/people/[slug]`, `/cemeteries/[slug]`) distinguish exact grave, section, cemetery, approximate, and unknown precision; the explore sheet's "View profile" link already points there ahead of the pages existing. Exact coordinates do not establish public access; cemetery visiting rules still apply.

## Editorial policy

Respect individual people and victims. Explain significance without glorification. Never invent burial facts or turn cemetery coordinates into grave coordinates. Unverified fixtures are clearly labeled and excluded from public database access. Do not publish thin pages. No authentication, admin UI, optimized tours, national importer, or scraping restricted cemetery sites in this release.

## Dead Score

An editorial 0–100 discovery weight, not a scientific measurement or claim of human worth. Seed values are provisional. Future ranking may blend Wikipedia views, article prominence and links, awards, historical importance, occupation, cultural relevance, local significance, and editorial review. Version the future scoring method and retain explanations. Thresholds must be configurable; low-scoring people must remain searchable.
