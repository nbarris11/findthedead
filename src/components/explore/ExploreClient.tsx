"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CategoryOption, DiscoveryPerson } from "@/types/database";
import type { MapSummary, MapPage } from "@/lib/explore/map-summary";
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
  | { kind: "list"; bounds: Bounds; total: number };

type ExploreClientProps = {
  initialSummary: MapSummary;
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
  initialSummary,
  categories,
  mapboxToken,
}: ExploreClientProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [people, setPeople] = useState<DiscoveryPerson[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [listState, setListState] = useState<"idle" | "loading" | "error">("idle");
  const listAbortRef=useRef<AbortController | null>(null);
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
    fetch(`/api/people/map?${buildQuery(bounds, nextFilters)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json() as Promise<MapSummary>;
      })
      .then((data) => {
        if(controller.signal.aborted)return;
        setSummary(data);
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
    closeSelection();
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

  function closeSelection() {
    listAbortRef.current?.abort();
    setSelection({kind:"none"});
  }
  function loadNames(bounds:Bounds,total:number,after:string|null=null) {
    listAbortRef.current?.abort();
    const controller=new AbortController();listAbortRef.current=controller;
    if(!after){setPeople([]);setNextPage(null);setSelection({kind:"list",bounds,total});}
    setListState("loading");
    const query=new URLSearchParams(buildQuery(bounds,filters));query.set("view","names");if(after)query.set("after",after);
    fetch(`/api/people/map?${query}`,{signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error("Names failed");return r.json() as Promise<MapPage>;})
      .then(data=>{if(controller.signal.aborted)return;setPeople(old=>after?[...old,...data.people]:data.people);setNextPage(data.next);setListState("idle");if(!after&&total===1&&data.people.length===1)setSelection({kind:"person",id:data.people[0].id});})
      .catch(error=>{if(error.name!=="AbortError")setListState("error");});
  }
  useEffect(()=>()=>listAbortRef.current?.abort(),[]);

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
            points={summary.points}
            accessToken={mapboxToken}
            initialView={DEFAULT_VIEW}
            userLocation={userLocation}
            onBoundsChange={onBoundsChange}
            onSelectArea={(bounds,total) => loadNames(bounds,total)}
          />
        ) : (
          <MapFallback people={people} onBrowse={() => loadNames(boundsRef.current,summary.total)} />
        )}
        <FilterBar categories={categories} filters={filters} onChange={onFiltersChange} />
        <p className="visually-hidden" aria-live="polite">
          {fetchState === "loading"
            ? "Updating results"
            : pluralizePeople(summary.total)}
        </p>
        <button
          type="button"
          onClick={() => loadNames(boundsRef.current,summary.total)}
          disabled={summary.total===0}
          aria-label={`Browse ${summary.total.toLocaleString()} people in this map area`}
          className="explore-status"
          data-tone={fetchState === "error" || geo.status === "denied" ? "error" : undefined}
        >
          {fetchState === "error"
            ? "Couldn’t update the map. Try panning again."
            : `Browse names · ${summary.total.toLocaleString()} people`}
          {geo.status === "denied" &&
            " · Location access was denied — enable it in your browser to see distances."}
          {geo.status === "unavailable" &&
            " · Location isn’t available on this device or connection."}
        </button>
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
          onClose={closeSelection}
        />
      )}
      {selection.kind === "list" && (
        <PersonListSheet
          people={people}
          total={selection.total}
          loading={listState === "loading"}
          error={listState === "error"}
          onLoadMore={nextPage ? () => loadNames(selection.bounds,selection.total,nextPage) : undefined}
          onRetry={() => loadNames(selection.bounds,selection.total,people.length?people.at(-1)!.id:null)}
          onSelect={(id) => setSelection({ kind: "person", id })}
          onClose={closeSelection}
        />
      )}
    </div>
  );
}
