"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
  MAP_STYLE,
} from "@/lib/explore/config";
import { toFeatureCollection, isCoincident } from "@/lib/explore/geojson";
import type { DiscoveryPerson } from "@/types/database";
import type { Bounds } from "@/lib/validation/geo";

const SOURCE_ID = "people";
const UNCLUSTERED_LAYER = "people-unclustered";
const CLUSTER_LAYER = "people-clusters";
const CLUSTER_COUNT_LAYER = "people-cluster-count";

type PersonFeature = mapboxgl.GeoJSONFeature & {
  geometry: GeoJSON.Point;
  properties: { id?: string; cluster_id?: number };
};

/** mapbox-gl's cluster methods are callback-only in its shipped types;
 *  these two wrappers are the only place that awkwardness needs to live. */
function getClusterExpansionZoom(
  source: mapboxgl.GeoJSONSource,
  clusterId: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    source.getClusterExpansionZoom(clusterId, (error, zoom) => {
      if (error || zoom === null || zoom === undefined) reject(error ?? new Error("No expansion zoom"));
      else resolve(zoom);
    });
  });
}

function getClusterLeaves(
  source: mapboxgl.GeoJSONSource,
  clusterId: number,
  limit: number,
): Promise<PersonFeature[]> {
  return new Promise((resolve, reject) => {
    source.getClusterLeaves(clusterId, limit, 0, (error, features) => {
      if (error || !features) reject(error ?? new Error("No cluster leaves"));
      else resolve(features as PersonFeature[]);
    });
  });
}

export type MapCanvasProps = {
  people: readonly DiscoveryPerson[];
  onSelectPerson: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  onBoundsChange: (bounds: Bounds) => void;
  userLocation: { latitude: number; longitude: number } | null;
  initialView: { latitude: number; longitude: number; zoom: number };
  accessToken: string;
};

/** Renders people through Mapbox's native cluster source rather than one
 *  React marker per person: with hundreds of records this stays smooth on
 *  mobile where per-marker DOM nodes would not. */
export function MapCanvas({
  people,
  onSelectPerson,
  onSelectMany,
  onBoundsChange,
  userLocation,
  initialView,
  accessToken,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const flownToRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onSelectPerson, onSelectMany, onBoundsChange });

  // Runs after every render (no dependency array) purely to keep the ref
  // fresh for the map's event handlers, which close over it once on mount.
  useEffect(() => {
    callbacksRef.current = { onSelectPerson, onSelectMany, onBoundsChange };
  });

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [initialView.longitude, initialView.latitude],
      zoom: initialView.zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    const reportBounds = () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const b = map.getBounds();
        if (!b) return;
        callbacksRef.current.onBoundsChange({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        });
      }, 250);
    };

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
      });
      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#d8f58a",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            10,
            24,
            30,
            30,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#101918",
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 13,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
        },
        paint: { "text-color": "#17221b" },
      });
      map.addLayer({
        id: UNCLUSTERED_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#f5f4ec",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#d8f58a",
        },
      });

      map.on("click", CLUSTER_LAYER, async (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, {
          layers: [CLUSTER_LAYER],
        }) as PersonFeature[];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        if (clusterId === undefined || !source) return;
        try {
          const expansionZoom = await getClusterExpansionZoom(source, clusterId);
          if (expansionZoom > map.getZoom() + 0.15) {
            map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: expansionZoom });
            return;
          }
        } catch {
          // Expansion zoom unavailable; fall through to the leaf list below.
        }
        const leaves = await getClusterLeaves(source, clusterId, 200);
        const coords = leaves.map((leaf) => leaf.geometry.coordinates as [number, number]);
        if (!isCoincident(coords) && coords.length > 0) {
          map.easeTo({ center: coords[0], zoom: Math.min(map.getZoom() + 2, 16) });
          return;
        }
        callbacksRef.current.onSelectMany(
          leaves.map((leaf) => leaf.properties?.id).filter((id): id is string => Boolean(id)),
        );
      });
      map.on("click", UNCLUSTERED_LAYER, (e) => {
        // Records with identical (cemetery-precision) coordinates render as
        // one visual dot even past clusterMaxZoom, where Mapbox stops
        // clustering. A tight box query catches every feature under that
        // one dot instead of the single arbitrary one a point query or
        // e.features would return, so nobody visually "under" a pin is
        // silently dropped.
        const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [
          [e.point.x - 4, e.point.y - 4],
          [e.point.x + 4, e.point.y + 4],
        ];
        const ids = Array.from(
          new Set(
            map
              .queryRenderedFeatures(box, { layers: [UNCLUSTERED_LAYER] })
              .map((feature) => feature.properties?.id as string | undefined)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        if (ids.length > 1) callbacksRef.current.onSelectMany(ids);
        else if (ids.length === 1) callbacksRef.current.onSelectPerson(ids[0]);
      });
      for (const layer of [CLUSTER_LAYER, UNCLUSTERED_LAYER]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }

      reportBounds();
    });

    map.on("moveend", reportBounds);

    // The container's real size can settle after Mapbox measures it once
    // at construction (e.g. while the flex layout and mapbox-gl.css are
    // still resolving), leaving the canvas stuck at a stale size. Mapbox
    // does not always catch up to that on its own, so this is explicit.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(moveTimer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Intentionally created once; props flow through refs and imperative updates below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      source?.setData(toFeatureCollection(people));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [people]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    const el = document.createElement("div");
    el.className = "user-location-dot";
    el.setAttribute("aria-hidden", "true");
    userMarkerRef.current?.remove();
    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map);
    const key = `${userLocation.latitude},${userLocation.longitude}`;
    if (flownToRef.current !== key) {
      flownToRef.current = key;
      map.flyTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 12.5 });
    }
  }, [userLocation]);

  return (
    <div
      className="explore-map"
      role="application"
      aria-label="Interactive map of interesting dead people near you"
    >
      {/* mapbox-gl takes ownership of this exact element: it appends its own
       *  "mapboxgl-map" class and ships CSS for it (position: relative) that
       *  would otherwise fight the absolute positioning above at equal
       *  specificity. Keeping Mapbox's mount point separate from the
       *  positioned wrapper sidesteps that fight entirely. */}
      <div ref={containerRef} className="explore-map-mount" />
    </div>
  );
}
