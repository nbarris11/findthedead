"use client";
import { useEffect, useRef } from "react";
import type { DiscoveryPerson } from "@/types/database";
import { formatLifespan } from "@/lib/explore/format";

type PersonListSheetProps = {
  people: readonly DiscoveryPerson[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

/** Several burials share one coordinate (cemetery-precision records cluster
 *  even at maximum zoom), so the map hands off to a plain list instead of
 *  spinning forever trying to separate pins that never will. */
export function PersonListSheet({ people, onSelect, onClose }: PersonListSheetProps) {
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
        <h2 id="person-list-title">{people.length} people here</h2>
        <p className="description">
          These burials share one location. Pick a name to see their story.
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
      </section>
    </>
  );
}
