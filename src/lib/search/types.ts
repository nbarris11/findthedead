import type { CemeteryPoint, DiscoveryPerson } from "../../types/database";

/** The spec's eventual scope is person name, cemetery, city, and
 *  occupation/category search, with people and cemeteries visually
 *  distinguished. This release only populates `person` results — see
 *  docs/PRODUCT.md — but the result shape already carries the
 *  discriminant so cemetery search can be added without changing how
 *  the UI renders a mixed result list. */
export type SearchResult =
  | { type: "person"; person: DiscoveryPerson }
  | { type: "cemetery"; cemetery: CemeteryPoint };
