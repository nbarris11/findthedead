"use client";
import { useState } from "react";
import { useDebouncedValue } from "@/lib/search/useDebouncedValue";
import { useSearchResults } from "@/lib/search/useSearchResults";
import { pluralizePeople } from "@/lib/explore/format";
import { SearchResultCard } from "./SearchResultCard";
import type { SearchResult } from "@/lib/search/types";

export function SearchClient() {
  const [input, setInput] = useState("");
  const query = useDebouncedValue(input, 300);
  const { people, fetchState } = useSearchResults(query);
  const results: SearchResult[] = people.map((person) => ({
    type: "person",
    person,
  }));
  const trimmed = query.trim();

  return (
    <section className="search-page" aria-labelledby="search-heading">
      <p className="eyebrow">SEARCH</p>
      <h1 id="search-heading">Find someone by name</h1>
      <p className="hero-description">
        Cemetery, city, and occupation search are coming later — this
        searches people by name for now.
      </p>
      <label className="search-field">
        <span className="visually-hidden">Search by name</span>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try “Aretha” or “Rosa Parks”"
          autoFocus
        />
      </label>
      <p className="visually-hidden" aria-live="polite">
        {!trimmed
          ? ""
          : fetchState === "loading"
            ? "Searching"
            : fetchState === "error"
              ? "Search failed"
              : pluralizePeople(results.length) + " found"}
      </p>
      {fetchState === "error" && (
        <p className="muted" role="alert">
          Couldn&rsquo;t search right now. Try again in a moment.
        </p>
      )}
      {trimmed && fetchState !== "error" && results.length === 0 && (
        <p className="muted">No one found matching &ldquo;{trimmed}&rdquo;.</p>
      )}
      {results.length > 0 && (
        <ul className="person-card-list">
          {results.map((result) => (
            <SearchResultCard
              key={`${result.type}-${result.type === "person" ? result.person.id : result.cemetery.id}`}
              result={result}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
