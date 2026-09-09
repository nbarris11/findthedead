import { z } from "zod";
import { reviewedCandidateSchema } from "./reviewed.ts";

/** Research packets cannot pass this gate. Confirmation is an editorial decision
 * made after source review, not a score or classifier output. */
export const verifiedBatchSchema = z.object({
  reviewer: z.string().min(1),
  reviewed_at: z.iso.datetime(),
  candidates: z.array(reviewedCandidateSchema.refine(
    (p) => !!p.biography && !!p.profile_source_url && !!p.burial_evidence,
    "Bulk release requires an original biography, a profile source, and reviewed burial evidence",
  )).min(1).max(200),
}).superRefine((batch, ctx) => {
  for (const field of ["wikidata_id", "slug"] as const) {
    const values = batch.candidates.map((p) => p[field]);
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: `Duplicate ${field} in batch` });
  }
});
