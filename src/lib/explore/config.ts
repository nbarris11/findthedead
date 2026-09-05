/** Explore map defaults. Detroit is the first edition, not a hardcoded limit:
 *  every query is bounds-driven, so any region works once it has records. */
export const DEFAULT_VIEW = {
  latitude: 42.3897,
  longitude: -83.0724,
  zoom: 9.4,
} as const;

/** Server-rendered first paint uses these bounds so the map has records
 *  before Mapbox loads, and before the visitor is asked for location. */
export const DEFAULT_BOUNDS = {
  west: -83.55,
  south: 42.15,
  east: -82.75,
  north: 42.62,
} as const;

/** Dead Score threshold used by the "Notable only" filter. Configurable here
 *  rather than inline so clutter control stays one decision. See docs/PRODUCT.md. */
export const NOTABLE_MIN_SCORE = 80;

/** Mapbox clusters below this zoom. Coincident cemetery-precision points never
 *  separate, so cluster clicks fall back to a list. See MapCanvas. */
export const CLUSTER_MAX_ZOOM = 13;
export const CLUSTER_RADIUS = 48;

/** Upper bound shared with boundsQuerySchema; keeps one map payload bounded. */
export const MAP_RESULT_LIMIT = 200;

export const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";
