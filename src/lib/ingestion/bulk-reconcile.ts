import { normalizeAuthorityName } from './authority-match.ts';

export type ReconcileClaim = {
  birth_year: number | null; death_year: number | null;
  birth_date: string | null; death_date: string | null;
  burial_place_wikidata_id: string; burial_place_name: string;
  burial_place_latitude: number; burial_place_longitude: number;
};
export type ReconcileCandidate = {
  wikidata_id: string; name: string; slug: string; wikipedia_url: string | null;
  review_flags: string[]; burial_claims: ReconcileClaim[];
};
export type SourceEvidence = {
  provider: 'arlington' | 'va'; record_id: string; name: string;
  birth_year: number | null; death_year: number | null;
  birth_date: string | null; death_date: string | null;
  cemetery_id: string | null; cemetery_name: string;
  source_url: string; source_sha256: string; snapshot_file: string; retrieved_at: string;
  section: string; grave: string; holds: string[];
};
export type ReconciledLead = {
  candidate_id: string; candidate_name: string; candidate_slug: string;
  identity: 'exact_name_and_lifespan' | 'name_variant_and_lifespan';
  candidate_cemetery_id: string; evidence: SourceEvidence; holds: string[];
};
function lifespan(claim: {birth_year: number | null; death_year: number | null}) {
  return Number.isInteger(claim.birth_year) && Number.isInteger(claim.death_year)
    && claim.birth_year! > 0 && claim.birth_year! <= claim.death_year!
    ? `${claim.birth_year}:${claim.death_year}` : null;
}
function endName(name: string) {
  const parts = normalizeAuthorityName(name).split(' ');
  return parts.length >= 2 ? `${parts[0]}:${parts.at(-1)}` : null;
}
/** Discovery only. Missing middle names/initials are explicit review leads, never approvals. */
export function createReconciler(candidates: ReconcileCandidate[]) {
  const index = new Map<string, ReconcileCandidate[]>();
  for (const candidate of candidates) {
    const lives = new Set(candidate.burial_claims.map(lifespan));
    const name = endName(candidate.name);
    if (!name || lives.size !== 1 || lives.has(null)) continue;
    const key = `${name}:${[...lives][0]}`;
    index.set(key, [...(index.get(key) ?? []), candidate]);
  }
  return (source: SourceEvidence): ReconciledLead[] => {
    const life = lifespan(source), name = endName(source.name);
    if (!life || !name) return [];
    const candidates = index.get(`${name}:${life}`) ?? [];
    return candidates.map(candidate => {
      const claims = candidate.burial_claims;
      const places = [...new Set(claims.map(c => c.burial_place_wikidata_id))];
      const exact = normalizeAuthorityName(candidate.name) === normalizeAuthorityName(source.name);
      const holds = new Set(source.holds);
      if (candidates.length > 1) holds.add('candidate_lifespan_collision');
      if (!exact) holds.add('name_variant_requires_review');
      if (places.length !== 1) holds.add('multiple_candidate_burials');
      if (!source.cemetery_id) holds.add('cemetery_mapping_requires_review');
      else if (!places.includes(source.cemetery_id)) holds.add('cemetery_conflict');
      for (const label of ['birth_date','death_date'] as const) {
        const values = [...new Set(claims.map(c => c[label]).filter(Boolean))];
        if (values.length > 1) holds.add('candidate_date_conflict');
        if (source[label] && values.some(d => d !== source[label])) holds.add(`${label}_conflict`);
      }
      // SPARQL full dates do not encode Wikidata precision. Never approve exact days here.
      holds.add('candidate_date_precision_requires_review');
      holds.add('current_interment_requires_review');
      holds.add('source_independence_requires_review');
      holds.add('editorial_review_required');
      for (const flag of candidate.review_flags) {
        if (!['existing_public_profile','burial_reference_check_pending','name_collision','missing_english_article'].includes(flag)) holds.add(`candidate:${flag}`);
      }
      return {candidate_id:candidate.wikidata_id,candidate_name:candidate.name,candidate_slug:candidate.slug,
        identity:exact?'exact_name_and_lifespan':'name_variant_and_lifespan',
        candidate_cemetery_id:places.length===1?places[0]:'', evidence:source, holds:[...holds].sort()};
    });
  };
}

export function distanceKm(a: [number,number], b: [number,number]) {
  const rad = Math.PI / 180;
  const dlat=(b[1]-a[1])*rad, dlon=(b[0]-a[0])*rad;
  const v=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
/** A candidate cemetery mapping proposal, not an approved source crosswalk. */
export function createCemeteryResolver(candidates: ReconcileCandidate[]) {
  const sites = new Map<string, Map<string, ReconcileClaim>>();
  for (const candidate of candidates) for (const claim of candidate.burial_claims) {
    const name=normalizeAuthorityName(claim.burial_place_name);
    const ids=sites.get(name)??new Map<string,ReconcileClaim>();
    ids.set(claim.burial_place_wikidata_id,claim); sites.set(name,ids);
  }
  return (name:string, coordinates?:[number,number]):string|null => {
    if (!coordinates || !coordinates.every(Number.isFinite)) return null;
    const matches=[...(sites.get(normalizeAuthorityName(name))?.values()??[])].filter(c=>
      Number.isFinite(c.burial_place_longitude)&&Number.isFinite(c.burial_place_latitude)&&
      distanceKm(coordinates,[c.burial_place_longitude,c.burial_place_latitude])<=2);
    return matches.length===1?matches[0].burial_place_wikidata_id:null;
  };
}

export function groupReconciledLeads(leads: ReconciledLead[], publishedIds = new Set<string>()) {
  const byPerson=new Map<string,ReconciledLead[]>();
  for(const lead of leads) byPerson.set(lead.candidate_id,[...(byPerson.get(lead.candidate_id)??[]),lead]);
  return [...byPerson].map(([id,rows])=>{
    const strong=rows.filter(r=>r.identity==='exact_name_and_lifespan'&&r.evidence.cemetery_id===r.candidate_cemetery_id&&
      !r.holds.some(h=>/conflict|collision|multiple_candidate/.test(h)));
    const holds=new Set(rows.flatMap(r=>r.holds));
    for(const provider of ['arlington','va']) {
      const ids=new Set(rows.filter(r=>r.evidence.provider===provider).map(r=>r.evidence.record_id));
      if(ids.size>1) holds.add(`multiple_${provider}_records`);
    }
    return {wikidata_id:id,name:rows[0].candidate_name,slug:rows[0].candidate_slug,
      bucket:publishedIds.has(id)?'already_public':strong.length?'exact_identity_review':rows.some(r=>r.identity==='name_variant_and_lifespan')?'name_variant_review':'conflict_review',
      source_count:new Set(rows.map(r=>r.evidence.provider)).size,
      cemetery_id:rows[0].candidate_cemetery_id,holds:[...holds].sort(),evidence:rows,
      publication_approved:false};
  });
}
