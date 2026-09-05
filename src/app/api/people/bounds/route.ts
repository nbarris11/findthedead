import { ZodError } from "zod";
import { peopleInBounds } from "@/lib/data/repository";
import { MAP_RESULT_LIMIT } from "@/lib/explore/config";

/** Bounds change on every pan, so this is never cached. */
export const dynamic = "force-dynamic";

/** Query strings are strings; the shared Zod schema owns every range check,
 *  so an invalid request never reaches PostGIS. */
function readParams(url: URL) {
  const number = (key: string) => {
    const raw = url.searchParams.get(key);
    return raw === null || raw.trim() === "" ? undefined : Number(raw);
  };
  const category = url.searchParams.get("category_slug");
  return {
    west: number("west"),
    south: number("south"),
    east: number("east"),
    north: number("north"),
    min_score: number("min_score"),
    category_slug: category && category !== "all" ? category : null,
    result_limit: number("result_limit") ?? MAP_RESULT_LIMIT,
  };
}

export async function GET(request: Request) {
  try {
    const people = await peopleInBounds(readParams(new URL(request.url)));
    return Response.json(
      { people },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Validation failures are the visitor's request; anything else is ours.
    const isValidation = error instanceof ZodError;
    if (!isValidation) console.error("people_in_bounds failed", error);
    return Response.json(
      {
        error: isValidation
          ? "Those map bounds are not valid."
          : "Map records could not be loaded.",
      },
      { status: isValidation ? 400 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
