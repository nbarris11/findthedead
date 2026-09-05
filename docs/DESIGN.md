# Design direction

Premium exploration, with historical character. Deep green-charcoal surfaces, warm white text, a sharp pale-lime accent, confident sans-serif headlines, and selective editorial serif typography. No horror, Halloween styling, decorative skulls, or sensationalism.

The initial homepage is intentionally typographic. Licensed historical photography can be added with verified attribution; never substitute fabricated portraits for real people. The primary action is “Find the dead near me,” with “Explore the map” secondary; both lead to `/explore`, where the map itself asks for location rather than the homepage pre-empting that permission prompt.

Mobile-first stacked content, roomy tap targets, strong contrast, visible keyboard focus, skip link, semantic landmarks, and reduced-motion support. Avoid unverified counts or implied distances. The `/explore` bottom sheet (`PersonSheet`, `PersonListSheet`) moves focus to its close control on open, dismisses on Escape or backdrop click, and returns focus to the map on close. Geolocation permission denial or unavailability shows a plain status message and leaves the map centered on the default region without implying it is the visitor's location.

Future person metadata uses server-generated titles, descriptions, canonical URLs, Open Graph and appropriate Person structured data. Cemetery pages use Place/Cemetery where supported. Preview is noindex; indexing is enabled only with reviewed substantive records. Do not include drafts, fixtures or empty profiles in sitemaps.
