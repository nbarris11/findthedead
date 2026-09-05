import type { IngestionCandidate, DedupedCandidate } from "./types.ts";

/** Matches the slug pattern in src/lib/validation/slug.ts. Diacritics are
 *  stripped via Unicode normalization rather than dropped as unknown
 *  characters, so "José" becomes "jose", not "jos". */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every candidate is classified "new" or "possible_duplicate" — never
 *  silently merged or dropped. Wikidata ID is the strongest signal, since a
 *  slug collision can be two different people who share a common name; a
 *  wikidata_id match is definitionally the same Wikidata item. Neither case
 *  is resolved automatically: per docs/DATA-SOURCES.md, uncertain matches
 *  go to editorial review, not automatic name-based merging. Also dedupes
 *  within the fetched batch itself by wikidata_id, since a burial place
 *  matching the search radius from more than one direction could otherwise
 *  return the same person twice. */
export function dedupeCandidates(
  candidates: readonly IngestionCandidate[],
  existingSlugs: ReadonlySet<string>,
  existingWikidataIds: ReadonlySet<string>,
): DedupedCandidate[] {
  const seenInBatch = new Set<string>();
  const deduped: DedupedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.wikidata_id && seenInBatch.has(candidate.wikidata_id)) continue;
    if (candidate.wikidata_id) seenInBatch.add(candidate.wikidata_id);

    const slug = slugify(candidate.name);
    if (existingWikidataIds.has(candidate.wikidata_id)) {
      deduped.push({
        ...candidate,
        slug,
        dedupe_status: "possible_duplicate",
        dedupe_reason: `wikidata_id ${candidate.wikidata_id} already exists`,
      });
    } else if (existingSlugs.has(slug)) {
      deduped.push({
        ...candidate,
        slug,
        dedupe_status: "possible_duplicate",
        dedupe_reason: `slug matches existing person "${slug}"`,
      });
    } else {
      deduped.push({ ...candidate, slug, dedupe_status: "new", dedupe_reason: null });
    }
  }
  return deduped;
}
