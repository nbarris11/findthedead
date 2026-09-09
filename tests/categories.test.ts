import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database.ts";
import { categoryDefinitions, ensureReviewedCategories, prepareReviewedCategories } from "../src/lib/ingestion/categories.ts";

test("category vocabulary resolves role tags and rejects guesses", () => {
  assert.deepEqual(categoryDefinitions(["presidents", "politics", "presidents"]).map((c) => c.slug), ["presidents", "politics"]);
  assert.throws(() => categoryDefinitions(["made-up"]), /Unknown category/);
  assert.throws(() => categoryDefinitions([]), /At least one/);
});

test("reviewed categories create only selected definitions and preserve existing labels", async () => {
  let written: unknown;
  let options: unknown;
  const db = { from: (table: string) => {
    assert.equal(table, "categories");
    return {
      upsert: async (rows: unknown, opts: unknown) => { written = rows; options = opts; return { error: null }; },
      select: () => ({ in: async () => ({ data: [{ id: "p", slug: "presidents" }], error: null }) }),
    };
  } } as unknown as SupabaseClient<Database>;
  assert.deepEqual(await prepareReviewedCategories(db, ["presidents"]), [{ id: "p", slug: "presidents" }]);
  assert.deepEqual(written, categoryDefinitions(["presidents"]));
  assert.deepEqual(options, { onConflict: "slug", ignoreDuplicates: true });
});

test("tag assignment is additive and rerunnable without duplicate links", async () => {
  const links = new Set(["person:old"]);
  const db = { from: (table: string) => {
    assert.equal(table, "person_categories");
    return { upsert: async (rows: { person_id: string; category_id: string }[], opts: unknown) => {
      assert.deepEqual(opts, { onConflict: "person_id,category_id", ignoreDuplicates: true });
      for (const row of rows) links.add(`${row.person_id}:${row.category_id}`);
      return { error: null };
    } };
  } } as unknown as SupabaseClient<Database>;
  const tags = [{ id: "presidents", slug: "presidents" }, { id: "politics", slug: "politics" }];
  await ensureReviewedCategories(db, "person", tags);
  await ensureReviewedCategories(db, "person", tags);
  assert.deepEqual([...links], ["person:old", "person:presidents", "person:politics"]);
});

test("category write failures stop publication", async () => {
  const db = { from: () => ({ upsert: async () => ({ error: { message: "denied" } }) }) } as unknown as SupabaseClient<Database>;
  await assert.rejects(prepareReviewedCategories(db, ["sports"]), /Could not prepare/);
  await assert.rejects(ensureReviewedCategories(db, "person", [{ id: "sports", slug: "sports" }]), /Could not save/);
});
