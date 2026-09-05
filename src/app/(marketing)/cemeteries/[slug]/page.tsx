import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cemeteryProfile } from "@/lib/data/repository";
import { site } from "@/lib/site";
import { formatLifespan, pluralizePeople } from "@/lib/explore/format";
import { ProfileMap } from "@/components/profile/ProfileMap";
import { ProfileMapFallback } from "@/components/profile/ProfileMapFallback";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const cemetery = await cemeteryProfile(slug).catch(() => null);
  if (!cemetery) return { robots: { index: false, follow: false } };
  const location = [cemetery.city, cemetery.state].filter(Boolean).join(", ");
  return {
    title: cemetery.name,
    description: `${cemetery.name}${location ? `, ${location}` : ""} — ${pluralizePeople(cemetery.people.length)} to discover.`,
    alternates: { canonical: `/cemeteries/${cemetery.slug}` },
    robots: { index: false, follow: false },
  };
}

export default async function CemeteryPage({ params }: PageProps) {
  const { slug } = await params;
  const cemetery = await cemeteryProfile(slug).catch(() => null);
  if (!cemetery) notFound();

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const location = [cemetery.city, cemetery.state].filter(Boolean).join(", ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Cemetery",
    name: cemetery.name,
    ...(cemetery.city && { address: { "@type": "PostalAddress", addressLocality: cemetery.city, addressRegion: cemetery.state ?? undefined } }),
    url: `${site.url}/cemeteries/${cemetery.slug}`,
  };

  return (
    <main id="main" className="profile-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <header className="profile-hero">
          {location && <p className="eyebrow">{location}</p>}
          <h1>{cemetery.name}</h1>
          <p className="hero-description">
            {pluralizePeople(cemetery.people.length)} to discover here.
          </p>
          {cemetery.description && <p>{cemetery.description}</p>}
          {cemetery.categories.length > 0 && (
            <div className="category-chips">
              {cemetery.categories.map((c) => (
                <span key={c.slug} className="filter-chip">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </header>

        <section aria-labelledby="map-heading" className="burial-section">
          <h2 id="map-heading">Map</h2>
          {mapboxToken ? (
            <ProfileMap
              latitude={cemetery.latitude}
              longitude={cemetery.longitude}
              zoom={15}
              accessToken={mapboxToken}
              ariaLabel={`Map showing ${cemetery.name}`}
            />
          ) : (
            <ProfileMapFallback note="Map unavailable: no Mapbox token is configured." />
          )}
          {cemetery.website_url && (
            <p>
              <a href={cemetery.website_url} target="_blank" rel="noreferrer">
                Official website ↗
              </a>
            </p>
          )}
        </section>

        <section aria-labelledby="notable-heading" className="related-section">
          <h2 id="notable-heading">Notable people</h2>
          {cemetery.people.length === 0 ? (
            <p className="muted">No published records yet.</p>
          ) : (
            <ul className="related-list">
              {cemetery.people.map((p) => (
                <li key={p.id}>
                  <Link href={`/people/${p.slug}`}>
                    <span className="list-name">{p.name}</span>
                    <span className="list-meta">
                      {formatLifespan(p.birth_year, p.death_year)} ·{" "}
                      {p.short_description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="sources-heading" className="sources-section">
          <h2 id="sources-heading">Sources</h2>
          {cemetery.sources.length === 0 ? (
            <p className="muted">No sources recorded yet.</p>
          ) : (
            <ul className="source-list">
              {cemetery.sources.map((s, i) => (
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
        </section>
      </article>
    </main>
  );
}
