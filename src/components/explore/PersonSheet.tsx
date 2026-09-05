"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { DiscoveryPerson } from "@/types/database";
import {
  directionsUrl,
  formatDistance,
  formatLifespan,
  formatPrecision,
} from "@/lib/explore/format";

type PersonSheetProps = {
  person: DiscoveryPerson;
  distanceMeters: number | null;
  onClose: () => void;
};

/** A single person's detail. Mounted from the map (a marker tap) or from a
 *  cluster's leaf list, so it never assumes how the visitor arrived. */
export function PersonSheet({ person, distanceMeters, onClose }: PersonSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isExact = person.location_precision === "exact_grave";

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section
        className="person-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-sheet-title"
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
        <h2 id="person-sheet-title">{person.name}</h2>
        <p className="lifespan">
          {formatLifespan(person.birth_year, person.death_year)}
        </p>
        <p className="description">{person.short_description}</p>
        <dl className="meta-list">
          {person.cemetery_name && (
            <div>
              <strong>Buried at </strong>
              {person.cemetery_name}
            </div>
          )}
          <div>
            <strong>{distanceMeters === null ? "Distance " : ""}</strong>
            {distanceMeters === null
              ? "Share your location to see distance"
              : formatDistance(distanceMeters)}
          </div>
        </dl>
        <p className="precision-note">
          {isExact
            ? "Exact grave location, as recorded by our sources."
            : `${formatPrecision(person.location_precision)}. This pin marks the cemetery, not a specific grave.`}
        </p>
        <div className="sheet-actions">
          <Link className="button" href={`/people/${person.slug}`}>
            View profile <span aria-hidden="true">↗</span>
          </Link>
          <a
            className="button-secondary"
            href={directionsUrl(person)}
            target="_blank"
            rel="noreferrer"
          >
            Directions {isExact ? "to grave" : "to cemetery"}
          </a>
        </div>
      </section>
    </>
  );
}
