/** Publish an already-inserted reviewed batch and its linked cemeteries.
 *
 * Usage: npm run release:reviewed -- <path-to-reviewed-run.json> --confirm
 *
 * This is intentionally separate from publish-reviewed-candidates.ts, which
 * only inserts drafts. The command is idempotent so an interrupted release can
 * be rerun safely, but it refuses fixtures, missing relationships, unexpected
 * slugs, or anything outside the supplied reviewed file.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { reviewedCandidateSchema } from "../src/lib/ingestion/reviewed.ts";
import type { Database } from "../src/types/database.ts";
import { assertReviewedContent, assertReviewedCemetery } from "../src/lib/ingestion/release-guards.ts";

function fail(message: string): never {
  throw new Error(`Release guard failed: ${message}`);
}

async function main() {
  const filePath = process.argv[2];
  const checkOnly = process.argv.includes("--check");
  if (!filePath || filePath.startsWith("--") || (!process.argv.includes("--confirm") && !checkOnly) || (checkOnly && process.argv.includes("--confirm"))) {
    console.error(
      "Usage: npm run release:reviewed -- <path-to-reviewed-run.json> --confirm | --check",
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.DATA_MODE !== "supabase")
    fail("DATA_MODE must be 'supabase'.");

  const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = z.string().min(1).parse(
    checkOnly
      ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const parsed = z
    .array(reviewedCandidateSchema)
    .min(1)
    .parse(Array.isArray(raw) ? raw : raw.candidates);
  const slugs = parsed.map((candidate) => candidate.slug);
  if (new Set(slugs).size !== slugs.length)
    fail("the reviewed file contains duplicate slugs.");

  const db = createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: people, error: peopleError } = await db
    .from("people")
    .select("*")
    .in("slug", slugs);
  if (peopleError) throw new Error("Could not load reviewed people", { cause: peopleError });
  if (people.length !== parsed.length)
    fail(`expected ${parsed.length} people but found ${people.length}.`);
  if (people.some((person) => person.is_fixture))
    fail("the reviewed set unexpectedly includes a fixture.");
  if (people.some((person) => !slugs.includes(person.slug)))
    fail("the database returned a person outside the reviewed set.");

  const personIds = people.map((person) => person.id);
  const [{ data: categories, error: categoriesError }, { data: assignments, error: assignmentsError }] =
    await Promise.all([
      db.from("categories").select("id,slug"),
      db.from("person_categories").select("person_id,category_id").in("person_id", personIds),
    ]);
  if (categoriesError || assignmentsError)
    throw new Error("Could not verify reviewed tags", { cause: categoriesError ?? assignmentsError });
  for (const candidate of parsed) {
    const person = people.find((p) => p.slug === candidate.slug)!;
    assertReviewedContent(candidate, person);
    if (person.wikidata_id !== candidate.wikidata_id)
      fail(`identity mismatch for ${candidate.slug}.`);
    for (const slug of candidate.categories) {
      const category = categories.find((c) => c.slug === slug);
      if (!category || !assignments.some((a) => a.person_id === person.id && a.category_id === category.id))
        fail(`${candidate.slug} is missing its reviewed ${slug} tag.`);
    }
  }
  const { data: burials, error: burialsError } = await db
    .from("burials")
    .select("id,person_id,cemetery_id")
    .in("person_id", personIds)
    .eq("is_primary", true);
  if (burialsError) throw new Error("Could not load primary burials", { cause: burialsError });
  if (
    burials.length !== people.length ||
    burials.some((burial) => !burial.cemetery_id) ||
    new Set(burials.map((burial) => burial.person_id)).size !== people.length
  )
    fail("every reviewed person must have exactly one primary cemetery burial.");

  const { data: burialSources, error: burialSourcesError } = await db
    .from("sources").select("burial_id,url,source_type,notes")
    .in("burial_id", burials.map((b) => b.id));
  if (burialSourcesError) throw new Error("Could not verify burial evidence", { cause: burialSourcesError });
  for (const candidate of parsed) {
    if (!candidate.burial_evidence) continue;
    const person = people.find((p) => p.slug === candidate.slug)!;
    const burial = burials.find((b) => b.person_id === person.id)!;
    const evidence = candidate.burial_evidence;
    if (!burialSources.some((s) => s.burial_id === burial.id && s.url === evidence.url && s.source_type === evidence.source_type && s.notes === evidence.notes))
      fail(`${candidate.slug} is missing its reviewed burial evidence.`);
  }

  const cemeteryIds = [
    ...new Set(burials.map((burial) => burial.cemetery_id).filter(Boolean)),
  ] as string[];
  const { data: cemeteries, error: cemeteriesError } = await db
    .from("cemeteries")
    .select("id,status,is_fixture")
    .in("id", cemeteryIds);
  if (cemeteriesError)
    throw new Error("Could not load linked cemeteries", { cause: cemeteriesError });
  if (cemeteries.length !== cemeteryIds.length)
    fail("one or more linked cemeteries are missing.");
  if (cemeteries.some((cemetery) => cemetery.is_fixture))
    fail("the reviewed set unexpectedly links to a fixture cemetery.");

  const { data: cemeterySources, error: cemeterySourcesError } = await db.from("sources")
    .select("cemetery_id,external_id,source_type").in("cemetery_id", cemeteryIds);
  if (cemeterySourcesError) throw new Error("Could not verify cemetery identity", { cause: cemeterySourcesError });
  const { data: profileSources, error: profileSourcesError } = await db.from("sources")
    .select("person_id,url,source_type").in("person_id", personIds);
  if (profileSourcesError) throw new Error("Could not verify biography citations", { cause: profileSourcesError });
  for (const candidate of parsed) {
    const person = people.find((p) => p.slug === candidate.slug)!;
    const burial = burials.find((b) => b.person_id === person.id)!;
    assertReviewedCemetery(candidate, burial.cemetery_id!, cemeterySources);
    if (candidate.profile_source_url && !profileSources.some((s) => s.person_id === person.id && s.url === candidate.profile_source_url && s.source_type === (candidate.profile_source_type ?? "wikipedia")))
      fail(`${candidate.slug} is missing its reviewed biography citation.`);
    if (candidate.image) {
      const { data: image, error: imageError } = await db.from("images").select("*")
        .eq("person_id", person.id).eq("url", candidate.image.url).eq("is_primary", true).maybeSingle();
      if (imageError || !image || ["alt_text", "creator", "license", "attribution"].some((key) => image[key as keyof typeof image] !== candidate.image![key as keyof typeof candidate.image]))
        fail(`${candidate.slug} image does not match reviewed metadata.`);
      const { data: imageSource, error: imageSourceError } = await db.from("sources").select("id")
        .eq("image_id", image.id).eq("url", candidate.image.source_url).eq("source_type", "commons").limit(1).maybeSingle();
      if (imageSourceError || !imageSource) fail(`${candidate.slug} image is missing its Commons citation.`);
    }
  }

  if (checkOnly) {
    console.log(`Read-only release checks passed for ${parsed.length} publicly visible profiles. No database writes.`);
    return;
  }

  const { error: publishCemeteriesError } = await db
    .from("cemeteries")
    .update({ status: "published" })
    .in("id", cemeteryIds);
  if (publishCemeteriesError)
    throw new Error("Could not publish linked cemeteries", {
      cause: publishCemeteriesError,
    });

  const { error: publishPeopleError } = await db
    .from("people")
    .update({ status: "published" })
    .in("id", personIds);
  if (publishPeopleError)
    throw new Error("Could not publish reviewed people", {
      cause: publishPeopleError,
    });

  const [{ data: releasedPeople, error: verifyPeopleError }, { data: releasedCemeteries, error: verifyCemeteriesError }] =
    await Promise.all([
      db.from("people").select("id").in("id", personIds).eq("status", "published"),
      db
        .from("cemeteries")
        .select("id")
        .in("id", cemeteryIds)
        .eq("status", "published"),
    ]);
  if (verifyPeopleError || verifyCemeteriesError)
    throw new Error("Could not verify the release", {
      cause: verifyPeopleError ?? verifyCemeteriesError,
    });
  if (
    releasedPeople.length !== people.length ||
    releasedCemeteries.length !== cemeteries.length
  )
    fail("post-release verification did not match the reviewed set.");

  console.log(
    `Released ${releasedPeople.length} people and ${releasedCemeteries.length} linked cemeteries.`,
  );
}

main().catch((error) => {
  console.error("Reviewed release failed:", error);
  process.exitCode = 1;
});
