export type AuthorityRecord = {
  record_id: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  cemetery_id: string;
  source_url: string;
  source_sha256: string;
  burial_kind: "grave" | "memorial" | "unknown";
  flags: string[];
};

export type MatchCandidate = {
  wikidata_id: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  burial_place_ids: string[];
  review_flags: string[];
};

export type AuthorityMatch = {
  record_id: string;
  status: "matched" | "held" | "already_public";
  wikidata_id: string | null;
  reasons: string[];
};

// These flags concern missing evidence/enrichment or public state. The authority
// adapter supplies the burial evidence; matching is NOT an editorial release.
const nonBlockingFlags = new Set([
  "existing_public_profile", "independent_source_review_required",
  "burial_reference_check_pending", "burial_claim_without_attached_reference",
  "burial_without_attached_reference", "no_direct_burial_reference_url",
  "missing_english_article", "county_needs_review",
]);

export function normalizeAuthorityName(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/['’‘ʼ.]/gu, "").replace(/\p{P}/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

function validYears(birth: number | null, death: number | null): boolean {
  return birth !== null && death !== null && Number.isInteger(birth)
    && Number.isInteger(death) && birth !== 0 && death !== 0 && birth <= death;
}

function addToIndex<T>(index: Map<string, T[]>, key: string, value: T) {
  const existing = index.get(key);
  if (existing) existing.push(value);
  else index.set(key, [value]);
}

/**
 * Deterministic identity/evidence matching only. The caller must restrict records
 * to vetted authority adapters and deduplicate state candidates by Wikidata ID.
 * No result authorizes publishing, biographies, tags, or precise grave pins.
 */
export function matchAuthorityRecords(
  records: readonly AuthorityRecord[], candidates: readonly MatchCandidate[],
): AuthorityMatch[] {
  const sourceNames = new Map<string, AuthorityRecord[]>();
  const sourceIds = new Map<string, AuthorityRecord[]>();
  const candidateNames = new Map<string, MatchCandidate[]>();
  const candidateIds = new Map<string, MatchCandidate[]>();
  for (const record of records) {
    addToIndex(sourceNames, normalizeAuthorityName(record.name), record);
    addToIndex(sourceIds, record.record_id, record);
  }
  for (const candidate of candidates) {
    addToIndex(candidateNames, normalizeAuthorityName(candidate.name), candidate);
    addToIndex(candidateIds, candidate.wikidata_id, candidate);
  }

  return records.map((record): AuthorityMatch => {
    const reasons = new Set<string>();
    const name = normalizeAuthorityName(record.name);
    if (!name) reasons.add("missing_source_name");
    if (!record.record_id.trim()) reasons.add("missing_source_record_id");
    if ((sourceIds.get(record.record_id)?.length ?? 0) > 1) reasons.add("duplicate_source_record_id");
    if ((sourceNames.get(name)?.length ?? 0) > 1) reasons.add("duplicate_source_name");
    if (!validYears(record.birth_year, record.death_year)) reasons.add("missing_or_invalid_source_years");
    if (record.burial_kind !== "grave") reasons.add(`source_burial_kind_${record.burial_kind}`);
    if (!/^Q[1-9]\d*$/.test(record.cemetery_id)) reasons.add("invalid_source_cemetery_id");
    if (!/^[a-f\d]{64}$/i.test(record.source_sha256)) reasons.add("invalid_source_sha256");
    try {
      const source = new URL(record.source_url);
      if (source.protocol !== "https:" || source.username || source.password) reasons.add("invalid_source_url");
    } catch { reasons.add("invalid_source_url"); }
    for (const flag of record.flags) reasons.add(`source_flag:${flag}`);

    const named = candidateNames.get(name) ?? [];
    const ids = [...new Set(named.map((candidate) => candidate.wikidata_id))];
    if (!ids.length) reasons.add("no_exact_name_candidate");
    if (ids.length > 1) reasons.add("candidate_name_collision");
    // Never select among same-name people using dates or cemetery alone.
    const id = ids.length === 1 ? ids[0] : null;
    const identityRows = id ? candidateIds.get(id) ?? [] : [];
    for (const candidate of identityRows) {
      if (!/^Q[1-9]\d*$/.test(candidate.wikidata_id)) reasons.add("invalid_candidate_id");
      if (normalizeAuthorityName(candidate.name) !== name) reasons.add("conflicting_candidate_names");
      if (!validYears(candidate.birth_year, candidate.death_year)) reasons.add("missing_or_invalid_candidate_years");
      if (candidate.birth_year !== record.birth_year || candidate.death_year !== record.death_year) reasons.add("lifespan_mismatch");
      const cemeteries = [...new Set(candidate.burial_place_ids)];
      if (cemeteries.length !== 1) reasons.add("candidate_burial_not_unique");
      else if (cemeteries[0] !== record.cemetery_id) reasons.add("cemetery_mismatch");
      for (const flag of candidate.review_flags) {
        if (!nonBlockingFlags.has(flag)) reasons.add(`candidate_flag:${flag}`);
      }
    }
    const held = reasons.size > 0;
    const publicProfile = identityRows.some((candidate) => candidate.review_flags.includes("existing_public_profile"));
    return {
      record_id: record.record_id,
      status: held ? "held" : publicProfile ? "already_public" : "matched",
      wikidata_id: id,
      reasons: held ? [...reasons].sort() : [],
    };
  });
}
