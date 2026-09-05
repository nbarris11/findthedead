-- Standalone smoke checks. Transaction rolls back all test publications and invented coordinates.
begin;
update public.cemeteries set is_fixture=false,status='published';
update public.people set is_fixture=false,status='published';
set local role anon;
do $$
begin
  if (select count(*) from public.nearby_people(42.4419,-83.1261,1)) <> 12 then raise exception 'Cemetery radius lookup failed'; end if;
  if (select count(*) from public.nearby_people(42.4419,-83.1261,1,90,'music',1)) <> 1 then raise exception 'Filters or limit failed'; end if;
  if (select slug from public.nearby_people(42.4419,-83.1261,1,90,'music',1)) <> 'aretha-franklin' then raise exception 'Ranking failed'; end if;
  if (select count(*) from public.people_in_bounds(-84,42,-82,43)) <> 22 then raise exception 'Bounds lookup failed'; end if;
  if (select count(*) from public.cemeteries_in_bounds(-84,42,-82,43)) <> 2 then raise exception 'Cemetery bounds failed'; end if;
  if (select count(*) from public.sources) <> 46 then raise exception 'Published provenance inaccessible'; end if;
end;
$$;
reset role;
-- Test-only exact grave overrides a cemetery, and another point crosses the date line.
update public.burials set location=extensions.st_setsrid(extensions.st_makepoint(179.5,0),4326)::extensions.geography, location_precision='exact_grave'
where person_id=(select id from public.people where slug='aretha-franklin');
update public.burials set location=extensions.st_setsrid(extensions.st_makepoint(-179.5,0),4326)::extensions.geography, location_precision='approximate'
where person_id=(select id from public.people where slug='rosa-parks');
set local role authenticated;
do $$
begin
  if (select count(*) from public.people_in_bounds(170,-10,-170,10)) <> 2 then raise exception 'Antimeridian bounds failed'; end if;
  if (select count(*) from public.people_in_bounds(-10,-10,10,10)) <> 0 then raise exception 'Bounds included unrelated hemisphere'; end if;
  if (select count(*) from public.nearby_people(0,179.5,1)) <> 1 then raise exception 'Exact point query failed'; end if;
  if (select count(*) from public.nearby_people(42.4419,-83.1261,1)) <> 10 then raise exception 'Cemetery fallback duplicated exact point'; end if;
  if (select distance_meters from public.nearby_people(0,179.5,1)) <> 0 then raise exception 'Zero distance incorrect'; end if;
end;
$$;
reset role;
update public.cemeteries set status='draft' where slug='woodlawn-detroit';
set local role anon;
do $$
begin
  if (select count(*) from public.burials) <> 10 then raise exception 'Burials expose hidden cemetery'; end if;
  if (select count(*) from public.people_in_bounds(-180,-90,180,90)) <> 10 then raise exception 'Discovery exposes hidden cemetery'; end if;
end;
$$;
reset role;
rollback;
