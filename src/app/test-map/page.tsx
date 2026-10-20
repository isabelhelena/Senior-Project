"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./components/Map"), {
  ssr: false,
  loading: () => <p data-testid="map-loading">Loading Map Dynamic Chunk...</p>,
});

export default function Home() {
  return <Map />;
}
