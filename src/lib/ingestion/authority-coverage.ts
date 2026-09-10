import { normalizeAuthorityName } from "./authority-match.ts";

export type CoverageCandidate = {
  wikidata_id: string; name: string; review_flags: string[];
  burial_claims: {
    birth_year: number | null; death_year: number | null;
    burial_place_wikidata_id: string; burial_place_name: string;
  }[];
};

const coarseNames = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
  "Washington DC", "Washington D.C.", "United States", "United States of America",
].map(normalizeAuthorityName));

export function isCoarseBurialPlace(name: string) {
  return coarseNames.has(normalizeAuthorityName(name).replace(/^state of /, ""));
}

const enrichmentFlags = new Set([
  "burial_reference_check_pending", "burial_claim_without_attached_reference",
  "independent_source_review_required", "burial_without_attached_reference",
  "no_direct_burial_reference_url", "missing_english_article", "county_needs_review",
  "existing_public_profile",
]);
const validYear = (n: number | null) => n !== null && Number.isInteger(n) && n !== 0;
const knownName = (name: string) => Boolean(name.trim()) && !/^Q\d+$/i.test(name.trim());
const unique = <T>(values: T[]) => [...new Set(values)];

export function planAuthorityCoverage(queue: readonly CoverageCandidate[], sampleLimit = 10) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100) throw new Error("Sample limit must be 0–100");
  const people = new Map<string, { names: Set<string>; flags: Set<string>; claims: CoverageCandidate["burial_claims"] }>();
  for (const row of queue) {
    if (!/^Q[1-9]\d*$/.test(row.wikidata_id)) throw new Error("Invalid candidate Wikidata ID");
    const person = people.get(row.wikidata_id) ?? { names: new Set<string>(), flags: new Set<string>(), claims: [] };
    person.names.add(row.name); row.review_flags.forEach((flag) => person.flags.add(flag));
    person.claims.push(...row.burial_claims); people.set(row.wikidata_id, person);
  }
  const names = new Map<string, Set<string>>();
  for (const [id, person] of people) for (const name of person.names) {
    if (!knownName(name)) continue;
    const key = normalizeAuthorityName(name); const ids = names.get(key) ?? new Set<string>();
    ids.add(id); names.set(key, ids);
  }
  const places = new Map<string, { labels: Set<string>; people: Set<string>; claim_rows: number }>();
  const personIssues = new Map<string, string[]>();
  for (const [id, person] of people) {
    const issues = new Set<string>();
    const births = unique(person.claims.map((claim) => claim.birth_year));
    const deaths = unique(person.claims.map((claim) => claim.death_year));
    const burialIds = unique(person.claims.map((claim) => claim.burial_place_wikidata_id));
    if (!births.length || !deaths.length || births.some((n) => !validYear(n)) || deaths.some((n) => !validYear(n))) issues.add("missing_or_invalid_years");
    if (births.length > 1 || deaths.length > 1) issues.add("conflicting_years");
    if (person.claims.some((claim) => claim.birth_year !== null && claim.death_year !== null && claim.birth_year > claim.death_year)) issues.add("reversed_years");
    if (burialIds.length > 1 || person.flags.has("multiple_burial_claims")) issues.add("multiple_burials");
    if (!burialIds.length || burialIds.some((place) => !/^Q[1-9]\d*$/.test(place))) issues.add("missing_or_invalid_burial_place");
    if ([...person.names].some((name) => !knownName(name)) || person.flags.has("missing_english_name")) issues.add("missing_name");
    if (unique([...person.names].map(normalizeAuthorityName)).length > 1) issues.add("conflicting_names");
    if (person.flags.has("name_collision") || [...person.names].some((name) => (names.get(normalizeAuthorityName(name))?.size ?? 0) > 1)) issues.add("name_collision");
    if (person.flags.has("existing_public_profile")) issues.add("existing_public_profile");
    if (person.claims.some((claim) => isCoarseBurialPlace(claim.burial_place_name))) issues.add("coarse_location");
    if (person.claims.some((claim) => !knownName(claim.burial_place_name))) issues.add("missing_place_name");
    for (const flag of person.flags) if (!enrichmentFlags.has(flag)) issues.add(`review_flag:${flag}`);
    personIssues.set(id, [...issues].sort());
    for (const claim of person.claims) {
      const placeId = claim.burial_place_wikidata_id || "__missing__";
      const place = places.get(placeId) ?? { labels: new Set<string>(), people: new Set<string>(), claim_rows: 0 };
      place.labels.add(claim.burial_place_name); place.people.add(id); place.claim_rows++;
      places.set(placeId, place);
    }
  }
  // A disputed label on any state row affects the whole place identity, not
  // only the person whose row happened to carry that label.
  for (const place of places.values()) {
    const labels = [...place.labels]; const issues: string[] = [];
    if (labels.some(isCoarseBurialPlace)) issues.push("coarse_location");
    if (labels.some((name) => !knownName(name))) issues.push("missing_place_name");
    if (unique(labels.filter(knownName).map(normalizeAuthorityName)).length > 1) issues.push("conflicting_place_names");
    for (const id of place.people) personIssues.set(id, unique([...personIssues.get(id)!, ...issues]).sort());
  }
  const readiness = (ids: Iterable<string>) => {
    const counts = { people: 0, missing_or_invalid_years: 0, conflicting_years: 0, reversed_years: 0,
      multiple_burials: 0, name_collision: 0, missing_name: 0, conflicting_names: 0,
      existing_public_profile: 0, coarse_location: 0, missing_place_name: 0, conflicting_place_names: 0,
      missing_or_invalid_burial_place: 0, other_review_flags: 0, structurally_matchable_unpublished: 0 };
    for (const id of ids) {
      const issues = personIssues.get(id)!; counts.people++;
      for (const key of Object.keys(counts) as (keyof typeof counts)[]) if (issues.includes(key)) counts[key]++;
      if (issues.some((issue) => issue.startsWith("review_flag:") && !["review_flag:name_collision", "review_flag:multiple_burial_claims", "review_flag:missing_english_name"].includes(issue))) counts.other_review_flags++;
      if (!issues.length) counts.structurally_matchable_unpublished++;
    }
    return counts;
  };
  const rows = [...places].map(([id, place]) => {
    const labels = [...place.labels].sort(); const flags: string[] = [];
    if (!/^Q[1-9]\d*$/.test(id)) flags.push("invalid_place_id");
    if (labels.some(isCoarseBurialPlace)) flags.push("coarse_location");
    if (labels.some((name) => !knownName(name))) flags.push("missing_place_name");
    if (unique(labels.filter(knownName).map(normalizeAuthorityName)).length > 1) flags.push("conflicting_place_names");
    const ids = [...place.people].sort();
    return { burial_place_id: id, names: labels, classification: flags.length ? "held_place_identity" : "unverified_burial_place",
      flags, unique_people: ids.length, raw_claim_rows: place.claim_rows,
      readiness: readiness(ids), candidate_sample: ids.slice(0, sampleLimit).map((personId) => ({
        wikidata_id: personId, names: [...people.get(personId)!.names].sort(),
        burial_place_ids: unique(people.get(personId)!.claims.map((claim) => claim.burial_place_wikidata_id)).sort(),
        issues: personIssues.get(personId)!,
      })), candidate_sample_truncated: ids.length > sampleLimit,
    };
  }).sort((a, b) => b.unique_people - a.unique_people || a.burial_place_id.localeCompare(b.burial_place_id));
  const priority = rows.filter((row) => !row.flags.length);
  const cumulative = [10, 25, 50, 100].map((top) => {
    const covered = new Set(priority.slice(0, top).flatMap((row) => [...places.get(row.burial_place_id)!.people]));
    return { top_places: top, places_available: Math.min(top, priority.length), unique_people: covered.size,
      percent_of_all_candidates: people.size ? Number((covered.size / people.size * 100).toFixed(2)) : 0,
      readiness: readiness(covered) };
  });
  return { version: 1, note: "Source-discovery planning only. Burial places are NOT verified cemeteries; place labels are not entity-type verification. Counts are candidates, not verified people. Readiness issues overlap. Structurally matchable means complete inputs only, not evidence or publication approval. Public status reflects the saved queue and may be stale.",
    input_rows: queue.length, unique_people: people.size, raw_claim_rows: queue.reduce((sum, row) => sum + row.burial_claims.length, 0),
    burial_places: rows.length, priority_places: priority.length, held_place_identities: rows.length - priority.length,
    readiness: readiness(people.keys()), cumulative_unique_coverage: cumulative,
    source_priority: priority.map((row, index) => ({ rank: index + 1, ...row })), held_places: rows.filter((row) => row.flags.length),
  };
}
