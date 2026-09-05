import Link from "next/link";
import type { SearchResult } from "@/lib/search/types";
import { formatLifespan } from "@/lib/explore/format";

/** Switches on the type discriminant so a future cemetery result renders
 *  distinctly from a person one, per docs/PRODUCT.md — only the person
 *  branch is reachable today. */
export function SearchResultCard({ result }: { result: SearchResult }) {
  if (result.type === "cemetery") {
    const { cemetery } = result;
    const location = [cemetery.city, cemetery.state].filter(Boolean).join(", ");
    return (
      <li className="person-card">
        <Link href={`/cemeteries/${cemetery.slug}`} className="person-card-link">
          <div className="person-card-heading">
            <h3>{cemetery.name}</h3>
            <span className="result-type-badge">Cemetery</span>
          </div>
          {location && <p className="person-card-meta">{location}</p>}
        </Link>
      </li>
    );
  }

  const { person } = result;
  return (
    <li className="person-card">
      <Link href={`/people/${person.slug}`} className="person-card-link">
        <div className="person-card-heading">
          <h3>{person.name}</h3>
          <span className="dead-score" aria-label={`Dead Score ${person.dead_score} of 100`}>
            {person.dead_score}
          </span>
        </div>
        <p className="lifespan">
          {formatLifespan(person.birth_year, person.death_year)}
        </p>
        <p className="description">{person.short_description}</p>
        {person.cemetery_name && (
          <p className="person-card-meta">{person.cemetery_name}</p>
        )}
      </Link>
    </li>
  );
}
