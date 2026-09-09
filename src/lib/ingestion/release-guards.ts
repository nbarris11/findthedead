import type { ReviewedCandidate } from "./reviewed.ts";

const fields = ["wikidata_id", "slug", "name", "birth_date", "birth_year", "death_date", "death_year", "wikipedia_url", "short_description", "biography", "why_interesting", "dead_score"] as const;
export function assertReviewedContent(candidate: ReviewedCandidate, stored: Record<string, unknown>) {
  for (const field of fields) if ((candidate[field] ?? null) !== (stored[field] ?? null))
    throw new Error(`Release guard failed: ${candidate.slug} stored ${field} differs from the reviewed batch; repair the draft before release.`);
}

export function assertReviewedCemetery(candidate: ReviewedCandidate, cemeteryId: string, sources: { cemetery_id: string | null; external_id: string | null; source_type: string }[]) {
  if (!sources.some((s) => s.cemetery_id === cemeteryId && s.source_type === "wikidata" && s.external_id === candidate.burial_place_wikidata_id))
    throw new Error(`Release guard failed: ${candidate.slug} primary cemetery differs from its reviewed burial entity.`);
}
