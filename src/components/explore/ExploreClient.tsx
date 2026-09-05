"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CategoryOption, DiscoveryPerson } from "@/types/database";
import type { Bounds } from "@/lib/validation/geo";
import { DEFAULT_BOUNDS, DEFAULT_VIEW, NOTABLE_MIN_SCORE } from "@/lib/explore/config";
import { distanceMeters } from "@/lib/geo/distance";
import { pluralizePeople } from "@/lib/explore/format";
import { useGeolocation } from "@/lib/explore/useGeolocation";
import { MapCanvas } from "./MapCanvas";
import { MapFallback } from "./MapFallback";
import { FilterBar, type Filters } from "./FilterBar";
import { PersonSheet } from "./PersonSheet";
import { PersonListSheet } from "./PersonListSheet";

type Selection =
  | { kind: "none" }
  | { kind: "person"; id: string }
  | { kind: "list"; ids: string[] };

type ExploreClientProps = {
  initialPeople: DiscoveryPerson[];
  categories: CategoryOption[];
  mapboxToken: string;
};

function buildQuery(bounds: Bounds, filters: Filters): string {
  const params = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
    min_score: String(filters.notableOnly ? NOTABLE_MIN_SCORE : 0),
  });
  if (filters.categorySlug) params.set("category_slug", filters.categorySlug);
  return params.toString();
}

export function ExploreClient({
  initialPeople,
  categories,
  mapboxToken,
}: ExploreClientProps) {
  const [people, setPeople] = useState(initialPeople);
  const [filters, setFilters] = useState<Filters>({
    categorySlug: null,
    notableOnly: false,
  });
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const boundsRef = useRef<Bounds>(DEFAULT_BOUNDS);
  const abortRef = useRef<AbortController | null>(null);
  const { state: geo, locate } = useGeolocation();

  const userLocation =
    geo.status === "granted"
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  function refetch(bounds: Bounds, nextFilters: Filters) {
    boundsRef.current = bounds;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFetchState("loading");
    fetch(`/api/people/bounds?${buildQuery(bounds, nextFilters)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json() as Promise<{ people: DiscoveryPerson[] }>;
      })
      .then((data) => {
        setPeople(data.people);
        setFetchState("idle");
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setFetchState("error");
      });
  }

  function onBoundsChange(bounds: Bounds) {
    refetch(bounds, filters);
  }

  function onFiltersChange(nextFilters: Filters) {
    setFilters(nextFilters);
    refetch(boundsRef.current, nextFilters);
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedPerson = useMemo(
    () =>
      selection.kind === "person"
        ? people.find((p) => p.id === selection.id) ?? null
        : null,
    [selection, people],
  );

  const selectedList = useMemo(
    () =>
      selection.kind === "list"
        ? people.filter((p) => selection.ids.includes(p.id))
        : [],
    [selection, people],
  );

  const distance =
    selectedPerson && userLocation
      ? distanceMeters(userLocation, selectedPerson)
      : null;

  const hasToken = mapboxToken.length > 0;

  return (
    <div className="explore-shell">
      <div className="explore-topbar">
        <Link className="wordmark" href="/" aria-label="FindTheDead home">
          <span className="brand-symbol" aria-hidden="true">
            ↗
          </span>
          FindTheDead<span className="brand-period">.</span>
        </Link>
        <Link className="explore-back" href="/">
          ← Back
        </Link>
      </div>
      <div className="explore-main">
        {hasToken ? (
          <MapCanvas
            people={people}
            accessToken={mapboxToken}
            initialView={DEFAULT_VIEW}
            userLocation={userLocation}
            onBoundsChange={onBoundsChange}
            onSelectPerson={(id) => setSelection({ kind: "person", id })}
            onSelectMany={(ids) => setSelection({ kind: "list", ids })}
          />
        ) : (
          <MapFallback people={people} />
        )}
        <FilterBar categories={categories} filters={filters} onChange={onFiltersChange} />
        <p className="visually-hidden" aria-live="polite">
          {fetchState === "loading"
            ? "Updating results"
            : pluralizePeople(people.length)}
        </p>
        <p
          className="explore-status"
          data-tone={fetchState === "error" || geo.status === "denied" ? "error" : undefined}
        >
          {fetchState === "error"
            ? "Couldn’t update the map. Try panning again."
            : pluralizePeople(people.length)}
          {geo.status === "denied" &&
            " · Location access was denied — enable it in your browser to see distances."}
          {geo.status === "unavailable" &&
            " · Location isn’t available on this device or connection."}
        </p>
        {hasToken && (
          <button
            type="button"
            className="locate-button"
            onClick={locate}
            disabled={geo.status === "locating"}
          >
            {geo.status === "locating" ? "Locating…" : "Find the dead near me"}
          </button>
        )}
      </div>
      {selectedPerson && (
        <PersonSheet
          person={selectedPerson}
          distanceMeters={distance}
          onClose={() => setSelection({ kind: "none" })}
        />
      )}
      {selection.kind === "list" && (
        <PersonListSheet
          people={selectedList}
          onSelect={(id) => setSelection({ kind: "person", id })}
          onClose={() => setSelection({ kind: "none" })}
        />
      )}
    </div>
  );
}
