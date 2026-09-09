import type { IngestionCandidate } from "./types.ts";
import { z } from "zod";

const packetSchema = z.object({
  version: z.literal(1), wikidata_id: z.string().regex(/^Q[1-9]\d*$/),
  retrieved_at: z.iso.datetime(), status: z.literal("needs_review"), review_required: z.literal(true),
  original_candidate: z.object({ burial_place_ids: z.array(z.string()), name_collision: z.boolean() }),
  claims: z.record(z.string(), z.array(z.unknown())),
  flags: z.array(z.string()).min(1), suggested_tags: z.array(z.unknown()),
  burial_reference_urls: z.array(z.string()), linked_entities: z.array(z.unknown()),
  article: z.record(z.string(), z.unknown()).nullable(), image: z.record(z.string(), z.unknown()).nullable(),
});

export function validResearchPacket(value: unknown, candidate: ResearchCandidate) {
  const result = packetSchema.safeParse(value);
  return result.success && result.data.wikidata_id === candidate.wikidata_id
    && result.data.original_candidate.name_collision === candidate.name_collision
    && [...result.data.original_candidate.burial_place_ids].sort().join("|") === [...candidate.burial_place_ids].sort().join("|");
}

export type Snak = { snaktype?: string; datavalue?: { value: unknown } };
export type Statement = {
  id?: string; rank?: string; mainsnak: Snak;
  qualifiers?: Record<string, Snak[]>;
  references?: { snaks: Record<string, Snak[]> }[];
};
export type ResearchEntity = {
  id: string; lastrevid?: number; missing?: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<string, Statement[]>;
};
export type ResearchCandidate = Pick<IngestionCandidate, "wikidata_id" | "name" | "wikipedia_url" | "commons_file"> & {
  burial_place_ids: string[]; name_collision: boolean;
};

export function entityId(snak: Snak): string | null {
  const v = snak.datavalue?.value;
  return v && typeof v === "object" && "id" in v && typeof v.id === "string" ? v.id : null;
}
export function activeStatements(entity: ResearchEntity, property: string) {
  return (entity.claims?.[property] ?? []).filter((s) => s.rank !== "deprecated");
}
export function linkedIds(entity: ResearchEntity) {
  return [...new Set(["P106", "P39", "P119"].flatMap((p) => activeStatements(entity, p).flatMap((s) => entityId(s.mainsnak) ?? [])))];
}

// Exact labels only: no name-based classification and no substring matching
// that could turn a company president or political scientist into a president.
const roleTags: Record<string, string> = {
  "president of the united states": "presidents",
  "politician": "politics", "diplomat": "politics",
  "inventor": "inventors", "scientist": "scientists", "physicist": "scientists",
  "chemist": "scientists", "biologist": "scientists", "astronomer": "scientists",
  "mathematician": "scientists", "computer scientist": "scientists",
  "writer": "writers", "novelist": "writers", "poet": "writers", "journalist": "writers",
  "musician": "music", "singer": "music", "composer": "music", "pianist": "music",
  "guitarist": "music", "drummer": "music", "jazz musician": "music",
  "actor": "entertainment", "film actor": "entertainment", "television actor": "entertainment",
  "comedian": "entertainment", "film director": "entertainment",
  "artist": "artists", "painter": "artists", "sculptor": "artists", "photographer": "artists",
  "businessperson": "business", "entrepreneur": "business", "industrialist": "business",
  "military officer": "military", "soldier": "military", "naval officer": "military",
  "civil rights activist": "civil-rights", "human rights activist": "civil-rights",
  "athlete": "sports", "baseball player": "sports", "basketball player": "sports",
  "american football player": "sports", "association football player": "sports",
  "ice hockey player": "sports", "tennis player": "sports", "golfer": "sports",
  "boxer": "sports", "swimmer": "sports", "coach": "sports",
};

export function suggestTags(entity: ResearchEntity, labels: Record<string, string>) {
  const suggestions: { slug: string; property: string; entity_id: string; label: string; statement_id: string | null; review_required: true }[] = [];
  for (const property of ["P106", "P39"]) {
    for (const s of activeStatements(entity, property)) {
      const id = entityId(s.mainsnak);
      const label = id ? labels[id] : null;
      const slug = label ? roleTags[label.toLowerCase()] : null;
      if (!id || !label || !slug) continue;
      // Presidents must be supported by an office held, not an occupation label.
      if (slug === "presidents" && property !== "P39") continue;
      suggestions.push({ slug, property, entity_id: id, label, statement_id: s.id ?? null, review_required: true });
    }
  }
  return suggestions;
}

export function referenceUrls(statements: Statement[]) {
  const urls = new Set<string>();
  for (const statement of statements) for (const reference of statement.references ?? []) {
    for (const snak of reference.snaks.P854 ?? []) {
      const value = snak.datavalue?.value;
      if (typeof value !== "string") continue;
      try { const u = new URL(value); if (["https:", "http:"].includes(u.protocol)) urls.add(u.href); } catch { /* retained in raw reference */ }
    }
  }
  return [...urls];
}

export function researchFlags(candidate: ResearchCandidate, entity: ResearchEntity) {
  const flags = new Set<string>(["independent_source_review_required"]);
  const burials = activeStatements(entity, "P119");
  const places = [...new Set(burials.flatMap((s) => entityId(s.mainsnak) ?? []))];
  if (!entity.claims || "missing" in entity || entity.id !== candidate.wikidata_id) flags.add("missing_or_changed_entity");
  if (!activeStatements(entity, "P31").some((s) => entityId(s.mainsnak) === "Q5")) flags.add("human_identity_check_required");
  if (candidate.name_collision) flags.add("name_collision");
  if (!entity.labels?.en) flags.add("missing_english_name");
  if (!places.length) flags.add("no_current_burial_value");
  if (places.length > 1) flags.add("multiple_burial_places");
  if (candidate.burial_place_ids.some((id) => !places.includes(id))) flags.add("burial_changed_since_collection");
  if (burials.some((s) => !s.references?.length)) flags.add("burial_without_attached_reference");
  if (!referenceUrls(burials).length) flags.add("no_direct_burial_reference_url");
  if (burials.some((s) => Object.keys(s.qualifiers ?? {}).length)) flags.add("burial_qualifiers_need_review");
  for (const property of ["P569", "P570"]) {
    const dates = activeStatements(entity, property);
    const values = [...new Set(dates.map((s) => JSON.stringify(s.mainsnak.datavalue?.value)))];
    if (!dates.length) flags.add(`${property}_missing`);
    if (values.length > 1) flags.add(`${property}_conflicting_values`);
  }
  return [...flags];
}

export function retryDelay(value: string | null, attempt: number, now = Date.now()) {
  if (value) {
    const parsed = Number.isFinite(Number(value)) ? Number(value) * 1000 : Date.parse(value) - now;
    if (Number.isFinite(parsed)) return Math.max(1000, parsed);
  }
  return 2000 * 2 ** attempt;
}
