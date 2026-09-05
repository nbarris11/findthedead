import type { DiscoveryPerson } from "@/types/database";
import { formatLifespan } from "@/lib/explore/format";

/** Renders if NEXT_PUBLIC_MAPBOX_TOKEN is unset. The product still has to
 *  work without a map: this is a plain, fully accessible list of the same
 *  records the map would show. See docs/ARCHITECTURE.md. */
export function MapFallback({ people }: { people: readonly DiscoveryPerson[] }) {
  return (
    <div className="map-fallback">
      <p className="fallback-note">
        The interactive map needs a Mapbox access token
        (NEXT_PUBLIC_MAPBOX_TOKEN) that isn’t configured yet. Here are the
        stories that would appear on it.
      </p>
      <ul className="fallback-list">
        {people.map((person) => (
          <li key={person.id}>
            <strong>{person.name}</strong>{" "}
            <span className="muted">
              {formatLifespan(person.birth_year, person.death_year)}
            </span>
            <p className="muted">{person.short_description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
