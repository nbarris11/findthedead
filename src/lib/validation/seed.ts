import { z } from "zod";
import { coordinatesSchema } from "./geo.ts";
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
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
            birth_date: z.null(),
            death_date: z.null(),
            short_description: z.string().min(1).max(500),
            biography: z.null(),
            why_interesting: z.null(),
            dead_score: z.number().int().min(0).max(100),
            categories: z.array(slug).min(1),
            cemetery_id: z.uuid(),
            burial_id: z.uuid(),
            location_precision: z.literal("cemetery"),
            location_confidence: z.number().min(0).max(1),
            source_url: source,
            is_featured: z.boolean(),
          })
          .refine((p) => p.birth_year <= p.death_year, "Death precedes birth"),
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
