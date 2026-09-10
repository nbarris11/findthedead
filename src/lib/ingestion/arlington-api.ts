import { normalizeAuthorityName } from "./authority-match.ts";

export type ArlingtonApiRecord = {
  ISS_ID: number; DECEDENTINTERMENTID: number; CemeteryId: number; CemeteryName: string;
  PRIMARYFIRSTNAME: string; PRIMARYMIDDLENAME: string; PRIMARYLASTNAME: string; SUFFIX: string;
  DOB: string | null; DOD: string | null; DOI: string | null;
  SECTION: string; CEMETERYSECTION: string; GRAVE: string;
  GRAVEROW?: string; COLUMBARIUMSECTION?: string; COURT?: string; COLUMN?: string; NICHE?: string;
};

/** ISS_ID is the API's supported sort; interments within a person are unordered. */
export function arlingtonOrderGuard() {
  let lastId = -1;
  const seen = new Set<string>();
  return (record: ArlingtonApiRecord) => {
    const key = `${record.ISS_ID}:${record.DECEDENTINTERMENTID}`;
    if (record.ISS_ID < lastId || seen.has(key)) {
      throw new Error("Source order/interment identity repeated or changed; snapshot requires reconciliation");
    }
    seen.add(key);
    lastId = record.ISS_ID;
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected API object");
  return value as Record<string, unknown>;
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Fail closed on envelope/schema drift. Dates are retained verbatim for identity holds. */
export function parseArlingtonPage(value: unknown, expectedStart = 0): { total: number; records: ArlingtonApiRecord[] } {
  if (!integer(expectedStart)) throw new Error("Invalid page start");
  const result = object(object(value).SearchResult);
  if (result.Status !== true || result.ErrorMessage !== "") throw new Error("Arlington API reported failure");
  if (!integer(result.TotalCount) || !Array.isArray(result.Records)) throw new Error("Invalid result count/records");
  const total = result.TotalCount;
  if (expectedStart > total || result.Records.length > total - expectedStart || result.Records.length > 1000
    || (expectedStart < total && result.Records.length === 0)) throw new Error("Inconsistent page bounds");
  const ids = new Set<string>();
  const records = result.Records.map((value): ArlingtonApiRecord => {
    const raw = object(value);
    if (!integer(raw.ISS_ID) || raw.ISS_ID === 0) throw new Error("Invalid ISS_ID");
    if (!integer(raw.DECEDENTINTERMENTID) || raw.DECEDENTINTERMENTID === 0) throw new Error("Invalid interment ID");
    const composite = `${raw.ISS_ID}:${raw.DECEDENTINTERMENTID}`;
    if (ids.has(composite)) throw new Error("Duplicate person/interment ID");
    ids.add(composite);
    if (raw.CemeteryId !== 46 || raw.CemeteryName !== "Arlington National Cemetery") throw new Error("Wrong cemetery");
    const out: Record<string, unknown> = { ISS_ID: raw.ISS_ID, DECEDENTINTERMENTID: raw.DECEDENTINTERMENTID, CemeteryId: 46, CemeteryName: raw.CemeteryName };
    for (const key of ["PRIMARYFIRSTNAME", "PRIMARYMIDDLENAME", "PRIMARYLASTNAME", "SUFFIX", "SECTION", "CEMETERYSECTION", "GRAVE"]) {
      if (typeof raw[key] !== "string") throw new Error(`Missing or invalid ${key}`);
      out[key] = raw[key];
    }
    for (const key of ["DOB", "DOD", "DOI"]) {
      if (raw[key] !== null && typeof raw[key] !== "string") throw new Error(`Missing or invalid ${key}`);
      out[key] = raw[key];
    }
    for (const key of ["GRAVEROW", "COLUMBARIUMSECTION", "COURT", "COLUMN", "NICHE"]) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== "string") throw new Error(`Invalid ${key}`);
        out[key] = raw[key];
      }
    }
    return out as ArlingtonApiRecord;
  });
  return { total, records };
}

function localDate(value: string | null): { date: string | null; year: number | null; problem: string | null } {
  if (value === null || value.trim() === "") return { date: null, year: null, problem: "missing" };
  const input = value.trim();
  if (/^[1-9]\d{3}$/.test(input)) return { date: null, year: Number(input), problem: "year_only" };
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/.exec(input);
  if (match) {
    const [, mm, dd, yyyy, hh, min] = match;
    const year = Number(yyyy), month = Number(mm), day = Number(dd);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
      && (hh === undefined || (Number(hh) < 24 && Number(min) < 60))) {
      return { date: `${yyyy}-${mm}-${dd}`, year, problem: null };
    }
  }
  return { date: null, year: null, problem: "invalid" };
}

/** Identity evidence only: a locator record is not proof of actual remains. */
export function arlingtonIdentity(record: ArlingtonApiRecord) {
  const birth = localDate(record.DOB), death = localDate(record.DOD), interment = localDate(record.DOI);
  const name = [record.PRIMARYFIRSTNAME, record.PRIMARYMIDDLENAME, record.PRIMARYLASTNAME, record.SUFFIX]
    .map(part => part.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
  const flags = ["interment_vs_memorial_unverified"];
  for (const [label, date] of [["birth", birth], ["death", death], ["interment", interment]] as const) {
    if (date.problem) flags.push(`${label}_date_${date.problem}`);
  }
  if (!record.PRIMARYFIRSTNAME.trim() || !record.PRIMARYLASTNAME.trim()) flags.push("incomplete_name");
  if ((birth.year !== null && death.year !== null && birth.year > death.year)
    || (birth.date && death.date && birth.date > death.date)
    || (death.date && interment.date && death.date > interment.date)) flags.push("date_chronology_conflict");
  if (!record.GRAVE.trim() && !record.NICHE?.trim()) flags.push("missing_grave_or_niche");
  return {
    record_id: `arlington:${record.ISS_ID}:${record.DECEDENTINTERMENTID}`, source_record_id: `arlington:${record.ISS_ID}:${record.DECEDENTINTERMENTID}`, name, normalized_name: normalizeAuthorityName(name),
    birth_date: birth.date, birth_year: birth.year, death_date: death.date, death_year: death.year,
    interment_date: interment.date, interment_year: interment.year,
    cemetery_id: "Q216344", burial_kind: "unknown" as const, flags,
  };
}
