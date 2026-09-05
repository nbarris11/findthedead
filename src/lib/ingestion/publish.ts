import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";
import { slugify } from "./dedupe.ts";
import type { ReviewedCandidate } from "./reviewed.ts";

export type PublishResult = {
  candidate: ReviewedCandidate;
  personId: string;
  cemeteryId: string;
  outcome: "inserted" | "already_exists";
};

function wikidataEntityUrl(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
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
  const cemeterySlug = slugify(candidate.burial_place_name);

  const { data: existingCemetery, error: findCemeteryError } = await db
    .from("cemeteries")
    .select("id")
    .eq("slug", cemeterySlug)
    .maybeSingle();
  if (findCemeteryError)
    throw new Error("Could not look up cemetery", { cause: findCemeteryError });

  let cemeteryId = existingCemetery?.id;
  if (!cemeteryId) {
    const { data: insertedCemetery, error: insertCemeteryError } = await db
      .from("cemeteries")
      .insert({
        slug: cemeterySlug,
        name: candidate.burial_place_name,
        country: "US",
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
    await db.from("sources").insert({
      source_type: "wikidata",
      url: wikidataEntityUrl(candidate.burial_place_wikidata_id),
      external_id: candidate.burial_place_wikidata_id,
      retrieved_at: new Date().toISOString(),
      field: "name,location",
      confidence: 0.75,
      notes: "Cemetery reference point only; not an entrance or grave.",
      cemetery_id: cemeteryId,
    });
  }

  const { data: existingPerson, error: findPersonError } = await db
    .from("people")
    .select("id")
    .eq("slug", candidate.slug)
    .maybeSingle();
  if (findPersonError)
    throw new Error("Could not look up person", { cause: findPersonError });
  if (existingPerson)
    return { candidate, personId: existingPerson.id, cemeteryId, outcome: "already_exists" };

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
  ];
  const { error: insertSourcesError } = await db.from("sources").insert(sourceRows);
  if (insertSourcesError)
    throw new Error("Could not insert sources", { cause: insertSourcesError });

  const { data: categories, error: categoriesError } = await db
    .from("categories")
    .select("id,slug")
    .in("slug", candidate.categories);
  if (categoriesError)
    throw new Error("Could not look up categories", { cause: categoriesError });
  const missing = candidate.categories.filter(
    (slug) => !categories?.some((c) => c.slug === slug),
  );
  if (missing.length > 0)
    throw new Error(`Unknown category slug(s): ${missing.join(", ")}`);
  const { error: insertCategoriesError } = await db.from("person_categories").insert(
    (categories ?? []).map((c) => ({ person_id: person.id, category_id: c.id })),
  );
  if (insertCategoriesError)
    throw new Error("Could not insert person categories", {
      cause: insertCategoriesError,
    });

  return { candidate, personId: person.id, cemeteryId, outcome: "inserted" };
}
