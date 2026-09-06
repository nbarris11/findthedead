# Design direction

Premium exploration, with historical character. Deep green-charcoal surfaces, warm white text, a sharp pale-lime accent, confident sans-serif headlines, and selective editorial serif typography. No horror, Halloween styling, decorative skulls, or sensationalism.

The initial homepage is intentionally typographic. Licensed historical photography can be added with verified attribution; never substitute fabricated portraits for real people. The primary action is “Find the dead near me,” with “Explore the map” secondary; both lead to `/explore`, where the map itself asks for location rather than the homepage pre-empting that permission prompt.

Mobile-first stacked content, roomy tap targets, strong contrast, visible keyboard focus, skip link, semantic landmarks, and reduced-motion support. Avoid unverified counts or implied distances. The `/explore` bottom sheet (`PersonSheet`, `PersonListSheet`) moves focus to its close control on open, dismisses on Escape or backdrop click, and returns focus to the map on close. Geolocation permission denial or unavailability shows a plain status message and leaves the map centered on the default region without implying it is the visitor's location.

Person pages use server-generated titles, descriptions, canonical URLs, Open Graph, and Person JSON-LD (birth/death dates only when actually known, `sameAs` only when a real Wikipedia URL exists). Cemetery pages use the same pattern with a Cemetery type. Published profiles are indexable and included in the database-generated sitemap; drafts, fixtures, missing records, and utility pages are excluded.

A profile page never renders an empty section for research that doesn't exist yet: "why they're interesting" and biography are omitted entirely (not shown as an empty heading) when both are null. Exact-grave vs. cemetery-only wording matches Explore's bottom sheet verbatim, so the same fact is never phrased two different ways depending on which page a visitor reached it from.
