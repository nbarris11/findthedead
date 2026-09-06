import type { Metadata } from "next";
import Link from "next/link";
import { featuredPeople } from "@/lib/data/repository";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const preview = await featuredPeople();
  return (
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> A DIFFERENT WAY TO EXPLORE
          </p>
          <h1 id="hero-title">
            Find
            <br />
            the dead<span>.</span>
          </h1>
          <p className="hero-description">
            Discover the fascinating people buried around you.
          </p>
          <p className="hero-detail">
            The voices. The visionaries. The local legends.
            <br />
            Extraordinary lives, closer than you think.
          </p>
          <div className="cta-group">
            <Link className="button" href="/explore">
              Find the dead near me <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button-secondary" href="/explore">
              Explore the map
            </Link>
          </div>
          <p className="preview-note">
            Michigan · New stories added as they’re reviewed
          </p>
        </div>
        <aside className="editorial-panel" aria-label="Our statewide focus">
          <div className="panel-top">
            <span>FIELD NOTES / 001</span>
            <span aria-hidden="true">↗</span>
          </div>
          <div className="panel-title">
            <span className="eyebrow">EXPLORING</span>
            <h2>Michigan.</h2>
            <p>
              A state that changed the world.
              <br />
              People worth finding.
            </p>
          </div>
          <div className="panel-bottom">
            <span>MUSIC / INDUSTRY / HISTORY</span>
            <span>MI, USA</span>
          </div>
        </aside>
      </section>
      <section
        id="discovery"
        className="discovery"
        aria-labelledby="discovery-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">THERE’S A STORY NEARBY</p>
            <h2 id="discovery-title">History has an address.</h2>
          </div>
          <span className="section-label">A first look</span>
        </div>
        {preview.isDemo && (
          <p className="muted">
            Sourced development preview · Publication review pending
          </p>
        )}
        <div className="story-grid">
          {preview.people.map((person, i) => (
            <article className="story-card" key={person.id}>
              <span className="story-number">
                0{i + 1} / {person.birth_year ?? "Unknown"} –{" "}
                {person.death_year ?? "Unknown"}
              </span>
              <h3>{person.name}</h3>
              <p>{person.short_description}</p>
            </article>
          ))}
        </div>
        {!preview.people.length && (
          <p className="muted">
            The first stories are being prepared. Check back soon.
          </p>
        )}
        {preview.isDemo && (
          <p className="preview-note">
            Burial references:{" "}
            <a
              className="source-link"
              href="https://en.wikipedia.org/w/index.php?title=Woodlawn_Cemetery_(Detroit)&amp;oldid=1365624171"
            >
              Woodlawn Cemetery, Detroit — Wikipedia
            </a>
            . Cemetery location only; exact graves are not marked.
          </p>
        )}
      </section>
      <section id="about" className="about">
        <p className="eyebrow">CURIOSITY, WITH RESPECT</p>
        <h2>A little closer to history.</h2>
        <p>
          FindTheDead is a new way to discover remarkable lives through the
          places where people rest. We’re building across Michigan, one
          carefully sourced story at a time.
        </p>
        <p className="muted">
          Explore the statewide map, search by name, or use your location to
          find remarkable people buried nearby.
        </p>
      </section>
    </main>
  );
}
