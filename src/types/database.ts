/** Hand-maintained schema contract for milestone 2. Regenerate with Supabase CLI after applying migrations; keep domain DTOs separate. */
export type Precision =
  "exact_grave" | "cemetery_section" | "cemetery" | "approximate" | "unknown";
export type Status = "draft" | "published";
type Timestamps = { created_at: string; updated_at: string };
export type PersonRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  birth_year: number | null;
  death_year: number | null;
  short_description: string;
  biography: string | null;
  why_interesting: string | null;
  wikidata_id: string | null;
  wikipedia_url: string | null;
  dead_score: number;
  is_featured: boolean;
  status: Status;
  is_fixture: boolean;
};
export type CemeteryRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  country: string;
  location: string | null;
  website_url: string | null;
  status: Status;
  is_fixture: boolean;
};
export type BurialRow = Timestamps & {
  id: string;
  person_id: string;
  cemetery_id: string | null;
  location: string | null;
  location_precision: Precision;
  location_confidence: number;
  source_id: string | null;
  is_primary: boolean;
};
export type PersonLocationRow = Timestamps & {
  id: string;
  person_id: string;
  type: "birth" | "death" | "burial" | "residence" | "historical_event";
  label: string;
  location: string | null;
  location_precision: Precision;
  source_id: string | null;
};
export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
};
export type SourceRow = {
  id: string;
  source_type:
    | "wikidata"
    | "wikipedia"
    | "commons"
    | "official"
    | "historical"
    | "editorial"
    | "mock";
  url: string;
  external_id: string | null;
  retrieved_at: string;
  field: string;
  confidence: number;
  notes: string | null;
  person_id: string | null;
  cemetery_id: string | null;
  burial_id: string | null;
  person_location_id: string | null;
  image_id: string | null;
};
export type ImageRow = {
  id: string;
  person_id: string;
  url: string;
  alt_text: string;
  creator: string;
  license: string;
  attribution: string;
  is_primary: boolean;
  source_id: string | null;
  created_at: string;
};
export type DiscoveryPerson = {
  id: string;
  slug: string;
  name: string;
  birth_year: number | null;
  death_year: number | null;
  short_description: string;
  dead_score: number;
  burial_id: string;
  cemetery_id: string | null;
  cemetery_name: string | null;
  location_precision: Precision;
  location_confidence: number;
  latitude: number;
  longitude: number;
  categories: string[];
  created_at: string;
};
export type NearbyPerson = DiscoveryPerson & { distance_meters: number };
export type CategoryOption = Pick<CategoryRow, "slug" | "name">;
export type NearbyRpcRow = Omit<NearbyPerson, "latitude" | "longitude"> & {
  latitude_out: number;
  longitude_out: number;
};
export type CemeteryPoint = Pick<
  CemeteryRow,
  "id" | "slug" | "name" | "city" | "state" | "country"
> & { latitude: number; longitude: number };

export type ProfileSource = Pick<
  SourceRow,
  "source_type" | "url" | "field" | "retrieved_at" | "confidence" | "notes"
>;
export type ProfileImage = Pick<
  ImageRow,
  "url" | "alt_text" | "creator" | "license" | "attribution" | "is_primary"
>;
export type ProfileCemetery = Pick<
  CemeteryRow,
  "slug" | "name" | "city" | "state" | "country" | "website_url"
>;
export type CemeteryProfileRow = Pick<
  CemeteryRow,
  "id" | "slug" | "name" | "description" | "city" | "state" | "country" | "website_url"
>;
/** Full detail for /people/[slug]: everything DiscoveryPerson has (dates,
 *  score, coordinates, precision, categories) plus the fields a discovery
 *  feed has no use for. */
export type ProfilePerson = DiscoveryPerson & {
  birth_date: string | null;
  death_date: string | null;
  biography: string | null;
  why_interesting: string | null;
  wikidata_id: string | null;
  wikipedia_url: string | null;
  cemetery: ProfileCemetery | null;
  images: ProfileImage[];
  sources: ProfileSource[];
};
export type CemeteryProfile = ProfileCemetery & {
  id: string;
  description: string | null;
  latitude: number;
  longitude: number;
  people: DiscoveryPerson[];
  categories: CategoryOption[];
  sources: ProfileSource[];
};
type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};
type BoundsArgs = { west: number; south: number; east: number; north: number };
type QueryOptions = {
  min_score?: number;
  category_slug?: string | null;
  result_limit?: number;
};
export type Database = {
  public: {
    Tables: {
      people: Table<PersonRow, "slug" | "name" | "short_description">;
      cemeteries: Table<CemeteryRow, "slug" | "name" | "country">;
      burials: Table<BurialRow, "person_id">;
      person_locations: Table<
        PersonLocationRow,
        "person_id" | "type" | "label"
      >;
      categories: Table<CategoryRow, "slug" | "name">;
      person_categories: Table<
        { person_id: string; category_id: string },
        "person_id" | "category_id"
      >;
      sources: Table<
        SourceRow,
        "source_type" | "url" | "retrieved_at" | "field" | "confidence"
      >;
      images: Table<
        ImageRow,
        "person_id" | "url" | "alt_text" | "creator" | "license" | "attribution"
      >;
    };
    Views: { discovery_people: { Row: DiscoveryPerson; Relationships: [] } };
    Functions: {
      nearby_people: {
        Args: {
          latitude: number;
          longitude: number;
          radius_meters?: number;
        } & QueryOptions;
        Returns: NearbyRpcRow[];
      };
      people_in_bounds: {
        Args: BoundsArgs & QueryOptions;
        Returns: DiscoveryPerson[];
      };
      cemeteries_in_bounds: {
        Args: BoundsArgs & { result_limit?: number };
        Returns: CemeteryPoint[];
      };
      cemetery_by_slug: {
        Args: { p_slug: string };
        Returns: (CemeteryProfileRow & { latitude: number; longitude: number })[];
      };
      search_people: {
        Args: { q: string; result_limit?: number };
        Returns: DiscoveryPerson[];
      };
      set_cemetery_location: {
        Args: { p_cemetery_id: string; p_longitude: number; p_latitude: number };
        Returns: undefined;
      };
      query_envelopes: { Args: BoundsArgs; Returns: string[] };
    };
    Enums: {
      publication_status: Status;
      location_precision: Precision;
      person_location_type: PersonLocationRow["type"];
    };
    CompositeTypes: Record<string, never>;
  };
};
