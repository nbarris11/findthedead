import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

// Controlled vocabulary: role tags are editorial decisions, not name matches.
export const reviewedCategories = [
  { slug: "music", name: "Music", sort_order: 0 },
  { slug: "sports", name: "Sports", sort_order: 1 },
  { slug: "politics", name: "Politics", sort_order: 2 },
  { slug: "business", name: "Business", sort_order: 3 },
  { slug: "inventors", name: "Inventors", sort_order: 4 },
  { slug: "military", name: "Military", sort_order: 5 },
  { slug: "crime", name: "Crime", sort_order: 6 },
  { slug: "entertainment", name: "Entertainment", sort_order: 7 },
  { slug: "history", name: "History", sort_order: 8 },
  { slug: "local-legends", name: "Local Legends", sort_order: 9 },
  { slug: "presidents", name: "Presidents", sort_order: 10 },
  { slug: "writers", name: "Writers", sort_order: 11 },
  { slug: "scientists", name: "Scientists", sort_order: 12 },
  { slug: "artists", name: "Artists", sort_order: 13 },
  { slug: "civil-rights", name: "Civil Rights", sort_order: 14 },
] as const;

export function categoryDefinitions(slugs: readonly string[]) {
  if (!slugs.length) throw new Error("At least one reviewed category is required");
  return [...new Set(slugs)].map((slug) => {
    const category = reviewedCategories.find((c) => c.slug === slug);
    if (!category) throw new Error(`Unknown category slug: ${slug}`);
    return category;
  });
}

/** Create only categories actually used by a reviewed batch. Preserve existing
 * labels and IDs, so this never overwrites production editorial changes. */
export async function prepareReviewedCategories(
  db: SupabaseClient<Database>, slugs: readonly string[],
) {
  const definitions = categoryDefinitions(slugs);
  const { error } = await db.from("categories").upsert(definitions, {
    onConflict: "slug", ignoreDuplicates: true,
  });
  if (error) throw new Error("Could not prepare reviewed categories", { cause: error });
  const { data, error: lookupError } = await db.from("categories")
    .select("id,slug").in("slug", definitions.map((c) => c.slug));
  if (lookupError) throw new Error("Could not verify reviewed categories", { cause: lookupError });
  if (!data || data.length !== definitions.length)
    throw new Error("Reviewed categories are missing from the database");
  return data;
}

/** Add verified tags without deleting any existing editorial assignments. */
export async function ensureReviewedCategories(
  db: SupabaseClient<Database>, personId: string,
  categories: readonly { id: string; slug: string }[],
) {
  const { error } = await db.from("person_categories").upsert(
    categories.map((c) => ({ person_id: personId, category_id: c.id })),
    { onConflict: "person_id,category_id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Could not save reviewed person categories", { cause: error });
}
