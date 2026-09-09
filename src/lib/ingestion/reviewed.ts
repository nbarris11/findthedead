import { z } from "zod";
import { slugSchema } from "../validation/slug.ts";
import { reviewedCategories } from "./categories.ts";

export const reviewedImageSchema = z.object({
  url: z
    .url()
    .refine(
      (value) => new URL(value).hostname === "upload.wikimedia.org",
      "Image must use Wikimedia's upload host",
    ),
  alt_text: z.string().min(1).max(300),
  creator: z.string().min(1).max(500),
  license: z.string().min(1).max(100),
  attribution: z.string().min(1).max(700),
  source_url: z
    .url()
    .refine(
      (value) => new URL(value).hostname === "commons.wikimedia.org",
      "Image source must be a Wikimedia Commons page",
    ),
  source_external_id: z.string().min(1).max(500),
});

/** What a DedupedCandidate from an ingestion run becomes after a human has
 *  actually looked at it. Every field here is something Wikidata cannot
 *  supply and this project will not invent: an editorial description, a
 *  Dead Score, and confirmed category assignment. `confirmed` must be
 *  explicitly true so a run file can never be fed into publishing by
 *  accident — it is not a default a reviewer forgets to flip. */
export const reviewedCandidateSchema = z
  .object({
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
    burial_place_city: z.string().min(1).max(200).optional(),
    burial_place_state: z.string().min(1).max(200).optional(),
    burial_evidence: z.object({
      url: z.url().refine((s) => s.startsWith("https://"), "Must be HTTPS"),
      source_type: z.enum(["official", "historical"]),
      reviewed_at: z.iso.datetime(),
      notes: z.string().min(30).max(1500),
    }).optional(),
    short_description: z.string().min(1).max(500),
    // An original, paraphrased biography paragraph and editorial hook —
    // optional because a reviewer may confirm a candidate before writing
    // these, same as the original seed shipped with both null. When present,
    // biography needs profile_source_url: the person's own article, distinct
    // from burial_place's Wikidata/Wikipedia listing.
    biography: z.string().min(50).max(2000).nullable().optional(),
    why_interesting: z.string().min(1).max(300).nullable().optional(),
    profile_source_url: z
      .url()
      .refine((s) => s.startsWith("https://"), "Must be HTTPS")
      .nullable()
      .optional(),
    profile_source_type: z.enum(["wikipedia", "official", "historical"]).optional(),
    categories: z.array(slugSchema.refine(
      (slug) => reviewedCategories.some((category) => category.slug === slug),
      "Unknown reviewed category",
    )).min(1).refine((slugs) => new Set(slugs).size === slugs.length, "Duplicate categories"),
    dead_score: z.number().int().min(0).max(100),
    image: reviewedImageSchema.nullable().optional(),
    confirmed: z.literal(true),
  })
  .refine(
    (c) => !c.biography || !!c.profile_source_url,
    "biography requires a profile_source_url",
  );
export type ReviewedCandidate = z.infer<typeof reviewedCandidateSchema>;
