-- Separate documentary records from existing enriched profiles. No data imported.
alter table public.people add column profile_tier text not null default 'profile'
  check (profile_tier in ('profile','cemetery_record'));
alter table public.people add column record_details jsonb;
alter table public.people add constraint cemetery_record_details check (
  profile_tier <> 'cemetery_record' or coalesce((
    record_details is not null and jsonb_typeof(record_details) = 'object'
    and record_details->>'disposition' = 'unconfirmed'
    and record_details->>'source_url' like 'https://%'
    and record_details->>'source_record_id' is not null
    and biography is null and why_interesting is null and dead_score = 0
    and not is_featured and birth_date is null and death_date is null
  ), false)
);
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.directory_batches (
  id text primary key, payload jsonb not null,
  status text not null check (status in ('released','withdrawn')),
  created_at timestamptz not null default now()
);
create table private.directory_batch_people (
  batch_id text not null references private.directory_batches,
  person_id uuid not null references public.people,
  source_record_id text not null unique,
  primary key (batch_id,person_id)
);
alter table private.directory_batches enable row level security;
alter table private.directory_batch_people enable row level security;
revoke all on private.directory_batches, private.directory_batch_people from public,anon,authenticated;

create or replace view public.discovery_people with (security_invoker=true) as
select p.id, p.slug, p.name, p.birth_year, p.death_year, p.short_description, p.dead_score,
  b.id as burial_id, c.id as cemetery_id, c.name as cemetery_name,
  b.location_precision, b.location_confidence::double precision,
  extensions.st_y(coalesce(b.location,c.location)::extensions.geometry) as latitude,
  extensions.st_x(coalesce(b.location,c.location)::extensions.geometry) as longitude,
  coalesce((select array_agg(cat.slug order by cat.sort_order) from public.person_categories pc
    join public.categories cat on cat.id=pc.category_id where pc.person_id=p.id), '{}'::text[]) as categories,
  p.created_at, p.profile_tier
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
  created_at timestamptz, distance_meters double precision, profile_tier text
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
    d.latitude,d.longitude,d.categories,d.created_at,extensions.st_distance(c.point,origin),d.profile_tier
  from candidates c join public.discovery_people d on d.burial_id=c.id
  where d.dead_score >= min_score and (category_slug is null or category_slug=any(d.categories))
  order by extensions.st_distance(c.point,origin),d.dead_score desc,d.id limit result_limit;
end;
$$;
grant execute on function public.nearby_people(double precision,double precision,double precision,integer,text,integer) to anon,authenticated,service_role;

-- Invoker privileges only: used via authenticated admin CLI, never the public API.
create function private.publish_directory_batch(batch_id text, payload jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; person uuid; burial uuid; src uuid; cemetery uuid;
  existing private.directory_batches; n integer;
begin
  if batch_id is null or batch_id !~ '^[a-z0-9][a-z0-9-]{1,100}$'
    or jsonb_typeof(payload) is distinct from 'array'
    or jsonb_array_length(payload) not between 1 and 200 then
    raise exception 'Invalid directory batch';
  end if;
  perform pg_advisory_xact_lock(hashtext('findthedead-directory-publish'));
  select * into existing from private.directory_batches b where b.id=batch_id;
  if found then
    if existing.payload is distinct from payload or existing.status <> 'released' then
      raise exception 'Batch ID already used with different content or withdrawn';
    end if;
    if exists(select 1 from private.directory_batch_people bp join public.people p on p.id=bp.person_id
      where bp.batch_id=publish_directory_batch.batch_id and (p.status<>'published' or p.profile_tier<>'cemetery_record')) then
      raise exception 'Previously released batch has changed';
    end if;
    return jsonb_array_length(payload);
  end if;
  insert into private.directory_batches(id,payload,status) values(batch_id,payload,'released');
  for item in select value from jsonb_array_elements(payload) loop
    if item->>'wikidata_id' is null or item->>'wikidata_id' !~ '^Q[1-9][0-9]*$'
      or item->>'slug' is null or item->>'name' is null
      or item->>'cemetery_id' is null or item->>'source_record_id' is null
      or item->>'source_url' is null or item->>'source_sha256' !~ '^[a-f0-9]{64}$'
      or item->>'source_sha256' is null or item->>'retrieved_at' is null
      or item->>'provider' is distinct from 'arlington'
      or item->>'source_url' !~ '^https://wspublic[.]eiss[.]army[.]mil/IssRetrieveServices[.]svc/search[?]'
      or item->>'source_record_id' !~ '^arlington:[1-9][0-9]*:[1-9][0-9]*$'
      or item->>'birth_year' is null or item->>'death_year' is null
      or item->>'disclaimer' is null or length(item->>'disclaimer')<30
      or (item->>'birth_year')::integer not between 1000 and 2999
      or (item->>'death_year')::integer not between 1000 and 2999
      or (item->>'retrieved_at')::timestamptz > now()+interval '5 minutes'
      or (item->>'retrieved_at')::timestamptz < now()-interval '30 days' then
      raise exception 'Invalid or unsupported directory evidence';
    end if;
    select c.id into cemetery from public.cemeteries c
      where c.id=(item->>'cemetery_id')::uuid and c.status='published' and not c.is_fixture
      and c.name='Arlington National Cemetery' and c.location is not null
      and exists(select 1 from public.sources s where s.cemetery_id=c.id and s.external_id='Q216344');
    if not found then raise exception 'Cemetery mapping is not approved'; end if;
    if exists(select 1 from public.people p where p.wikidata_id=item->>'wikidata_id' or p.slug=item->>'slug') then
      raise exception 'Candidate identity already exists: %', item->>'wikidata_id';
    end if;
    insert into public.people(slug,name,birth_year,death_year,short_description,wikidata_id,wikipedia_url,
      profile_tier,record_details,status)
    values(item->>'slug',item->>'name',(item->>'birth_year')::integer,(item->>'death_year')::integer,
      'Listed in Arlington National Cemetery records.',item->>'wikidata_id',item->>'wikipedia_url',
      'cemetery_record',jsonb_build_object('disposition','unconfirmed','provider',item->>'provider',
        'source_record_id',item->>'source_record_id','source_url',item->>'source_url',
        'source_sha256',item->>'source_sha256','retrieved_at',item->>'retrieved_at',
        'section',item->>'section','grave',item->>'grave','disclaimer',item->>'disclaimer'), 'draft') returning id into person;
    insert into public.burials(person_id,cemetery_id,location_precision,location_confidence)
      values(person,cemetery,'cemetery',1) returning id into burial;
    insert into public.sources(source_type,url,external_id,retrieved_at,field,confidence,notes,burial_id)
      values('official',item->>'source_url',item->>'source_record_id',(item->>'retrieved_at')::timestamptz,
        'cemetery record',1,'Documentary record only; physical interment or memorial status is unconfirmed.',burial)
      returning id into src;
    update public.burials set source_id=src where id=burial;
    insert into public.sources(source_type,url,external_id,retrieved_at,field,confidence,notes,person_id)
      values('wikidata','https://www.wikidata.org/wiki/'||(item->>'wikidata_id'),item->>'wikidata_id',now(),
        'identity cross-reference',0.75,'Name and lifespan matched to the official record. Exact days withheld.',person);
    insert into private.directory_batch_people values(batch_id,person,item->>'source_record_id');
  end loop;
  update public.people p set status='published' from private.directory_batch_people bp
    where bp.batch_id=publish_directory_batch.batch_id and bp.person_id=p.id;
  get diagnostics n=row_count;
  if n<>jsonb_array_length(payload) then raise exception 'Incomplete directory batch'; end if;
  return n;
end;
$$;
revoke all on function private.publish_directory_batch(text,jsonb) from public,anon,authenticated;

create function private.withdraw_directory_batch(batch_id text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('findthedead-directory-publish'));
  if not exists(select 1 from private.directory_batches b where b.id=batch_id and b.status='released') then
    raise exception 'Released batch not found';
  end if;
  if exists(select 1 from private.directory_batch_people bp join public.people p on p.id=bp.person_id
    where bp.batch_id=withdraw_directory_batch.batch_id and p.profile_tier<>'cemetery_record') then
    raise exception 'Batch includes upgraded profiles; review before withdrawing';
  end if;
  update public.people p set status='draft' from private.directory_batch_people bp
    where bp.batch_id=withdraw_directory_batch.batch_id and bp.person_id=p.id;
  get diagnostics n=row_count;
  update private.directory_batches b set status='withdrawn' where b.id=withdraw_directory_batch.batch_id;
  return n;
end;
$$;
revoke all on function private.withdraw_directory_batch(text) from public,anon,authenticated;
