-- WGS84 geography is the source of truth. No remote data is imported here.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create type public.publication_status as enum ('draft', 'published');
create type public.location_precision as enum ('exact_grave', 'cemetery_section', 'cemetery', 'approximate', 'unknown');
create type public.person_location_type as enum ('birth', 'death', 'burial', 'residence', 'historical_event');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 200),
  birth_date date, death_date date,
  birth_year integer, death_year integer,
  short_description text not null check (length(short_description) between 1 and 500),
  biography text, why_interesting text,
  wikidata_id text unique check (wikidata_id ~ '^Q[1-9][0-9]*$'),
  wikipedia_url text check (wikipedia_url ~ '^https://'),
  dead_score smallint not null default 0 check (dead_score between 0 and 100),
  is_featured boolean not null default false,
  status public.publication_status not null default 'draft',
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (death_date is null or birth_date is null or death_date >= birth_date),
  check (death_year is null or birth_year is null or death_year >= birth_year),
  check (birth_date is null or birth_year is null or extract(year from birth_date) = birth_year),
  check (death_date is null or death_year is null or extract(year from death_date) = death_year),
  check (status <> 'published' or (not is_fixture and (death_date is not null or death_year is not null)))
);
create table public.cemeteries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null, description text, city text, state text,
  country text not null check (country ~ '^[A-Z]{2}$'),
  location extensions.geography(Point,4326),
  website_url text check (website_url ~ '^https://'),
  status public.publication_status not null default 'draft', is_fixture boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'published' or not is_fixture)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null unique, sort_order integer not null default 0
);
create table public.person_categories (
  person_id uuid not null references public.people on delete cascade,
  category_id uuid not null references public.categories on delete restrict,
  primary key (person_id, category_id)
);
create table public.burials (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people on delete cascade,
  cemetery_id uuid references public.cemeteries on delete restrict,
  location extensions.geography(Point,4326),
  location_precision public.location_precision not null default 'unknown',
  location_confidence numeric(3,2) not null default 0 check (location_confidence between 0 and 1),
  source_id uuid,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (
    (location_precision in ('exact_grave','cemetery_section','approximate') and location is not null)
    or (location_precision = 'cemetery' and cemetery_id is not null and location is null)
    or (location_precision = 'unknown' and location is null and cemetery_id is null)
  )
);
create unique index burials_one_primary on public.burials(person_id) where is_primary;
create table public.person_locations (
  id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people on delete cascade,
  type public.person_location_type not null, label text not null,
  location extensions.geography(Point,4326),
  location_precision public.location_precision not null default 'unknown',
  source_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((location_precision = 'unknown' and location is null) or (location_precision <> 'unknown' and location is not null))
);
create table public.images (
  id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people on delete cascade,
  url text not null check (url ~ '^https://'), alt_text text not null,
  creator text not null, license text not null, attribution text not null,
  is_primary boolean not null default false, source_id uuid,
  created_at timestamptz not null default now()
);
create unique index images_one_primary on public.images(person_id) where is_primary;
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('wikidata','wikipedia','commons','official','historical','editorial','mock')),
  url text not null check (url ~ '^https://'), external_id text,
  retrieved_at timestamptz not null, field text not null,
  confidence numeric(3,2) not null check (confidence between 0 and 1), notes text,
  person_id uuid references public.people on delete cascade,
  cemetery_id uuid references public.cemeteries on delete cascade,
  burial_id uuid references public.burials on delete cascade,
  person_location_id uuid references public.person_locations on delete cascade,
  image_id uuid references public.images on delete cascade,
  check (num_nonnulls(person_id,cemetery_id,burial_id,person_location_id,image_id) = 1)
);
alter table public.burials add constraint burials_source_fkey foreign key (source_id) references public.sources on delete set null;
alter table public.person_locations add constraint person_locations_source_fkey foreign key (source_id) references public.sources on delete set null;
alter table public.images add constraint images_source_fkey foreign key (source_id) references public.sources on delete set null;

create index people_name_search on public.people using gin (to_tsvector('simple', name));
create index people_discovery_rank on public.people(dead_score desc, id) where status='published' and not is_fixture;
create index cemeteries_location_gist on public.cemeteries using gist(location);
create index cemeteries_bounds_gist on public.cemeteries using gist((location::extensions.geometry));
create index burials_location_gist on public.burials using gist(location) where is_primary;
create index burials_bounds_gist on public.burials using gist((location::extensions.geometry)) where is_primary;
create index burials_cemetery on public.burials(cemetery_id);
create index burials_person on public.burials(person_id);
create index person_locations_location_gist on public.person_locations using gist(location);
create index person_locations_person on public.person_locations(person_id);
create index person_categories_category on public.person_categories(category_id);
create index images_person on public.images(person_id);
create index sources_person on public.sources(person_id);
create index sources_cemetery on public.sources(cemetery_id);
create index sources_burial on public.sources(burial_id);
create index sources_location on public.sources(person_location_id);
create index sources_image on public.sources(image_id);
create index burials_source on public.burials(source_id);
create index person_locations_source on public.person_locations(source_id);
create index images_source on public.images(source_id);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger people_updated_at before update on public.people for each row execute function public.touch_updated_at();
create trigger cemeteries_updated_at before update on public.cemeteries for each row execute function public.touch_updated_at();
create trigger burials_updated_at before update on public.burials for each row execute function public.touch_updated_at();
create trigger person_locations_updated_at before update on public.person_locations for each row execute function public.touch_updated_at();
alter table public.people enable row level security;
revoke all on public.people from anon, authenticated;
grant select on public.people to anon, authenticated;
grant all on public.people to service_role;
alter table public.cemeteries enable row level security;
revoke all on public.cemeteries from anon, authenticated;
grant select on public.cemeteries to anon, authenticated;
grant all on public.cemeteries to service_role;
alter table public.burials enable row level security;
revoke all on public.burials from anon, authenticated;
grant select on public.burials to anon, authenticated;
grant all on public.burials to service_role;
alter table public.person_locations enable row level security;
revoke all on public.person_locations from anon, authenticated;
grant select on public.person_locations to anon, authenticated;
grant all on public.person_locations to service_role;
alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant all on public.categories to service_role;
alter table public.person_categories enable row level security;
revoke all on public.person_categories from anon, authenticated;
grant select on public.person_categories to anon, authenticated;
grant all on public.person_categories to service_role;
alter table public.sources enable row level security;
revoke all on public.sources from anon, authenticated;
grant select on public.sources to anon, authenticated;
grant all on public.sources to service_role;
alter table public.images enable row level security;
revoke all on public.images from anon, authenticated;
grant select on public.images to anon, authenticated;
grant all on public.images to service_role;
grant usage on schema public, extensions to anon, authenticated, service_role;
create policy people_read on public.people for select to anon, authenticated using (status='published' and not is_fixture);
create policy cemeteries_read on public.cemeteries for select to anon, authenticated using (status='published' and not is_fixture);
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy person_categories_read on public.person_categories for select to anon, authenticated using (exists(select 1 from public.people p where p.id=person_id));
create policy burials_read on public.burials for select to anon, authenticated using (
  exists(select 1 from public.people p where p.id=person_id)
  and (cemetery_id is null or exists(select 1 from public.cemeteries c where c.id=cemetery_id))
);
create policy person_locations_read on public.person_locations for select to anon, authenticated using (exists(select 1 from public.people p where p.id=person_id));
create policy images_read on public.images for select to anon, authenticated using (exists(select 1 from public.people p where p.id=person_id));
create policy sources_read on public.sources for select to anon, authenticated using (
  exists(select 1 from public.people p where p.id=person_id)
  or exists(select 1 from public.cemeteries c where c.id=cemetery_id)
  or exists(select 1 from public.burials b where b.id=burial_id)
  or exists(select 1 from public.person_locations l where l.id=person_location_id)
  or exists(select 1 from public.images i where i.id=image_id)
);

-- Public invoker view centralizes serialization, never RLS bypass.
create view public.discovery_people with (security_invoker=true) as
select p.id, p.slug, p.name, p.birth_year, p.death_year, p.short_description, p.dead_score,
  b.id as burial_id, c.id as cemetery_id, c.name as cemetery_name,
  b.location_precision, b.location_confidence::double precision,
  extensions.st_y(coalesce(b.location,c.location)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(b.location,c.location)::extensions.geometry) as longitude,
  coalesce((select array_agg(cat.slug order by cat.sort_order) from public.person_categories pc
    join public.categories cat on cat.id=pc.category_id where pc.person_id=p.id), '{}'::text[]) as categories
from public.people p join public.burials b on b.person_id=p.id and b.is_primary
left join public.cemeteries c on c.id=b.cemetery_id
where p.status='published' and not p.is_fixture and coalesce(b.location,c.location) is not null;
grant select on public.discovery_people to anon, authenticated, service_role;

-- Reject nulls, NaN, infinities, out-of-range parameters before any spatial construction.
create function public.nearby_people(
  latitude double precision, longitude double precision, radius_meters double precision default 40233.6,
  min_score integer default 0, category_slug text default null, result_limit integer default 100
) returns table (
  id uuid, slug text, name text, birth_year integer, death_year integer, short_description text,
  dead_score smallint, burial_id uuid, cemetery_id uuid, cemetery_name text,
  location_precision public.location_precision, location_confidence double precision,
  latitude_out double precision, longitude_out double precision, categories text[], distance_meters double precision
) language plpgsql stable security invoker set search_path = '' as $$
declare origin extensions.geography;
begin
  if latitude is null or not latitude between -90 and 90 or longitude is null or not longitude between -180 and 180
    or radius_meters is null or not radius_meters between 1 and 160934.4
    or min_score is null or not min_score between 0 and 100
    or result_limit is null or not result_limit between 1 and 200 then
    raise exception 'Invalid geographic query parameters' using errcode='22023';
  end if;
  origin := extensions.st_setsrid(extensions.st_makepoint(longitude, latitude),4326)::extensions.geography;
  return query
  with candidates as (
    select b.id, b.location as point from public.burials b
      where b.is_primary and b.location is not null and extensions.st_dwithin(b.location,origin,radius_meters)
    union all
    select b.id,c.location from public.cemeteries c join public.burials b on b.cemetery_id=c.id
      where b.is_primary and b.location is null and extensions.st_dwithin(c.location,origin,radius_meters)
  )
  select d.id,d.slug,d.name,d.birth_year,d.death_year,d.short_description,d.dead_score,
    d.burial_id,d.cemetery_id,d.cemetery_name,d.location_precision,d.location_confidence,
    d.latitude,d.longitude,d.categories,extensions.st_distance(c.point,origin)
  from candidates c join public.discovery_people d on d.burial_id=c.id
  where d.dead_score >= min_score and (category_slug is null or category_slug=any(d.categories))
  order by extensions.st_distance(c.point,origin),d.dead_score desc,d.id limit result_limit;
end;
$$;

create function public.query_envelopes(west double precision, south double precision, east double precision, north double precision)
returns setof extensions.geometry language plpgsql immutable security invoker set search_path = '' as $$
begin
  if west is null or not west between -180 and 180 or east is null or not east between -180 and 180
    or south is null or not south between -90 and 90 or north is null or not north between -90 and 90 or south > north then
    raise exception 'Invalid map bounds' using errcode='22023';
  end if;
  if west <= east then return next extensions.st_makeenvelope(west,south,east,north,4326);
  else
    return next extensions.st_makeenvelope(west,south,180,north,4326);
    return next extensions.st_makeenvelope(-180,south,east,north,4326);
  end if;
end;
$$;

create function public.people_in_bounds(
  west double precision, south double precision, east double precision, north double precision,
  min_score integer default 0, category_slug text default null, result_limit integer default 100
) returns setof public.discovery_people language plpgsql stable security invoker set search_path = '' as $$
begin
  if min_score is null or not min_score between 0 and 100 or result_limit is null or not result_limit between 1 and 200 then
    raise exception 'Invalid result limit or score' using errcode='22023';
  end if;
  perform public.query_envelopes(west,south,east,north);
  return query
  with envelopes as materialized (select public.query_envelopes(west,south,east,north) as geom),
  candidates as (
    select b.id from public.burials b join envelopes e on b.location::extensions.geometry operator(extensions.&&) e.geom where b.is_primary and b.location is not null
    union
    select b.id from public.cemeteries c join envelopes e on c.location::extensions.geometry operator(extensions.&&) e.geom
      join public.burials b on b.cemetery_id=c.id where b.is_primary and b.location is null
  )
  select d.* from candidates c join public.discovery_people d on d.burial_id=c.id
  where d.dead_score >= min_score and (category_slug is null or category_slug=any(d.categories))
  order by d.dead_score desc,d.id limit result_limit;
end;
$$;

create function public.cemeteries_in_bounds(
  west double precision,south double precision,east double precision,north double precision,result_limit integer default 100
) returns table (id uuid,slug text,name text,city text,state text,country text,latitude double precision,longitude double precision)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if result_limit is null or not result_limit between 1 and 200 then
    raise exception 'Invalid result limit' using errcode='22023';
  end if;
  perform public.query_envelopes(west,south,east,north);
  return query
  with envelopes as materialized (select public.query_envelopes(west,south,east,north) as geom)
  select distinct c.id,c.slug,c.name,c.city,c.state,c.country,
    extensions.st_y(c.location::extensions.geometry),extensions.st_x(c.location::extensions.geometry)
  from public.cemeteries c join envelopes e on c.location::extensions.geometry operator(extensions.&&) e.geom
  where c.status='published' and not c.is_fixture order by c.name,c.id limit result_limit;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.nearby_people(double precision,double precision,double precision,integer,text,integer) from public;
revoke execute on function public.query_envelopes(double precision,double precision,double precision,double precision) from public;
revoke execute on function public.people_in_bounds(double precision,double precision,double precision,double precision,integer,text,integer) from public;
revoke execute on function public.cemeteries_in_bounds(double precision,double precision,double precision,double precision,integer) from public;
grant execute on function public.nearby_people(double precision,double precision,double precision,integer,text,integer) to anon,authenticated,service_role;
grant execute on function public.query_envelopes(double precision,double precision,double precision,double precision) to anon,authenticated,service_role;
grant execute on function public.people_in_bounds(double precision,double precision,double precision,double precision,integer,text,integer) to anon,authenticated,service_role;
grant execute on function public.cemeteries_in_bounds(double precision,double precision,double precision,double precision,integer) to anon,authenticated,service_role;
