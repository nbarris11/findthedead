"use client";
import { useMemo, useState } from "react";
import {
  DEFAULT_RADIUS_MILES,
  DEFAULT_SORT,
  FALLBACK_ORIGIN,
  RADIUS_OPTIONS_MILES,
  SORT_OPTIONS,
  type RadiusMiles,
  type SortKey,
} from "@/lib/nearby/config";
import { sortNearbyPeople } from "@/lib/nearby/sort";
import { useNearbyResults } from "@/lib/nearby/useNearbyResults";
import { pluralizePeople } from "@/lib/explore/format";
import { useGeolocation } from "@/lib/explore/useGeolocation";
import { PersonCard } from "./PersonCard";

type Origin = { latitude: number; longitude: number; isFallback: boolean };

export function NearbyClient() {
  const { state: geo, locate } = useGeolocation();
  const [manualFallback, setManualFallback] = useState(false);
  const [radius, setRadius] = useState<RadiusMiles>(DEFAULT_RADIUS_MILES);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  // Derived, not stored: geolocation resolving or a manual "browse instead"
  // click are both just inputs to what the current origin is.
  const origin: Origin | null =
    geo.status === "granted"
      ? { latitude: geo.latitude, longitude: geo.longitude, isFallback: false }
      : manualFallback || geo.status === "denied" || geo.status === "unavailable"
        ? { ...FALLBACK_ORIGIN, isFallback: true }
        : null;

  const { people, fetchState } = useNearbyResults(origin, radius);
  const sortedPeople = useMemo(
    () => sortNearbyPeople(people, sort),
    [people, sort],
  );

  if (!origin) {
    return (
      <section className="nearby-gate" aria-labelledby="nearby-gate-title">
        <p className="eyebrow">NEARBY</p>
        <h1 id="nearby-gate-title">Who&rsquo;s resting near you?</h1>
        <p className="hero-description">
          Share your location and we&rsquo;ll surface the interesting dead
          people closest to where you are right now.
        </p>
        <div className="cta-group">
          <button
            type="button"
            className="button"
            onClick={locate}
            disabled={geo.status === "locating"}
          >
            {geo.status === "locating" ? "Locating…" : "Share my location"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setManualFallback(true)}
          >
            Browse Detroit instead
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="nearby-results" aria-labelledby="nearby-results-title">
      <p className="eyebrow">NEARBY</p>
      <h1 id="nearby-results-title">
        {fetchState === "loading" ? "Looking nearby…" : pluralizePeople(sortedPeople.length)}
      </h1>
      {origin.isFallback && (
        <p className="muted">
          {geo.status === "denied"
            ? "Location access was denied, so these results are centered on Detroit — not your actual location."
            : "Showing results centered on Detroit — not your actual location."}{" "}
          <button type="button" className="link-button" onClick={locate}>
            Try sharing your location
          </button>
        </p>
      )}
      <div className="nearby-controls">
        <div className="radius-group" role="group" aria-label="Search radius">
          {RADIUS_OPTIONS_MILES.map((option) => (
            <button
              key={option}
              type="button"
              className="filter-chip"
              aria-pressed={radius === option}
              onClick={() => setRadius(option)}
            >
              {option} mi
            </button>
          ))}
        </div>
        <select
          className="filter-select"
          aria-label="Sort by"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {fetchState === "error" && (
        <p className="muted" role="alert">
          Couldn&rsquo;t load nearby results. Try again in a moment.
        </p>
      )}
      {fetchState !== "error" && sortedPeople.length === 0 && (
        <p className="muted">
          Nothing found within {radius} miles yet. Try a wider radius.
        </p>
      )}
      <ul className="person-card-list">
        {sortedPeople.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </ul>
    </section>
  );
}
