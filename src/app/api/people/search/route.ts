import { ZodError } from "zod";
import { searchPeople } from "@/lib/data/repository";

/** Depends on the visitor's own query; never cached. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q === null || q.trim() === "") {
    return Response.json(
      { people: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const people = await searchPeople({ q });
    return Response.json(
      { people },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const isValidation = error instanceof ZodError;
    if (!isValidation) console.error("search_people failed", error);
    return Response.json(
      {
        error: isValidation
          ? "That search isn't valid."
          : "Search results could not be loaded.",
      },
      { status: isValidation ? 400 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
