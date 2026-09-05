-- Trusted ingestion writes (src/lib/ingestion/publish.ts) go through the
-- Supabase JS client over PostgREST, which cannot express PostGIS geography
-- construction in a plain insert/update payload the way build-seed.ts's raw
-- SQL can. This is that construction exposed as a callable function
-- instead — restricted to service_role only, since it is a write path with
-- no place in the public read surface.
create function public.set_cemetery_location(p_cemetery_id uuid, p_longitude double precision, p_latitude double precision)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_cemetery_id is null then
    raise exception 'Cemetery id is required' using errcode='22023';
  end if;
  if p_longitude is null or not p_longitude between -180 and 180
    or p_latitude is null or not p_latitude between -90 and 90 then
    raise exception 'Invalid coordinates' using errcode='22023';
  end if;
  update public.cemeteries
  set location = extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  where id = p_cemetery_id;
end;
$$;
revoke execute on function public.set_cemetery_location(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.set_cemetery_location(uuid, double precision, double precision) to service_role;
