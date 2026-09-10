import Link from "next/link";
import type { NearbyPerson } from "@/types/database";
import { formatDistance, formatLifespan } from "@/lib/explore/format";

/** No image pipeline is wired into discovery reads yet (see docs/DATABASE.md)
 *  and the seed data has none, so the card is text-only rather than showing
 *  a placeholder avatar for a real, named person. */
export function PersonCard({ person }: { person: NearbyPerson }) {
  return (
    <li className="person-card">
      <Link href={`/people/${person.slug}`} className="person-card-link">
        <div className="person-card-heading">
          <h3>{person.name}</h3>
          {(person.profile_tier === "cemetery_record" || person.profile_tier === "wikidata_listing") ? (
            <span className="result-type-badge">{person.profile_tier === "wikidata_listing" ? "Wikidata listing" : "Cemetery record"}</span>
          ) : <span className="dead-score" aria-label={`Dead Score ${person.dead_score} of 100`}>
            {person.dead_score}
          </span>}
        </div>
        <p className="lifespan">
          {formatLifespan(person.birth_year, person.death_year)}
        </p>
        <p className="description">{person.short_description}</p>
        <div className="person-card-meta">
          {person.cemetery_name && <span>{person.cemetery_name}</span>}
          <span>{formatDistance(person.distance_meters)}</span>
        </div>
      </Link>
    </li>
  );
}
