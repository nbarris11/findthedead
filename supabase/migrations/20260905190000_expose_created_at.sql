-- Nearby's "recently added" sort needs a real, already-existing signal
-- rather than an invented one: people.created_at. Appending a column to a
-- view is a compatible change (CREATE OR REPLACE VIEW); nearby_people's
-- explicit RETURNS TABLE column list is not, so it is dropped and recreated.
create or replace view public.discovery_people with (security_invoker=true) as
select p.id, p.slug, p.name, p.birth_year, p.death_year, p.short_description, p.dead_score,
  b.id as burial_id, c.id as cemetery_id, c.name as cemetery_name,
  b.location_precision, b.location_confidence::double precision,
  extensions.st_y(coalesce(b.location,c.location)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(b.location,c.location)::extensions.geometry) as longitude,
  coalesce((select array_agg(cat.slug order by cat.sort_order) from public.person_categories pc
    join public.categories cat on cat.id=pc.category_id where pc.person_id=p.id), '{}'::text[]) as categories,
  p.created_at
from public.people p join public.burials b on b.person_id=p.id and b.is_primary
left join public.cemeteries c on c.id=b.cemetery_id
where p.status='published' and not p.is_fixture and coalesce(b.location,c.location) is not null;
grant select on public.discovery_people to anon, authenticated, service_role;

revoke execute on function public.nearby_people(double precision,double precision,double precision,integer,text,integer) from public, anon, authenticated, service_role;
drop function public.nearby_people(double precision,double precision,double precision,integer,text,integer);

create function public.nearby_people(
  latitude double precision, longitude double precision, radius_meters double precision default 40233.6,
  min_score integer default 0, category_slug text default null, result_limit integer default 100
) returns table (
  id uuid, slug text, name text, birth_year integer, death_year integer, short_description text,
  dead_score smallint, burial_id uuid, cemetery_id uuid, cemetery_name text,
  location_precision public.location_precision, location_confidence double precision,
  latitude_out double precision, longitude_out double precision, categories text[],
  created_at timestamptz, distance_meters double precision
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
    d.latitude,d.longitude,d.categories,d.created_at,extensions.st_distance(c.point,origin)
  from candidates c join public.discovery_people d on d.burial_id=c.id
  where d.dead_score >= min_score and (category_slug is null or category_slug=any(d.categories))
  order by extensions.st_distance(c.point,origin),d.dead_score desc,d.id limit result_limit;
end;
$$;
grant execute on function public.nearby_people(double precision,double precision,double precision,integer,text,integer) to anon,authenticated,service_role;
