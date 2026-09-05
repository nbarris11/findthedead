"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAP_STYLE } from "@/lib/explore/config";

type ProfileMapProps = {
  latitude: number;
  longitude: number;
  zoom?: number;
  accessToken: string;
  ariaLabel: string;
};

/** A single fixed marker, not the discovery map: no clustering, no bounds
 *  callback, no click handling. Still needs its own nested mount div rather
 *  than styling the element Mapbox owns directly — see MapCanvas for why
 *  (mapbox-gl.css ships a same-specificity `position: relative` for the
 *  class it appends to its container) — and its own ResizeObserver, since
 *  Mapbox does not reliably notice the container reaching its final size. */
export function ProfileMap({
  latitude,
  longitude,
  zoom = 14,
  accessToken,
  ariaLabel,
}: ProfileMapProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: mountRef.current,
      style: MAP_STYLE,
      center: [longitude, latitude],
      zoom,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const marker = new mapboxgl.Marker({ color: "#d8f58a" })
      .setLngLat([longitude, latitude])
      .addTo(map);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mountRef.current);
    return () => {
      resizeObserver.disconnect();
      marker.remove();
      map.remove();
    };
  }, [latitude, longitude, zoom, accessToken]);

  return (
    <div className="profile-map" role="application" aria-label={ariaLabel}>
      <div ref={mountRef} className="profile-map-mount" />
    </div>
  );
}
