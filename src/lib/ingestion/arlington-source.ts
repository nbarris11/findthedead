import { createHash } from "node:crypto";
import type { AuthorityRecord } from "./authority-match.ts";

export const arlingtonAdapterVersion = 1;

// Explicit adapters, not a crawler accepting arbitrary URLs from scraped text.
export const arlingtonSources = [
  { key: "science", title: "Science, Technology & Engineering", path: "Science-Technology-Engineering" },
  { key: "sports", title: "Sports", path: "Sports" },
  { key: "arts", title: "Culture and the Arts", path: "Culture-the-Arts" },
  { key: "medicine", title: "Medicine", path: "Medicine" },
  { key: "supreme-court", title: "U.S. Supreme Court", path: "Supreme-Court" },
  { key: "explorers", title: "Explorers", path: "Explorers" },
] as const;
export const sourceUrl = (path: string) => `https://www.arlingtoncemetery.mil/Explore/Notable-Graves/${path}`;
export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// Only used on bounded, known source markup. Unknown entities are retained and
// flagged instead of silently changing names. Never render this text as HTML.
export function sourceText(html: string) {
  const entities: Record<string, string> = { amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity: string) => {
      if (entity.startsWith("#")) {
        const n = entity.toLowerCase().startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
      }
      return entities[entity.toLowerCase()] ?? all;
    }).replace(/\s+/g, " ").trim();
}

export type ArlingtonRecord = AuthorityRecord & {
  source_text: string;
  grave_reference: string | null;
  suggested_tags: string[];
  review_required: true;
};

export function extractArlington(html: string, source: typeof arlingtonSources[number]): ArlingtonRecord[] {
  if (html.length > 3_000_000) throw new Error("Source exceeds adapter size limit");
  const modules = [...html.matchAll(/<div\b[^>]*id="dnn_ctr(\d+)_ModuleContent"[^>]*>[\s\S]*?<!-- End_Module_\1 -->/g)];
  const matching = modules.filter(([module]) => [...module.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].some((m) => sourceText(m[1]) === source.title));
  if (matching.length !== 1) throw new Error(`Source layout changed: expected one ${source.title} content module`);
  const content = matching[0][0];
  // Each named entry starts with a bold full name inside a paragraph. Unclosed
  // paragraph tags on this site make general paragraph splitting unsafe.
  const starts = [...content.matchAll(/<p\b[^>]*>\s*<strong\b[^>]*>([\s\S]*?)<\/strong>/gi)]
    .filter((entry) => sourceText(entry[1]).length > 0);
  if (!starts.length) throw new Error("No named source entries; refusing empty success");
  const hash = sha256(html);
  return starts.map((start, index) => {
    const entry = content.slice(start.index!, starts[index + 1]?.index ?? content.length);
    // Never let an unrecognized following entry donate its grave or lifespan.
    // This adapter supports one paragraph per person; changed/multi-paragraph
    // layouts are deliberately incomplete and therefore held for review.
    const tail = entry.slice(start[0].length);
    const boundary = tail.search(/<\/?p\b/i);
    const raw = start[0] + (boundary < 0 ? tail : tail.slice(0, boundary));
    const text = sourceText(raw.split(/<hr\b|<h[1-6]\b/i)[0]);
    const name = sourceText(start[1]);
    const afterName = text.slice(name.length);
    const lifespan = afterName.match(/^[^(]{0,100}\((\d{4})\s*[-–—]\s*(\d{4})\)/);
    const graves = [...text.matchAll(/\(Section\s+[^()]+,\s*Grave\s+[^()]+\)/gi)];
    const flags: string[] = [];
    if (!lifespan) flags.push("source_lifespan_unparsed");
    if (graves.length !== 1) flags.push("source_grave_ambiguous_or_missing");
    if (/&(?:#\w+|[a-z]+);/i.test(text)) flags.push("source_entity_unparsed");
    if (/\b(?:cenotaph|memorial|reinterr\w*|disinterr\w*|originally buried|remains (?:were|are) not)\b/i.test(text)) flags.push("burial_history_requires_review");
    // Source page membership is not a role: Doubleday's baseball-invention
    // story is explicitly debunked on the Sports page. No page-wide sports tag.
    const suggested = /,\s*U\.S\. (?:Army|Navy|Marine Corps|Air Force|Coast Guard)\s*\(/.test(afterName) ? ["military"] : [];
    return {
      record_id: `${source.key}:${index + 1}`, name,
      birth_year: lifespan ? Number(lifespan[1]) : null,
      death_year: lifespan ? Number(lifespan[2]) : null,
      cemetery_id: "Q216344", source_url: sourceUrl(source.path), source_sha256: hash,
      burial_kind: graves.length === 1 ? "grave" : "unknown", flags,
      source_text: text, grave_reference: graves.length === 1 ? graves[0][0] : null,
      suggested_tags: suggested, review_required: true,
    };
  });
}
