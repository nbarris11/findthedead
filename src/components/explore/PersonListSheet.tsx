"use client";
import { useEffect, useRef } from "react";
import type { DiscoveryPerson } from "@/types/database";
import { formatLifespan } from "@/lib/explore/format";

type PersonListSheetProps = {
  people: readonly DiscoveryPerson[];
  total: number;
  loading: boolean;
  error: boolean;
  onLoadMore?: () => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
};

/** Several burials share one coordinate (cemetery-precision records cluster
 *  even at maximum zoom), so the map hands off to a plain list instead of
 *  spinning forever trying to separate pins that never will. */
export function PersonListSheet({ people, total, loading, error, onLoadMore, onRetry, onSelect, onClose }: PersonListSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section
        className="person-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-list-title"
      >
        <div className="sheet-grabber" />
        <button
          ref={closeButtonRef}
          type="button"
          className="person-sheet-close"
          onClick={onClose}
        >
          Close ✕
        </button>
        <h2 id="person-list-title">{total.toLocaleString()} people here</h2>
        <p className="description">
          These records share one map location. Pick a name to see its details.
        </p>
        <ul className="sheet-list">
          {people.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => onSelect(person.id)}>
                <span className="list-name">{person.name}</span>
                <span className="list-meta">
                  {formatLifespan(person.birth_year, person.death_year)} ·{" "}
                  {person.short_description}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p aria-live="polite">{loading ? "Loading names…" : `${people.length.toLocaleString()} of ${total.toLocaleString()} names`}</p>
        {error && <button className="button-secondary" onClick={onRetry}>Retry loading names</button>}
        {onLoadMore && !error && <button className="button-secondary" disabled={loading} onClick={onLoadMore}>Load more names</button>}
      </section>
    </>
  );
}
