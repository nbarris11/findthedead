import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { personProfile, nearbyPeople } from "@/lib/data/repository";
import { site } from "@/lib/site";
import {
  directionsUrl,
  formatDistance,
  formatLifespan,
  formatPrecision,
} from "@/lib/explore/format";
import { ProfileMap } from "@/components/profile/ProfileMap";
import { ProfileMapFallback } from "@/components/profile/ProfileMapFallback";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const person = await personProfile(slug).catch(() => null);
  if (!person) return { robots: { index: false, follow: false } };
  return {
    title: person.name,
    description: person.short_description,
    alternates: { canonical: `/people/${person.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: person.name,
      description: person.short_description,
      type: "profile",
    },
  };
}

export default async function PersonPage({ params }: PageProps) {
  const { slug } = await params;
  const person = await personProfile(slug).catch(() => null);
  if (!person) notFound();

  const isExact = person.location_precision === "exact_grave";
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const nearby = (
    await nearbyPeople({
      latitude: person.latitude,
      longitude: person.longitude,
      radius_meters: 40233.6, // 25 mi
      result_limit: 7,
    }).catch(() => [])
  )
    .filter((p) => p.id !== person.id)
    .slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    description: person.short_description,
    ...(person.birth_date && { birthDate: person.birth_date }),
    ...(person.death_date && { deathDate: person.death_date }),
    ...(person.wikipedia_url && { sameAs: [person.wikipedia_url] }),
    url: `${site.url}/people/${person.slug}`,
  };

  return (
    <main id="main" className="profile-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <header className="profile-hero">
          {person.categories.length > 0 && (
            <p className="eyebrow">{person.categories.join(" · ")}</p>
          )}
          <h1>{person.name}</h1>
          <p className="lifespan">
            {formatLifespan(person.birth_year, person.death_year)}
          </p>
          <p className="hero-description">{person.short_description}</p>
        </header>

        {(person.why_interesting || person.biography) && (
          <section aria-labelledby="story-heading">
            {person.why_interesting && (
              <>
                <h2 id="story-heading">Why they&rsquo;re interesting</h2>
                <p>{person.why_interesting}</p>
              </>
            )}
            {person.biography && (
              <>
                <h2>Biography</h2>
                <p>{person.biography}</p>
              </>
            )}
          </section>
        )}

        <section aria-labelledby="burial-heading" className="burial-section">
          <h2 id="burial-heading">Resting place</h2>
          {person.cemetery ? (
            <p>
              Buried at{" "}
              <Link href={`/cemeteries/${person.cemetery.slug}`}>
                {person.cemetery.name}
              </Link>
              {person.cemetery.city && `, ${person.cemetery.city}`}
              {person.cemetery.state && `, ${person.cemetery.state}`}
            </p>
          ) : (
            <p className="muted">Burial location not recorded.</p>
          )}
          <p className="precision-note">
            {isExact
              ? "Exact grave location, as recorded by our sources."
              : `${formatPrecision(person.location_precision)}. The map below marks the cemetery, not a specific grave.`}
          </p>
          {mapboxToken ? (
            <ProfileMap
              latitude={person.latitude}
              longitude={person.longitude}
              accessToken={mapboxToken}
              ariaLabel={`Map showing ${isExact ? `${person.name}'s grave` : `${person.cemetery?.name ?? "the cemetery"}`}`}
            />
          ) : (
            <ProfileMapFallback note="Map unavailable: no Mapbox token is configured." />
          )}
          <div className="cta-group">
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

        <section aria-labelledby="sources-heading" className="sources-section">
          <h2 id="sources-heading">Sources</h2>
          {person.sources.length === 0 ? (
            <p className="muted">No sources recorded yet.</p>
          ) : (
            <ul className="source-list">
              {person.sources.map((s, i) => (
                <li key={i}>
                  <a
                    className="source-link"
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.field.replaceAll(",", ", ")}
                  </a>{" "}
                  <span className="muted">
                    · retrieved {s.retrieved_at.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {person.wikipedia_url && (
            <p>
              <a href={person.wikipedia_url} target="_blank" rel="noreferrer">
                Wikipedia ↗
              </a>
            </p>
          )}
        </section>

        {nearby.length > 0 && (
          <section aria-labelledby="nearby-heading" className="related-section">
            <h2 id="nearby-heading">Nearby interesting people</h2>
            <ul className="related-list">
              {nearby.map((p) => (
                <li key={p.id}>
                  <Link href={`/people/${p.slug}`}>
                    <span className="list-name">{p.name}</span>
                    <span className="list-meta">
                      {formatLifespan(p.birth_year, p.death_year)} ·{" "}
                      {formatDistance(p.distance_meters)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
