import { z } from "zod";
import { coordinatesSchema } from "./geo.ts";
import { slugSchema as slug } from "./slug.ts";
const source = z
  .url()
  .refine((s) => s.startsWith("https://"), "Sources must use HTTPS");
export const seedSchema = z
  .object({
    label: z.string().min(1),
    retrieved_at: z.iso.datetime(),
    status: z.literal("draft"),
    is_fixture: z.literal(true),
    categories: z.array(
      z.object({
        id: z.uuid(),
        slug,
        name: z.string(),
        sort_order: z.number().int(),
      }),
    ),
    cemeteries: z.array(
      coordinatesSchema.extend({
        id: z.uuid(),
        slug,
        name: z.string(),
        city: z.string(),
        state: z.string(),
        country: z.string().regex(/^[A-Z]{2}$/),
        source_url: source,
      }),
    ),
    people: z
      .array(
        z
          .object({
            id: z.uuid(),
            slug,
            name: z.string().min(1),
            birth_year: z.number().int(),
            death_year: z.number().int(),
            // A real calendar date, when a reliable source gives one; year-only
            // knowledge (most of the original seed) stays null rather than
            // guessing a month/day. Checked against birth_year below, mirroring
            // the database's own check constraint.
            birth_date: z.iso.date().nullable(),
            death_date: z.null(),
            short_description: z.string().min(1).max(500),
            biography: z.string().min(50).max(2000).nullable(),
            why_interesting: z.string().min(1).max(300).nullable(),
            dead_score: z.number().int().min(0).max(100),
            categories: z.array(slug).min(1),
            cemetery_id: z.uuid(),
            burial_id: z.uuid(),
            location_precision: z.literal("cemetery"),
            location_confidence: z.number().min(0).max(1),
            source_url: source,
            // The person's own Wikipedia article, sourcing birth_date/
            // biography/why_interesting — distinct from source_url, which
            // sources burial membership via the cemetery's own article and
            // may not even mention this person's birthdate.
            profile_source_url: source.nullable(),
            is_featured: z.boolean(),
          })
          .refine((p) => p.birth_year <= p.death_year, "Death precedes birth")
          .refine(
            (p) => p.birth_date === null || p.birth_date.startsWith(String(p.birth_year)),
            "birth_date year must match birth_year",
          )
          .refine(
            (p) => p.biography === null || p.profile_source_url !== null,
            "biography requires a profile_source_url",
          )
          .refine(
            (p) => p.birth_date === null || p.profile_source_url !== null,
            "birth_date requires a profile_source_url",
          ),
      )
      .min(20)
      .max(50),
  })
  .superRefine((seed, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const [name, rows] of Object.entries({
      people: seed.people,
      cemeteries: seed.cemeteries,
      categories: seed.categories,
    })) {
      for (const key of ["id", "slug"] as const)
        if (new Set(rows.map((r) => r[key])).size !== rows.length)
          add(`Duplicate ${name} ${key}`);
    }
    if (
      new Set(seed.people.map((p) => p.burial_id)).size !== seed.people.length
    )
      add("Duplicate burial ID");
    for (const p of seed.people) {
      if (!seed.cemeteries.some((c) => c.id === p.cemetery_id))
        add(`Unknown cemetery for ${p.slug}`);
      if (new Set(p.categories).size !== p.categories.length)
        add(`Duplicate category for ${p.slug}`);
      for (const cat of p.categories)
        if (!seed.categories.some((c) => c.slug === cat))
          add(`Unknown category ${cat}`);
    }
  });
export type Seed = z.infer<typeof seedSchema>;
