"use client";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
  MAP_STYLE,
} from "@/lib/explore/config";
import { mapFeatures, combinedBounds, canonicalBounds, type MapPoint } from "@/lib/explore/map-summary";
import type { Bounds } from "@/lib/validation/geo";

const SOURCE_ID = "people";
const UNCLUSTERED_LAYER = "people-unclustered";
const CLUSTER_LAYER = "people-clusters";
const CLUSTER_COUNT_LAYER = "people-cluster-count";

type PersonFeature = mapboxgl.GeoJSONFeature & {
  geometry: GeoJSON.Point;
  properties: MapPoint & { cluster_id?: number };
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
  points: readonly MapPoint[];
  onSelectArea: (bounds: Bounds, total: number) => void;
  onBoundsChange: (bounds: Bounds) => void;
  userLocation: { latitude: number; longitude: number } | null;
  initialView: { latitude: number; longitude: number; zoom: number };
  accessToken: string;
};

/** Renders people through Mapbox's native cluster source rather than one
 *  React marker per person: with hundreds of records this stays smooth on
 *  mobile where per-marker DOM nodes would not. */
export function MapCanvas({
  points,
  onSelectArea,
  onBoundsChange,
  userLocation,
  initialView,
  accessToken,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const flownToRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onSelectArea, onBoundsChange });

  // Runs after every render (no dependency array) purely to keep the ref
  // fresh for the map's event handlers, which close over it once on mount.
  useEffect(() => {
    callbacksRef.current = { onSelectArea, onBoundsChange };
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
        callbacksRef.current.onBoundsChange(canonicalBounds({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        }));
      }, 250);
    };

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: { total_count: ["+", ["get", "count"]] },
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
            ["get", "total_count"],
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
          "text-field": ["number-format", ["get", "total_count"], {"max-fraction-digits": 0}],
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
          "circle-radius": ["case", [">", ["get", "count"], 1], 22, 7],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#d8f58a",
        },
      });

      map.addLayer({
        id: "people-point-count", type: "symbol", source: SOURCE_ID,
        filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "count"], 1]],
        layout: {"text-field": ["number-format", ["get", "count"], {"max-fraction-digits": 0}], "text-size": 13},
        paint: {"text-color": "#17221b"},
      });
      const selectPoints = (points: MapPoint[]) => {
        if (!points.length) return;
        const bounds = combinedBounds(points);
        if (bounds.east-bounds.west > 0.00001 || bounds.north-bounds.south > 0.00001) {
          map.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]], {padding:70,maxZoom:Math.min(map.getZoom()+3,19)});
        } else {
          callbacksRef.current.onSelectArea({west:Math.max(-180,bounds.west-1e-8),east:Math.min(180,bounds.east+1e-8),south:Math.max(-90,bounds.south-1e-8),north:Math.min(90,bounds.north+1e-8)}, points.reduce((n,p)=>n+p.count,0));
        }
      };
      map.on("click", CLUSTER_LAYER, async (e) => {
        const [feature] = map.queryRenderedFeatures(e.point,{layers:[CLUSTER_LAYER]}) as PersonFeature[];
        const clusterId=feature?.properties?.cluster_id;
        const source=map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        if(clusterId===undefined || !source)return;
        try {
          const zoom=await getClusterExpansionZoom(source,clusterId);
          if(zoom>map.getZoom()+0.15){map.easeTo({center:feature.geometry.coordinates as [number,number],zoom});return;}
          // Leaves are bounded aggregate cells, not a truncated list of people.
          selectPoints((await getClusterLeaves(source,clusterId,2048)).map(f=>f.properties));
        } catch { /* A source update invalidated this cluster; the next click uses current data. */ }
      });
      map.on("click", UNCLUSTERED_LAYER, (e) => {
        const features=map.queryRenderedFeatures(e.point,{layers:[UNCLUSTERED_LAYER]}) as PersonFeature[];
        const unique=[...new Map(features.map(f=>[f.id,f.properties])).values()];
        selectPoints(unique);
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
      source?.setData(mapFeatures(points));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [points]);

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
