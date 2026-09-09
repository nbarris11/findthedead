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

function fail(message: string): never {
  throw new Error(`Release guard failed: ${message}`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith("--") || !process.argv.includes("--confirm")) {
    console.error(
      "Usage: npm run release:reviewed -- <path-to-reviewed-run.json> --confirm",
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.DATA_MODE !== "supabase")
    fail("DATA_MODE must be 'supabase'.");

  const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = z.string().min(1).parse(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    .select("id,slug,status,is_fixture")
    .in("slug", slugs);
  if (peopleError) throw new Error("Could not load reviewed people", { cause: peopleError });
  if (people.length !== parsed.length)
    fail(`expected ${parsed.length} people but found ${people.length}.`);
  if (people.some((person) => person.is_fixture))
    fail("the reviewed set unexpectedly includes a fixture.");
  if (people.some((person) => !slugs.includes(person.slug)))
    fail("the database returned a person outside the reviewed set.");

  const personIds = people.map((person) => person.id);
  const { data: burials, error: burialsError } = await db
    .from("burials")
    .select("person_id,cemetery_id")
    .in("person_id", personIds)
    .eq("is_primary", true);
  if (burialsError) throw new Error("Could not load primary burials", { cause: burialsError });
  if (
    burials.length !== people.length ||
    burials.some((burial) => !burial.cemetery_id) ||
    new Set(burials.map((burial) => burial.person_id)).size !== people.length
  )
    fail("every reviewed person must have exactly one primary cemetery burial.");

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
