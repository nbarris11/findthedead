import { z } from "zod";

/** Shared by seed validation, category filters, and profile route params —
 *  one pattern for every place a slug is accepted or generated. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
