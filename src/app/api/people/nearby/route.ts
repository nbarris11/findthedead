import { ZodError } from "zod";
import { nearbyPeople } from "@/lib/data/repository";
import { NEARBY_RESULT_LIMIT } from "@/lib/nearby/config";

/** Depends on the visitor's own location; never cached. */
export const dynamic = "force-dynamic";

function readParams(url: URL) {
  const number = (key: string) => {
    const raw = url.searchParams.get(key);
    return raw === null || raw.trim() === "" ? undefined : Number(raw);
  };
  return {
    latitude: number("latitude"),
    longitude: number("longitude"),
    radius_meters: number("radius_meters"),
    result_limit: number("result_limit") ?? NEARBY_RESULT_LIMIT,
  };
}

export async function GET(request: Request) {
  try {
    const people = await nearbyPeople(readParams(new URL(request.url)));
    return Response.json(
      { people },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const isValidation = error instanceof ZodError;
    if (!isValidation) console.error("nearby_people failed", error);
    return Response.json(
      {
        error: isValidation
          ? "That location or radius is not valid."
          : "Nearby records could not be loaded.",
      },
      { status: isValidation ? 400 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
