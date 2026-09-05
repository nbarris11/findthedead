import type { Metadata } from "next";
import { NearbyClient } from "@/components/nearby/NearbyClient";

export const metadata: Metadata = {
  title: "Nearby",
  alternates: { canonical: "/nearby" },
  robots: { index: false, follow: false },
};

export default function NearbyPage() {
  return (
    <main id="main" className="nearby-page">
      <NearbyClient />
    </main>
  );
}
