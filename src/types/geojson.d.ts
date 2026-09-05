// mapbox-gl's shipped types reference the ambient `GeoJSON` namespace from
// @types/geojson but do not pull it in themselves; this file makes sure it's
// part of the program regardless of tsc's automatic @types inclusion.
/// <reference types="geojson" />
