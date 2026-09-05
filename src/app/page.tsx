import type { Metadata } from 'next';
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function Home() {
  return <main id="main">
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><p className="eyebrow"><span className="status-dot" /> A DIFFERENT WAY TO EXPLORE</p><h1 id="hero-title">Find<br />the dead<span>.</span></h1><p className="hero-description">Discover the fascinating people buried around you.</p><p className="hero-detail">The voices. The visionaries. The local legends.<br />Extraordinary lives, closer than you think.</p><a className="button" href="#discovery">Meet the first stories <span aria-hidden="true">↗</span></a><p className="preview-note">Detroit & Southeast Michigan · Early preview</p></div>
      <aside className="editorial-panel" aria-label="Our starting point"><div className="panel-top"><span>FIELD NOTES / 001</span><span aria-hidden="true">↗</span></div><div className="panel-title"><span className="eyebrow">STARTING IN</span><h2>Detroit.</h2><p>A city that changed the world.<br />People worth finding.</p></div><div className="panel-bottom"><span>MUSIC / MOTOR CITY / HISTORY</span><span>MI, USA</span></div></aside>
    </section>
    <section id="discovery" className="discovery" aria-labelledby="discovery-title"><div className="section-heading"><div><p className="eyebrow">THERE’S A STORY NEARBY</p><h2 id="discovery-title">History has an address.</h2></div><span className="section-label">A first look</span></div><div className="story-grid">
      <article className="story-card"><span className="story-number">01 / MUSIC</span><h3>The voices<br />of a city.</h3><p>Discover the people behind the sounds that traveled far beyond Detroit.</p></article>
      <article className="story-card"><span className="story-number">02 / BUSINESS & INVENTION</span><h3>Ideas that<br />moved us.</h3><p>Explore the lives connected to the city’s industrial history.</p></article>
      <article className="story-card"><span className="story-number">03 / HISTORY</span><h3>More than<br />a name.</h3><p>Get to know the people behind familiar places and unexpected stories.</p></article>
    </div></section>
    <section id="about" className="about"><p className="eyebrow">CURIOSITY, WITH RESPECT</p><h2>A little closer to history.</h2><p>FindTheDead is a new way to discover remarkable lives through the places where people rest. We’re starting in Southeast Michigan, with room to explore everywhere.</p><p className="muted">This is the foundation preview. The interactive map and nearby discovery are coming next.</p></section>
  </main>;
}
