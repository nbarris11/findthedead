const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** Wikimedia's User-Agent policy (meta.wikimedia.org/wiki/User-Agent_policy)
 *  requires an identifiable client; an anonymous/default UA risks being
 *  rate-limited or blocked outright. Update the contact detail before this
 *  ever runs against production volume. */
export const WIKIDATA_USER_AGENT =
  "FindTheDead/0.2 (https://findthedead.netlify.app; editorial ingestion)";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

/** Deceased people whose recorded place of burial has coordinates within
 *  `radiusKm` of (latitude, longitude). Bounded by both the radius and
 *  `limit` — this is a proof of concept, not a national importer (see
 *  docs/DATA-SOURCES.md). Occupation is deliberately not fetched: it would
 *  need multi-value aggregation for no current use, since category
 *  assignment is an editorial decision, not derived from Wikidata.
 *  Wikipedia URL and Commons filename come from the same query, so a run
 *  needs exactly one HTTP request regardless of result count. */
export function buildBurialRadiusQuery(
  latitude: number,
  longitude: number,
  radiusKm: number,
  limit: number,
): string {
  // wikibase:around must come before the triples that consume ?burialPlace,
  // not after: Blazegraph's federated geospatial service only binds the
  // variable efficiently when it runs first. Placing it later silently
  // returns zero rows instead of erroring — confirmed against the live
  // endpoint, not assumed from documentation.
  return `SELECT ?person ?personLabel ?birth ?death ?burialPlace ?burialPlaceLabel ?burialCoord ?image ?article WHERE {
  SERVICE wikibase:around {
    ?burialPlace wdt:P625 ?burialCoord.
    bd:serviceParam wikibase:center "Point(${longitude} ${latitude})"^^geo:wktLiteral.
    bd:serviceParam wikibase:radius "${radiusKm}".
  }
  ?person wdt:P31 wd:Q5;
          wdt:P119 ?burialPlace;
          wdt:P570 ?death.
  OPTIONAL { ?person wdt:P569 ?birth. }
  OPTIONAL { ?person wdt:P18 ?image. }
  OPTIONAL {
    ?article schema:about ?person;
             schema:isPartOf <https://en.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}`;
}

export type SparqlBinding = Record<string, { value: string; type: string } | undefined>;
export type SparqlResponse = { results: { bindings: SparqlBinding[] } };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries on 429/5xx with exponential backoff, honoring a Retry-After
 *  header when the endpoint sends one, per Wikidata Query Service's own
 *  documented rate-limiting behavior. `fetchImpl` is injectable so this can
 *  be unit tested without a real network call. */
export async function runSparqlQuery(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SparqlResponse> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": WIKIDATA_USER_AGENT,
      },
    });
    if (response.ok) return (await response.json()) as SparqlResponse;
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_BACKOFF_MS * 2 ** attempt;
      lastError = new Error(
        `Wikidata query failed with ${response.status}; retrying in ${delay}ms`,
      );
      await sleep(delay);
      continue;
    }
    throw new Error(
      `Wikidata query failed with ${response.status}: ${await response.text()}`,
    );
  }
  throw lastError ?? new Error("Wikidata query failed after retries");
}
