/** Bulk research only. No database access, secret keys, or publication path. */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { WIKIDATA_USER_AGENT } from "../src/lib/ingestion/wikidata.ts";
import { activeStatements, entityId, linkedIds, referenceUrls, researchFlags, retryDelay, suggestTags, validResearchPacket } from "../src/lib/ingestion/research.ts";
import type { ResearchCandidate, ResearchEntity } from "../src/lib/ingestion/research.ts";
import type { IngestionCandidate } from "../src/lib/ingestion/types.ts";

const args = process.argv.slice(2);
const allowed = new Set(["--output", "--limit"]);
for (let i = 0; i < args.length; i += 2) if (!allowed.has(args[i]) || !args[i + 1]) throw new Error("Usage: npm run research:us -- [--limit 200 | 0] [--output directory]");
const option = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = resolve(option("--output", "data/ingestion-runs/us-national"));
const limit = Number(option("--limit", "200"));
if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("--limit must be a nonnegative integer; 0 means all remaining people");
const work = resolve(root, "bulk-research");
mkdirSync(work, { recursive: true });
const lock = resolve(work, "run.lock");
const version = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
function atomic(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${path}.tmp`, path);
}
const file = (kind: string, id: string) => resolve(work, kind, id.slice(-2), `${id}.json`);
type Page = {
  title: string; missing?: boolean; extract?: string;
  revisions?: { revid: number; timestamp?: string }[];
  pageprops?: { wikibase_item?: string; disambiguation?: string };
  imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata?: unknown }[];
};
type ResponseData = {
  error?: { code: string; info?: string }; warnings?: unknown;
  entities?: Record<string, ResearchEntity>;
  continue?: Record<string, string | number>;
  query?: { pages?: Page[]; normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[] };
};
async function api(host: "www.wikidata.org" | "en.wikipedia.org" | "commons.wikimedia.org", params: Record<string, string>) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(300);
    try {
      requests++;
      const response = await fetch(url, { headers: { "User-Agent": WIKIDATA_USER_AGENT }, signal: AbortSignal.timeout(45000) });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 4) throw new Error(`Retries exhausted: ${host} HTTP ${response.status}`);
        await sleep(retryDelay(response.headers.get("retry-after"), attempt)); continue;
      }
      if (!response.ok) throw new Error(`Permanent API error: ${host} HTTP ${response.status}`);
      const data = await response.json() as ResponseData;
      if (data.error) {
        if (["maxlag", "ratelimited", "readonly"].includes(data.error.code) && attempt < 4) {
          await sleep(retryDelay(response.headers.get("retry-after"), attempt)); continue;
        }
        throw new Error(`API error: ${host} ${data.error.code}`);
      }
      return { url, data };
    } catch (error) {
      if (error instanceof Error && /^(Permanent API|API error|Retries exhausted)/.test(error.message)) throw error;
      if (attempt === 4) throw error;
      await sleep(retryDelay(null, attempt));
    }
  }
  throw new Error("API retries exhausted");
}

async function pages(host: "en.wikipedia.org" | "commons.wikimedia.org", titles: string[], params: Record<string, string>) {
  const result = new Map<string, Page>();
  if (!titles.length) return result;
  const aliases = new Map<string, string>();
  let continuation: Record<string, string> = {};
  for (let n = 0; n < 100; n++) {
    const { data } = await api(host, { action: "query", titles: [...new Set(titles)].join("|"), redirects: "1", ...params, ...continuation });
    if (!data.query?.pages) throw new Error(`Missing page response from ${host}`);
    for (const a of [...data.query.normalized ?? [], ...data.query.redirects ?? []]) aliases.set(a.from, a.to);
    for (const p of data.query.pages) result.set(p.title, { ...result.get(p.title), ...p });
    if (!data.continue) {
      for (const title of titles) {
        let canonical = title;
        const seen = new Set<string>();
        while (aliases.has(canonical) && !seen.has(canonical)) { seen.add(canonical); canonical = aliases.get(canonical)!; }
        const page = result.get(canonical);
        if (page) result.set(title, page);
      }
      return result;
    }
    continuation = Object.fromEntries(Object.entries(data.continue).map(([k, v]) => [k, String(v)]));
  }
  throw new Error("Page continuation limit reached; batch is not complete");
}

function candidates() {
  const people = new Map<string, ResearchCandidate>();
  const names = new Map<string, Set<string>>();
  for (const state of readdirSync(root).filter((f) => /^[A-Z]{2}\.json$/.test(f)).sort()) {
    const run = JSON.parse(readFileSync(resolve(root, state), "utf8")) as { candidates: IngestionCandidate[] };
    for (const p of run.candidates) {
      if (!/^Q[1-9]\d*$/.test(p.wikidata_id)) throw new Error("Invalid candidate ID");
      const existing = people.get(p.wikidata_id);
      if (existing) { if (!existing.burial_place_ids.includes(p.burial_place_wikidata_id)) existing.burial_place_ids.push(p.burial_place_wikidata_id); }
      else people.set(p.wikidata_id, { wikidata_id: p.wikidata_id, name: p.name, wikipedia_url: p.wikipedia_url, commons_file: p.commons_file, burial_place_ids: [p.burial_place_wikidata_id], name_collision: false });
      const name = p.name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const ids = names.get(name) ?? new Set<string>(); ids.add(p.wikidata_id); names.set(name, ids);
    }
  }
  for (const ids of names.values()) if (ids.size > 1) for (const id of ids) people.get(id)!.name_collision = true;
  return [...people.values()];
}

async function main() {
  // An existing lock is never removed automatically; overlapping writers are unsafe.
  writeFileSync(lock, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }), { flag: "wx" });
  let completed = 0;
  let cached = 0;
  let total = 0;
  let scheduled = 0;
  const started = Date.now();
  const report = (status: string, error?: string) => atomic(resolve(work, "progress.json"), {
    version, status, pid: process.pid, updated_at: new Date().toISOString(),
    total_candidates: total, packets_before_run: cached, packets_created: completed,
    total_packets: cached + completed, remaining_candidates: total - cached - completed,
    scheduled_this_run: scheduled, api_requests_this_run: requests,
    elapsed_seconds: Math.round((Date.now() - started) / 1000),
    verified_by_this_pipeline: 0, published_by_this_pipeline: 0,
    error: error ?? null,
    note: "Packets are unverified research leads. Attached references and tag suggestions require independent source review.",
  });
  try {
    const all = candidates(); total = all.length;
    const pending = all.filter((p) => {
      const path = file("packets", p.wikidata_id);
      if (!existsSync(path)) return true;
      try { return !validResearchPacket(JSON.parse(readFileSync(path, "utf8")), p); }
      catch { return true; }
    });
    cached = total - pending.length;
    const selected = limit ? pending.slice(0, limit) : pending; scheduled = selected.length;
    const labelsPath = resolve(work, "labels.json");
    const labels: Record<string, string> = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, "utf8")) : {};
    report("running");
    console.log(`Research queue: ${total} people; ${cached} cached; ${scheduled} scheduled. No publishing.`);
    for (let offset = 0; offset < selected.length && !stopping; offset += 20) {
      const batch = selected.slice(offset, offset + 20);
      const entities: Record<string, ResearchEntity> = {};
      const entityTimes: Record<string, string> = {};
      const missing = batch.filter((p) => {
        try {
          const cache = JSON.parse(readFileSync(file("entities", p.wikidata_id), "utf8"));
          if (cache.version !== version || cache.entity?.id !== p.wikidata_id || !Number.isFinite(Date.parse(cache.retrieved_at)) || !cache.entity.claims || !["P31", "P119", "P569", "P570", "P106", "P39", "P18"].every((key) => Array.isArray(cache.entity.claims[key]))) return true;
          entities[p.wikidata_id] = cache.entity;
          entityTimes[p.wikidata_id] = cache.retrieved_at;
          return false;
        } catch { return true; }
      });
      if (missing.length) {
        const { data } = await api("www.wikidata.org", { action: "wbgetentities", ids: missing.map((p) => p.wikidata_id).join("|"), props: "claims|labels|descriptions|sitelinks", languages: "en", sitefilter: "enwiki" });
        if (!data.entities) throw new Error("Missing Wikidata entities response");
        for (const p of missing) {
          const raw = data.entities[p.wikidata_id];
          if (!raw) throw new Error(`Missing response for ${p.wikidata_id}`);
          // Preserve complete statements/references for relevant facts, not every property.
          const entity = { ...raw, claims: Object.fromEntries(["P31", "P119", "P569", "P570", "P106", "P39", "P18"].map((key) => [key, raw.claims?.[key] ?? []])) };
          entities[p.wikidata_id] = entity;
          entityTimes[p.wikidata_id] = new Date().toISOString();
          atomic(file("entities", p.wikidata_id), { version, retrieved_at: entityTimes[p.wikidata_id], entity });
        }
      }
      const needed = [...new Set(Object.values(entities).flatMap(linkedIds))].filter((id) => !(id in labels));
      for (let i = 0; i < needed.length; i += 50) {
        const ids = needed.slice(i, i + 50);
        const { data } = await api("www.wikidata.org", { action: "wbgetentities", ids: ids.join("|"), props: "labels", languages: "en" });
        if (!data.entities) throw new Error("Missing label response");
        for (const id of ids) labels[id] = data.entities[id]?.labels?.en?.value ?? "";
      }
      atomic(labelsPath, labels);
      const titleFor = (p: ResearchCandidate) => entities[p.wikidata_id].sitelinks?.enwiki?.title;
      const imageFor = (p: ResearchCandidate) => {
        const value = activeStatements(entities[p.wikidata_id], "P18")[0]?.mainsnak.datavalue?.value;
        return typeof value === "string" ? `File:${value}` : null;
      };
      const articles = await pages("en.wikipedia.org", batch.flatMap((p) => titleFor(p) ?? []), { prop: "extracts|revisions|pageprops", exintro: "1", explaintext: "1", exlimit: "20", rvprop: "ids|timestamp", ppprop: "wikibase_item|disambiguation" });
      const images = await pages("commons.wikimedia.org", batch.flatMap((p) => imageFor(p) ?? []), { prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "640" });
      for (const p of batch) {
        const entity = entities[p.wikidata_id];
        const article = articles.get(titleFor(p) ?? "");
        const image = images.get(imageFor(p) ?? "")?.imageinfo?.[0];
        const flags = researchFlags(p, entity);
        if (!article || article.missing || !article.extract) flags.push("biography_missing");
        if (article && article.pageprops?.wikibase_item !== p.wikidata_id) flags.push("article_identity_mismatch");
        if (article?.pageprops && "disambiguation" in article.pageprops) flags.push("disambiguation_article");
        if (!image) flags.push("image_missing");
        else flags.push("image_license_review_required");
        const burials = activeStatements(entity, "P119");
        const tags = suggestTags(entity, labels);
        if (!tags.length) flags.push("role_tags_need_research");
        atomic(file("packets", p.wikidata_id), {
          version, wikidata_id: p.wikidata_id, name: entity.labels?.en?.value ?? p.name,
          retrieved_at: new Date().toISOString(), status: "needs_review", review_required: true,
          entity_revision: entity.lastrevid ?? null,
          entity_retrieved_at: entityTimes[p.wikidata_id],
          entity_source: `https://www.wikidata.org/wiki/${p.wikidata_id}`,
          original_candidate: p, claims: entity.claims,
          linked_entities: linkedIds(entity).map((id) => ({ id, label: labels[id] ?? null })),
          burial_reference_urls: referenceUrls(burials),
          burial_places: burials.map((s) => ({ id: entityId(s.mainsnak), label: labels[entityId(s.mainsnak) ?? ""] ?? null })),
          suggested_tags: tags, flags,
          article: article ? { ...article, source_url: article.revisions?.[0] ? `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(article.title)}&oldid=${article.revisions[0].revid}` : null, usage: "Research only; do not copy Wikipedia prose into profiles without complying with its license." } : null,
          image: image ? { ...image, license_review_required: true } : null,
          next_step: "Read cited burial sources, confirm identity and current interment, resolve flags, verify role tags, write original copy; only then create a reviewed publication record.",
        });
        completed++;
      }
      report("running");
      console.log(`Research packets: ${cached + completed}/${total}; ${requests} API requests this run`);
    }
    report(stopping ? "paused" : completed === scheduled ? "complete_for_selected_limit" : "incomplete");
  } catch (error) {
    report("failed", String(error)); throw error;
  } finally { unlinkSync(lock); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
