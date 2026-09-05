"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="about">
      <h1 style={{ fontSize: "3rem" }}>Stories unavailable.</h1>
      <p>We couldn’t load the stories right now. Please try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
