"use client";
import { useEffect, useState } from "react";
import type { DiscoveryPerson } from "../../types/database";

export type FetchState = "idle" | "loading" | "error";

type Settled = { query: string; status: "idle"; people: DiscoveryPerson[] };
type Errored = { query: string; status: "error" };

/** Same settled-key pattern as useNearbyResults: keeps only the last
 *  settled/errored query and compares it against the current render's
 *  query, rather than an imperative setState(true) for loading at the top
 *  of the effect (which eslint-plugin-react-hooks' set-state-in-effect
 *  rule flags). `query` is expected to already be debounced by the caller. */
export function useSearchResults(query: string) {
  const [last, setLast] = useState<Settled | Errored | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const controller = new AbortController();
    fetch(`/api/people/search?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json() as Promise<{ people: DiscoveryPerson[] }>;
      })
      .then((data) =>
        setLast({ query: trimmed, status: "idle", people: data.people }),
      )
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setLast({ query: trimmed, status: "error" });
      });
    return () => controller.abort();
  }, [query]);

  const trimmed = query.trim();
  const matchesCurrent = !!last && last.query === trimmed;
  const fetchState: FetchState = !trimmed
    ? "idle"
    : matchesCurrent
      ? last.status
      : "loading";
  const people = last?.status === "idle" ? last.people : [];

  return { people, fetchState };
}
