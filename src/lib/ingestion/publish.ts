import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";
import { slugify } from "./dedupe.ts";
import type { ReviewedCandidate } from "./reviewed.ts";
import { prepareReviewedCategories, ensureReviewedCategories } from "./categories.ts";

export type PublishResult = {
  candidate: ReviewedCandidate;
  personId: string;
  cemeteryId: string;
  outcome: "inserted" | "already_exists";
};

function wikidataEntityUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}

export function reviewedImageSourceRow(
  candidate: ReviewedCandidate,
  imageId: string,
) {
  if (!candidate.image) throw new Error("Reviewed image metadata is required");
  return {
    source_type: "commons" as const,
    url: candidate.image.source_url,
    external_id: candidate.image.source_external_id,
    retrieved_at: new Date().toISOString(),
    field: "image,license,attribution",
    confidence: 1,
    notes: "License and attribution reviewed from the file's Commons metadata.",
    image_id: imageId,
  };
}

export function cemeterySlugForInsert(
  name: string,
  wikidataId: string,
  baseSlugTaken: boolean,
): string {
  const base = slugify(name);
  return baseSlugTaken ? `${base}-${wikidataId.toLowerCase()}` : base;
}

async function ensureReviewedImage(
  db: SupabaseClient<Database>,
  candidate: ReviewedCandidate,
  personId: string,
): Promise<void> {
  if (!candidate.image) return;
  const { data: existingImage, error: findImageError } = await db
    .from("images")
    .select("id")
    .eq("person_id", personId)
    .eq("url", candidate.image.url)
    .limit(1)
    .maybeSingle();
  if (findImageError)
    throw new Error("Could not look up reviewed image", { cause: findImageError });

  let imageId = existingImage?.id;
  if (!imageId) {
    const { data: insertedImage, error: insertImageError } = await db
      .from("images")
      .insert({
        person_id: personId,
        url: candidate.image.url,
        alt_text: candidate.image.alt_text,
        creator: candidate.image.creator,
        license: candidate.image.license,
        attribution: candidate.image.attribution,
        is_primary: true,
      })
      .select("id")
      .single();
    if (insertImageError)
      throw new Error("Could not insert reviewed image", { cause: insertImageError });
    imageId = insertedImage.id;
  }

  const { data: existingSource, error: findSourceError } = await db
    .from("sources")
    .select("id")
    .eq("image_id", imageId)
    .eq("url", candidate.image.source_url)
    .limit(1)
    .maybeSingle();
  if (findSourceError)
    throw new Error("Could not look up image source", { cause: findSourceError });
  if (existingSource) return;

  const { error: insertSourceError } = await db
    .from("sources")
    .insert(reviewedImageSourceRow(candidate, imageId));
  if (insertSourceError)
    throw new Error("Could not insert image source", { cause: insertSourceError });
}

/** Upserts one reviewed candidate as a draft, never a published record —
 *  publication stays a separate, later, human editorial action (see
 *  docs/DATABASE.md). Every insert here is idempotent on slug: running this
 *  twice with the same input does not duplicate rows, matching
 *  build-seed.ts's "on conflict do nothing" convention, just expressed
 *  through the Supabase client instead of generated SQL since this targets
 *  a live project rather than a static seed file. */
export async function publishReviewedCandidate(
  db: SupabaseClient<Database>,
  candidate: ReviewedCandidate,
): Promise<PublishResult> {
  // Validate tags before inserting a person or cemetery. Retried profiles must
  // receive newly reviewed tags too, without duplicating existing links.
  const categories = await prepareReviewedCategories(db, candidate.categories);
  const { data: cemeterySource, error: findSourceError } = await db
    .from("sources")
    .select("cemetery_id")
    .eq("external_id", candidate.burial_place_wikidata_id)
    .not("cemetery_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (findSourceError)
    throw new Error("Could not look up cemetery source", {
      cause: findSourceError,
    });

  let cemeteryId = cemeterySource?.cemetery_id ?? undefined;
  if (!cemeteryId) {
    const baseSlug = slugify(candidate.burial_place_name);
    const { data: slugMatch, error: findSlugError } = await db
      .from("cemeteries")
      .select("id")
      .eq("slug", baseSlug)
      .maybeSingle();
    if (findSlugError)
      throw new Error("Could not check cemetery slug", { cause: findSlugError });
    const cemeterySlug = cemeterySlugForInsert(
      candidate.burial_place_name,
      candidate.burial_place_wikidata_id,
      !!slugMatch,
    );
    const { data: insertedCemetery, error: insertCemeteryError } = await db
      .from("cemeteries")
      .insert({
        slug: cemeterySlug,
        name: candidate.burial_place_name,
        country: "US",
        city: candidate.burial_place_city ?? null,
        state: candidate.burial_place_state ?? null,
        status: "draft",
        is_fixture: false,
      })
      .select("id")
      .single();
    if (insertCemeteryError)
      throw new Error("Could not insert cemetery", { cause: insertCemeteryError });
    cemeteryId = insertedCemetery.id;
    const { error: setLocationError } = await db.rpc("set_cemetery_location", {
      p_cemetery_id: cemeteryId,
      p_longitude: candidate.burial_place_longitude,
      p_latitude: candidate.burial_place_latitude,
    });
    if (setLocationError)
      throw new Error("Could not set cemetery location", { cause: setLocationError });
    const { error: cemeterySourceError } = await db.from("sources").insert({
      source_type: "wikidata",
      url: wikidataEntityUrl(candidate.burial_place_wikidata_id),
      external_id: candidate.burial_place_wikidata_id,
      retrieved_at: new Date().toISOString(),
      field: "name,location",
      confidence: 0.75,
      notes: "Cemetery reference point only; not an entrance or grave.",
      cemetery_id: cemeteryId,
    });
    if (cemeterySourceError)
      throw new Error("Could not insert cemetery source", { cause: cemeterySourceError });
  }

  const { data: existingPerson, error: findPersonError } = await db
    .from("people")
    .select("id,wikidata_id")
    .eq("slug", candidate.slug)
    .maybeSingle();
  if (findPersonError)
    throw new Error("Could not look up person", { cause: findPersonError });
  if (existingPerson) {
    if (existingPerson.wikidata_id !== candidate.wikidata_id)
      throw new Error(`Slug belongs to a different person: ${candidate.slug}`);
    await ensureReviewedCategories(db, existingPerson.id, categories);
    await ensureReviewedImage(db, candidate, existingPerson.id);
    return { candidate, personId: existingPerson.id, cemeteryId, outcome: "already_exists" };
  }

  const { data: person, error: insertPersonError } = await db
    .from("people")
    .insert({
      slug: candidate.slug,
      name: candidate.name,
      birth_date: candidate.birth_date,
      birth_year: candidate.birth_year,
      death_date: candidate.death_date,
      death_year: candidate.death_year,
      wikidata_id: candidate.wikidata_id,
      wikipedia_url: candidate.wikipedia_url,
      short_description: candidate.short_description,
      biography: candidate.biography ?? null,
      why_interesting: candidate.why_interesting ?? null,
      dead_score: candidate.dead_score,
      status: "draft",
      is_fixture: false,
    })
    .select("id")
    .single();
  if (insertPersonError)
    throw new Error("Could not insert person", { cause: insertPersonError });

  const { data: burial, error: insertBurialError } = await db
    .from("burials")
    .insert({
      person_id: person.id,
      cemetery_id: cemeteryId,
      location_precision: "cemetery",
      // Wikidata's "place of burial" is definitionally cemetery-level, never
      // a specific grave, so this is capped below the seed's own 0.75 for
      // reviewed original citations — a human confirmed the person and
      // cemetery, not the precision of the location claim itself.
      location_confidence: 0.6,
      is_primary: true,
    })
    .select("id")
    .single();
  if (insertBurialError)
    throw new Error("Could not insert burial", { cause: insertBurialError });

  const wikidataUrl = wikidataEntityUrl(candidate.wikidata_id);
  const sourceRows = [
    {
      source_type: "wikidata" as const,
      url: wikidataUrl,
      external_id: candidate.wikidata_id,
      retrieved_at: new Date().toISOString(),
      field: "name,birth_date,death_date",
      confidence: 0.75,
      notes: null,
      person_id: person.id,
    },
    ...(candidate.profile_source_url
      ? [
          {
            source_type: candidate.profile_source_type ?? "wikipedia" as const,
            url: candidate.profile_source_url,
            external_id: null,
            retrieved_at: new Date().toISOString(),
            field: "biography,why_interesting,categories",
            confidence: 0.8,
            notes: "Person's biography reviewed for facts and role tags; original editorial summary, not copied prose.",
            person_id: person.id,
          },
        ]
      : []),
    {
      source_type: "wikidata" as const,
      url: wikidataUrl,
      external_id: candidate.wikidata_id,
      retrieved_at: new Date().toISOString(),
      field: "cemetery_id",
      confidence: 0.6,
      notes: "Listed burial; no exact grave coordinate claimed.",
      burial_id: burial.id,
    },
    ...(candidate.burial_evidence ? [{
      source_type: candidate.burial_evidence.source_type,
      url: candidate.burial_evidence.url,
      external_id: null,
      retrieved_at: candidate.burial_evidence.reviewed_at,
      field: "cemetery_id",
      confidence: 0.95,
      notes: candidate.burial_evidence.notes,
      burial_id: burial.id,
    }] : []),
  ];
  const { error: insertSourcesError } = await db.from("sources").insert(sourceRows);
  if (insertSourcesError)
    throw new Error("Could not insert sources", { cause: insertSourcesError });

  await ensureReviewedCategories(db, person.id, categories);

  await ensureReviewedImage(db, candidate, person.id);

  return { candidate, personId: person.id, cemeteryId, outcome: "inserted" };
}
