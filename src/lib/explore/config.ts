/** Statewide Michigan view. Every query remains bounds-driven, so visitors can
 *  move beyond the initial view and future records work without UI changes. */
export const DEFAULT_VIEW = {
  latitude: 44.6,
  longitude: -85.4,
  zoom: 5.4,
} as const;

/** Lower and Upper Peninsulas, with a small margin for edge cemeteries. */
export const DEFAULT_BOUNDS = {
  west: -90.6,
  south: 41.65,
  east: -82.05,
  north: 48.35,
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
