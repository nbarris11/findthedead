import { z } from "zod";
export const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const boundsSchema = z
  .object({
    west: z.number().finite().min(-180).max(180),
    east: z.number().finite().min(-180).max(180),
    south: z.number().finite().min(-90).max(90),
    north: z.number().finite().min(-90).max(90),
  })
  .refine((b) => b.south <= b.north, "South must not exceed north");
const queryOptions = {
  min_score: z.number().int().min(0).max(100).default(0),
  category_slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .nullable()
    .default(null),
  result_limit: z.number().int().min(1).max(200).default(100),
};
export const nearbyQuerySchema = coordinatesSchema.extend({
  radius_meters: z.number().finite().min(1).max(160934.4).default(40233.6),
  ...queryOptions,
});
export const boundsQuerySchema = boundsSchema.safeExtend(queryOptions);
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type Bounds = z.infer<typeof boundsSchema>;
