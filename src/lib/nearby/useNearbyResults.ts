"use client";
import { useEffect, useState } from "react";
import type { NearbyPerson } from "../../types/database";
import { radiusMilesToMeters, type RadiusMiles } from "./config";

export type Origin = { latitude: number; longitude: number };
export type FetchState = "idle" | "loading" | "error";

type Key = { latitude: number; longitude: number; radius: RadiusMiles };
type Settled = Key & { status: "idle"; people: NearbyPerson[] };
type Errored = Key & { status: "error" };

function sameKey(a: Key, b: Key): boolean {
  return (
    a.latitude === b.latitude && a.longitude === b.longitude && a.radius === b.radius
  );
}

/** Owns the one effect that talks to /api/people/nearby. Rather than an
 *  imperative setState(true) for "loading" at the top of the effect, this
 *  keeps only the last settled/errored request and compares its key against
 *  the current (origin, radius) during render — every setState call here
 *  lives inside the fetch's own callbacks, and a stale response can never
 *  overwrite a newer request's result. The previous list stays on screen
 *  while a new radius/location is loading instead of flashing empty. */
export function useNearbyResults(origin: Origin | null, radius: RadiusMiles) {
  const [last, setLast] = useState<Settled | Errored | null>(null);

  useEffect(() => {
    if (!origin) return;
    const key: Key = { latitude: origin.latitude, longitude: origin.longitude, radius };
    const controller = new AbortController();
    const params = new URLSearchParams({
      latitude: String(origin.latitude),
      longitude: String(origin.longitude),
      radius_meters: String(radiusMilesToMeters(radius)),
    });
    fetch(`/api/people/nearby?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json() as Promise<{ people: NearbyPerson[] }>;
      })
      .then((data) => setLast({ ...key, status: "idle", people: data.people }))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setLast({ ...key, status: "error" });
      });
    return () => controller.abort();
    // origin's identity changes every render; latitude/longitude are the
    // actual values that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.latitude, origin?.longitude, radius]);

  const currentKey = origin && { latitude: origin.latitude, longitude: origin.longitude, radius };
  const matchesCurrent = !!currentKey && !!last && sameKey(last, currentKey);
  const fetchState: FetchState = !currentKey
    ? "idle"
    : matchesCurrent
      ? last.status
      : "loading";
  const people = last?.status === "idle" ? last.people : [];

  return { people, fetchState };
}
