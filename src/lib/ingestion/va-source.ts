/** VA records are retrieval leads only: this snapshot has no explicit memorial flag. */
export const VA_ENDPOINT = "https://www.data.va.gov/resource/3u66-fxug.json";
export const VA_VERSION = 1;
export const VA_FIELDS = ["decedent_id", "d_first_name", "d_mid_name", "d_last_name", "d_suffix", "d_birth_date", "d_death_date", "cem_name", "city", "state", "location_point", "section_id", "row_num", "site_num", "relationship", "last_update_date"] as const;
export type VaRecord = Partial<Record<Exclude<typeof VA_FIELDS[number], "location_point">, string>> & { decedent_id: string; location_point?: { type: "Point"; coordinates: [number, number] } };
export type VaCandidate = { wikidata_id: string; name: string; review_flags: string[]; burial_claims: { birth_year: number | null; death_year: number | null }[] };
export type VaLead = { surname: string; death_years: number[] };
export const VA_HOLDS = ["identity_requires_review", "memorial_status_unknown", "current_interment_requires_review", "cemetery_entity_mapping_required", "snapshot_rows_last_updated_2022_11_08"];

export function vaDate(value: unknown): { year: number; date: string | null; precision: "year" | "day" } | null {
  if (typeof value !== "string") return null;
  if (/^[12]\d{3}$/.test(value)) return { year: Number(value), date: null, precision: "year" };
  const m = /^(\d{2})\/(\d{2})\/([12]\d{3})$/.exec(value);
  if (!m) return null;
  const [, month, day, year] = m;
  const date = `${year}-${month}-${day}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return { year: Number(year), date, precision: "day" };
}

export function chunkVa<T>(items: readonly T[], size = 20): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new Error("VA group size must be 1–20");
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}
export function sqlVa(value: string) { return `'${value.replace(/'/g, "''")}'`; }
export function vaSurname(name: string): string | null {
  // Last-token discovery deliberately does not infer multipart surnames or identities.
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || parts.some((p) => /[,()\d]/.test(p))) return null;
  const last = parts.at(-1)!;
  if (/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(last) || !/^[\p{L}][\p{L}'’\-]+$/u.test(last)) return null;
  return last.toUpperCase();
}
export function planVa(queue: readonly VaCandidate[]) {
  const leads = new Map<string, Set<number>>();
  const held: { wikidata_id: string; reason: string }[] = [];
  for (const c of queue) {
    if (c.review_flags.includes("existing_public_profile")) continue;
    const surname = vaSurname(c.name);
    const years = [...new Set(c.burial_claims.map((b) => b.death_year))];
    if (!surname || years.length !== 1 || !Number.isInteger(years[0]) || years[0]! < 1000 || years[0]! > 2999) {
      held.push({ wikidata_id: c.wikidata_id, reason: !surname ? "surname_not_safely_derived" : "missing_or_conflicting_death_year" }); continue;
    }
    const values = leads.get(surname) ?? new Set<number>(); values.add(years[0]!); leads.set(surname, values);
  }
  const groups: VaLead[][] = []; let pending: VaLead[] = [];
  for (const [surname, values] of [...leads].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const years = [...values].sort((a, b) => a - b);
    // Common surnames are split by disjoint year sets, keeping GET URLs bounded.
    for (let i = 0; i < years.length; i += 50) {
      const lead = { surname, death_years: years.slice(i, i + 50) };
      if (pending.length && (pending.length === 20 || vaQuery([...pending, lead]).length > 7000)) { groups.push(pending); pending = []; }
      pending.push(lead);
    }
  }
  if (pending.length) groups.push(pending);
  return { groups, held };
}
export function vaQuery(group: readonly VaLead[], after = "0", limit = 1000): string {
  if (!group.length || group.length > 20 || !/^\d+$/.test(after) || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid bounded VA query");
  const filters = group.map(({ surname, death_years }) => {
    if (!surname || surname.length > 200 || !death_years.length || death_years.some((y) => !Number.isInteger(y) || y < 1000 || y > 2999)) throw new Error("Invalid VA retrieval lead");
    return `(upper(d_last_name) = ${sqlVa(surname)} AND (${death_years.map((y) => `(d_death_date = '${y}' OR d_death_date like '%/${y}')`).join(" OR ")}))`;
  });
  const u = new URL(VA_ENDPOINT);
  u.searchParams.set("$select", VA_FIELDS.join(","));
  u.searchParams.set("$where", `upper(d_last_name) IN (${group.map((g) => sqlVa(g.surname)).join(",")}) AND (${filters.join(" OR ")}) AND decedent_id > ${after}`);
  u.searchParams.set("$order", "decedent_id ASC"); u.searchParams.set("$limit", String(limit));
  return u.toString();
}
export function parseVaRows(value: unknown): VaRecord[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Unexpected VA page shape");
  return value.map((row) => {
    if (!row || typeof row !== "object" || typeof row.decedent_id !== "string" || !/^\d+$/.test(row.decedent_id)) throw new Error("Invalid VA record ID");
    const safe: Record<string, unknown> = {};
    for (const key of VA_FIELDS) {
      if (row[key] === undefined) continue;
      if (key === "location_point") {
        const p = row[key];
        if (!p || p.type !== "Point" || !Array.isArray(p.coordinates) || p.coordinates.length !== 2 || p.coordinates.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n)) || Math.abs(p.coordinates[0]) > 180 || Math.abs(p.coordinates[1]) > 90) throw new Error("Invalid VA point");
        safe[key] = { type: "Point", coordinates: [...p.coordinates] };
      } else {
        if (typeof row[key] !== "string" || row[key].length > 2000) throw new Error(`Invalid VA field ${key}`);
        safe[key] = row[key];
      }
    }
    return safe as VaRecord;
  });
}
