import { z } from "zod";
import { slugSchema } from "../validation/slug.ts";

/** What a DedupedCandidate from an ingestion run becomes after a human has
 *  actually looked at it. Every field here is something Wikidata cannot
 *  supply and this project will not invent: an editorial description, a
 *  Dead Score, and confirmed category assignment. `confirmed` must be
 *  explicitly true so a run file can never be fed into publishing by
 *  accident — it is not a default a reviewer forgets to flip. */
export const reviewedCandidateSchema = z.object({
  wikidata_id: z.string().regex(/^Q[1-9][0-9]*$/),
  slug: slugSchema,
  name: z.string().min(1).max(200),
  birth_date: z.iso.date().nullable(),
  birth_year: z.number().int().nullable(),
  death_date: z.iso.date().nullable(),
  death_year: z.number().int().nullable(),
  wikipedia_url: z
    .url()
    .refine((s) => s.startsWith("https://"), "Must be HTTPS")
    .nullable(),
  burial_place_wikidata_id: z.string().regex(/^Q[1-9][0-9]*$/),
  burial_place_name: z.string().min(1),
  burial_place_latitude: z.number().min(-90).max(90),
  burial_place_longitude: z.number().min(-180).max(180),
  short_description: z.string().min(1).max(500),
  categories: z.array(slugSchema).min(1),
  dead_score: z.number().int().min(0).max(100),
  confirmed: z.literal(true),
});
export type ReviewedCandidate = z.infer<typeof reviewedCandidateSchema>;
