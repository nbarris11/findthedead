# FindTheDead product

Find interesting dead people around you. This is location-first history discovery, not genealogy, obituary search, memorial hosting, or a grave-record directory.

Start in Detroit and Southeast Michigan; accept arbitrary global coordinates throughout the database and query layer. Visitors should eventually open the site, request location, browse a clustered map, preview a person, then open a profile or external directions. Core use never requires authentication.

## This release

Milestones 1–4: locally runnable Next.js foundation, restrained homepage, documented product decisions, PostGIS schema, development seeds, geographic query contracts, validation, tests, the `/explore` map, and `/nearby`. The homepage's primary and secondary CTAs both lead to `/explore`; "Find the dead near me" is the visitor asking the map for their location, not a separate flow. Map pins open an accessible bottom sheet with the person's story, cemetery, distance (once location is shared), precision-aware directions, and a link to their profile — the visitor stays on the map rather than being bounced away. A cluster whose burials share one coordinate (common at cemetery precision) hands off to a plain list instead of spinning at maximum zoom. Category and "Notable only" filters are data-driven from the `categories` table. If `NEXT_PUBLIC_MAPBOX_TOKEN` is unset, `/explore` degrades to an accessible list of the same records rather than a broken page.

`/nearby` asks explicitly for location (a button, not a page-load prompt) and supports the spec's 5/10/25/50 mile radii and nearest/most-notable/recently-added sort, with cards showing name, life dates, description, burial place, distance, and Dead Score. Declining location, or a browser without it, falls back to Detroit-centered results with a clearly worded banner and a one-click retry — it never implies a fallback region is the visitor's real location. No image pipeline is wired into discovery reads yet, so cards are intentionally text-only rather than showing a placeholder avatar next to a real, named person.

## Next experience

Navigation: Explore, Search, Nearby, Saved (future placeholder) — Explore and Nearby exist as real routes today. Profiles (`/people/[slug]`, `/cemeteries/[slug]`) distinguish exact grave, section, cemetery, approximate, and unknown precision; both the explore sheet's and Nearby's "View profile" links already point there ahead of the pages existing. Exact coordinates do not establish public access; cemetery visiting rules still apply.

## Editorial policy

Respect individual people and victims. Explain significance without glorification. Never invent burial facts or turn cemetery coordinates into grave coordinates. Unverified fixtures are clearly labeled and excluded from public database access. Do not publish thin pages. No authentication, admin UI, optimized tours, national importer, or scraping restricted cemetery sites in this release.

## Dead Score

An editorial 0–100 discovery weight, not a scientific measurement or claim of human worth. Seed values are provisional. Future ranking may blend Wikipedia views, article prominence and links, awards, historical importance, occupation, cultural relevance, local significance, and editorial review. Version the future scoring method and retain explanations. Thresholds must be configurable; low-scoring people must remain searchable.
