import type { SparqlBinding, SparqlResponse } from "./wikidata.ts";
import type { IngestionCandidate } from "./types.ts";

function qidFromUri(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

/** Wikidata SPARQL doesn't expose date precision directly; a year-precision
 *  item ("just 1942") is returned as a full dateTime defaulted to
 *  January 1st, which is indistinguishable here from a genuinely exact
 *  January 1st date. Treating "-01-01" as imprecise is a heuristic, not a
 *  guarantee — a human reviewing the run should still confirm any date this
 *  keeps, not just the ones it drops. Known limitation; see docs/DATA-SOURCES.md. */
function extractDate(value: string | undefined): { date: string | null; year: number | null } {
  if (!value) return { date: null, year: null };
  const match = value.match(/^(-?\d{4,})-(\d{2})-(\d{2})/);
  if (!match) return { date: null, year: null };
  const [, yearStr, month, day] = match;
  const year = Number(yearStr);
  if (!Number.isFinite(year)) return { date: null, year: null };
  const looksImprecise = month === "01" && day === "01";
  return { date: looksImprecise ? null : `${yearStr}-${month}-${day}`, year };
}

/** Coordinates arrive as a WKT literal: `Point(<lng> <lat>)`. */
function parseWktPoint(value: string | undefined): { latitude: number | null; longitude: number | null } {
  const match = value?.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return { latitude: null, longitude: null };
  return { longitude: Number(match[1]), latitude: Number(match[2]) };
}

/** Commons image links from Wikidata are Special:FilePath redirects; the
 *  filename is the only part worth keeping here since resolving an actual
 *  license and attribution needs a separate Commons API call this proof of
 *  concept does not make (see docs/DATA-SOURCES.md). */
function commonsFilename(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.split("/").pop();
  return raw ? decodeURIComponent(raw) : null;
}

function bindingValue(binding: SparqlBinding, key: string): string | undefined {
  return binding[key]?.value;
}

export function normalizeSparqlResults(
  response: SparqlResponse,
  retrievedAt: string,
  sourceUrl: string,
): IngestionCandidate[] {
  return response.results.bindings.map((binding) => {
    const birth = extractDate(bindingValue(binding, "birth"));
    const death = extractDate(bindingValue(binding, "death"));
    const coords = parseWktPoint(bindingValue(binding, "burialCoord"));
    return {
      wikidata_id: qidFromUri(bindingValue(binding, "person") ?? ""),
      name: bindingValue(binding, "personLabel") ?? "",
      birth_date: birth.date,
      birth_year: birth.year,
      death_date: death.date,
      death_year: death.year,
      wikipedia_url: bindingValue(binding, "article") ?? null,
      commons_file: commonsFilename(bindingValue(binding, "image")),
      burial_place_wikidata_id: qidFromUri(bindingValue(binding, "burialPlace") ?? ""),
      burial_place_name: bindingValue(binding, "burialPlaceLabel") ?? "",
      burial_place_latitude: coords.latitude,
      burial_place_longitude: coords.longitude,
      retrieved_at: retrievedAt,
      source_url: sourceUrl,
    };
  });
}
