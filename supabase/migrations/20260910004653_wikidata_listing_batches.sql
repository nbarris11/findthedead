-- A sourced statement tier, distinct from official records and reviewed profiles.
alter table public.people drop constraint people_profile_tier_check;
alter table public.people add constraint people_profile_tier_check check(profile_tier in ('profile','cemetery_record','wikidata_listing'));
alter table public.people drop constraint people_check4;
alter table public.people add constraint people_check4 check(status<>'published' or (not is_fixture and (death_date is not null or death_year is not null or (profile_tier='wikidata_listing' and record_details->>'death_asserted'='true'))));
alter table public.people add constraint wikidata_listing_details check(profile_tier<>'wikidata_listing' or coalesce((
 jsonb_typeof(record_details)='object' and record_details->>'provider'='wikidata' and record_details->>'disposition'='unconfirmed'
 and record_details->>'death_asserted'='true' and record_details->>'source_url'='https://www.wikidata.org/wiki/'||wikidata_id
 and record_details->>'source_sha256' ~ '^[a-f0-9]{64}$' and biography is null and why_interesting is null and birth_date is null and death_date is null and dead_score=0 and not is_featured
),false));
create table private.wikidata_cemetery_map(wikidata_id text primary key,cemetery_id uuid not null unique references public.cemeteries);
create table private.wikidata_listing_batches(id text primary key,payload jsonb not null,places jsonb not null,status text not null check(status in ('released','withdrawn')),created_at timestamptz not null default now());
create table private.wikidata_listing_people(batch_id text references private.wikidata_listing_batches,person_id uuid unique references public.people,primary key(batch_id,person_id));
alter table private.wikidata_cemetery_map enable row level security;
alter table private.wikidata_listing_batches enable row level security;
alter table private.wikidata_listing_people enable row level security;
revoke all on private.wikidata_cemetery_map,private.wikidata_listing_batches,private.wikidata_listing_people from public,anon,authenticated;

create function private.publish_wikidata_listing_batch(batch_id text,payload jsonb,places jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare old private.wikidata_listing_batches; n integer;
begin
 if batch_id is null or batch_id !~ '^[a-z0-9-]{1,100}$' or jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) not between 1 and 2000
 or jsonb_typeof(places) is distinct from 'array' or jsonb_array_length(places) not between 1 and 2000 then raise exception 'Invalid listing batch'; end if;
 perform pg_advisory_xact_lock(hashtext('findthedead-directory-publish'));
 select * into old from private.wikidata_listing_batches b where b.id=batch_id;
 if found then
  if old.payload is distinct from payload or old.places is distinct from places or old.status<>'released' then raise exception 'Changed or withdrawn listing batch';end if;
  if exists(select 1 from private.wikidata_listing_people bp join public.people p on p.id=bp.person_id where bp.batch_id=publish_wikidata_listing_batch.batch_id and (p.status<>'published' or p.profile_tier<>'wikidata_listing')) then raise exception 'Released listings changed';end if;
  return jsonb_array_length(payload);
 end if;
 if exists(select 1 from jsonb_array_elements(payload) r where r->>'wikidata_id' is null or r->>'wikidata_id'!~'^Q[1-9][0-9]*$' or r->>'cemetery_wikidata_id' is null or r->>'name' is null or r->>'source_sha256' is null or r->>'source_sha256'!~'^[a-f0-9]{64}$' or r->>'retrieved_at' is null or (r->>'retrieved_at')::timestamptz<now()-interval '30 days' or (r->>'retrieved_at')::timestamptz>now()+interval '5 minutes') then raise exception 'Invalid listing source';end if;
 if exists(select 1 from jsonb_array_elements(places) r where r->>'wikidata_id' is null or r->>'wikidata_id'!~'^Q[1-9][0-9]*$' or r->>'name' is null or r->>'latitude' is null or r->>'longitude' is null or (r->>'latitude')::double precision not between -90 and 90 or (r->>'longitude')::double precision not between -180 and 180 or r->>'source_sha256' is null or r->>'source_sha256'!~'^[a-f0-9]{64}$' or r->>'retrieved_at' is null or (r->>'retrieved_at')::timestamptz<now()-interval '1 day') then raise exception 'Invalid cemetery classification';end if;
 if exists(select 1 from jsonb_array_elements(payload) r join public.people p on p.wikidata_id=r->>'wikidata_id' or p.slug=r->>'slug') then raise exception 'Listing identity already exists';end if;
 if (select count(distinct r->>'wikidata_id') from jsonb_array_elements(payload) r)<>jsonb_array_length(payload)
 or (select count(distinct r->>'wikidata_id') from jsonb_array_elements(places) r)<>jsonb_array_length(places) then raise exception 'Duplicate identity';end if;
 if exists(select 1 from jsonb_array_elements(payload) r where not exists(select 1 from jsonb_array_elements(places) c where c->>'wikidata_id'=r->>'cemetery_wikidata_id')) then raise exception 'Missing cemetery';end if;
 -- Reuse an existing identity only when its public mapping is unique and nearby.
 if exists(select 1 from jsonb_array_elements(places) r join public.sources s on s.external_id=r->>'wikidata_id' and s.cemetery_id is not null group by r->>'wikidata_id' having count(distinct s.cemetery_id)>1) then raise exception 'Ambiguous existing cemetery';end if;
 insert into private.wikidata_cemetery_map(wikidata_id,cemetery_id)
 select distinct r->>'wikidata_id',s.cemetery_id from jsonb_array_elements(places) r join public.sources s on s.external_id=r->>'wikidata_id' and s.cemetery_id is not null
 on conflict(wikidata_id) do nothing;
 if exists(select 1 from jsonb_array_elements(places) r join private.wikidata_cemetery_map m on m.wikidata_id=r->>'wikidata_id' join public.cemeteries c on c.id=m.cemetery_id where c.status<>'published' or c.is_fixture or c.location is null or not extensions.st_dwithin(c.location,extensions.st_setsrid(extensions.st_makepoint((r->>'longitude')::double precision,(r->>'latitude')::double precision),4326)::extensions.geography,2000)) then raise exception 'Existing cemetery mapping conflict';end if;
 -- Allocate stable IDs once, then insert all new cemeteries set-wise.
 with inserted as (
 insert into public.cemeteries(slug,name,state,country,location,description,status)
 select r->>'slug',r->>'name',r->>'state','US',extensions.st_setsrid(extensions.st_makepoint((r->>'longitude')::double precision,(r->>'latitude')::double precision),4326),
 'Cemetery name and location sourced from Wikidata. Individual burial listings have not been independently confirmed.','draft'
 from jsonb_array_elements(places) r where not exists(select 1 from private.wikidata_cemetery_map m where m.wikidata_id=r->>'wikidata_id') returning id,slug
 ) insert into private.wikidata_cemetery_map select r->>'wikidata_id',i.id from inserted i join jsonb_array_elements(places) r on r->>'slug'=i.slug;
 insert into public.sources(source_type,url,external_id,retrieved_at,field,confidence,notes,cemetery_id)
 select 'wikidata','https://www.wikidata.org/wiki/'||(r->>'wikidata_id'),r->>'wikidata_id',(r->>'retrieved_at')::timestamptz,'cemetery identity and location',0.6,'Cemetery type and coordinate from Wikidata; classification snapshot SHA256: '||(r->>'source_sha256'),m.cemetery_id
 from jsonb_array_elements(places) r join private.wikidata_cemetery_map m on m.wikidata_id=r->>'wikidata_id'
 where not exists(select 1 from public.sources s where s.cemetery_id=m.cemetery_id and s.external_id=m.wikidata_id);
 insert into private.wikidata_listing_batches(id,payload,places,status) values(batch_id,payload,places,'released');
 with inserted as (
 insert into public.people(slug,name,birth_year,death_year,short_description,wikidata_id,profile_tier,record_details,status)
 select r->>'slug',r->>'name',(r->>'birth_year')::integer,(r->>'death_year')::integer,'Wikidata lists a burial association with '||(c->>'name')||'.',r->>'wikidata_id','wikidata_listing',
 jsonb_build_object('provider','wikidata','disposition','unconfirmed','death_asserted',true,'source_record_id',r->>'wikidata_id','source_url','https://www.wikidata.org/wiki/'||(r->>'wikidata_id'),'source_sha256',r->>'source_sha256','retrieved_at',r->>'retrieved_at','cemetery_wikidata_id',r->>'cemetery_wikidata_id'),'draft'
 from jsonb_array_elements(payload) r join jsonb_array_elements(places) c on c->>'wikidata_id'=r->>'cemetery_wikidata_id' returning id
 ) insert into private.wikidata_listing_people select batch_id,id from inserted;
 insert into public.burials(person_id,cemetery_id,location_precision,location_confidence)
 select p.id,m.cemetery_id,'cemetery',0.6 from jsonb_array_elements(payload) r join public.people p on p.wikidata_id=r->>'wikidata_id' join private.wikidata_cemetery_map m on m.wikidata_id=r->>'cemetery_wikidata_id';
 insert into public.sources(source_type,url,external_id,retrieved_at,field,confidence,notes,burial_id)
 select 'wikidata','https://www.wikidata.org/wiki/'||(r->>'wikidata_id'),r->>'wikidata_id',(r->>'retrieved_at')::timestamptz,'Wikidata burial statement',0.5,'Source-attributed association; current interment, memorial status and exact grave location are unconfirmed.',b.id
 from jsonb_array_elements(payload) r join public.people p on p.wikidata_id=r->>'wikidata_id' join public.burials b on b.person_id=p.id;
 update public.burials b set source_id=s.id from public.sources s join private.wikidata_listing_people bp on bp.batch_id=publish_wikidata_listing_batch.batch_id where b.person_id=bp.person_id and s.burial_id=b.id;
 update public.cemeteries c set status='published' from private.wikidata_cemetery_map m where c.id=m.cemetery_id and c.status='draft' and exists(select 1 from jsonb_array_elements(places) r where r->>'wikidata_id'=m.wikidata_id);
 update public.people p set status='published' from private.wikidata_listing_people bp where bp.batch_id=publish_wikidata_listing_batch.batch_id and bp.person_id=p.id;
 get diagnostics n=row_count;
 if n<>jsonb_array_length(payload) then raise exception 'Incomplete listing batch';end if;
 return n;
end; $$;
revoke all on function private.publish_wikidata_listing_batch(text,jsonb,jsonb) from public,anon,authenticated;

create function private.withdraw_wikidata_listing_batch(batch_id text) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtext('findthedead-directory-publish'));
 if not exists(select 1 from private.wikidata_listing_batches b where b.id=batch_id and b.status='released') then raise exception 'Released listing batch missing';end if;
 if exists(select 1 from private.wikidata_listing_people bp join public.people p on p.id=bp.person_id where bp.batch_id=withdraw_wikidata_listing_batch.batch_id and p.profile_tier<>'wikidata_listing') then raise exception 'Upgraded listings require review';end if;
 update public.people p set status='draft' from private.wikidata_listing_people bp where bp.batch_id=withdraw_wikidata_listing_batch.batch_id and bp.person_id=p.id;
 get diagnostics n=row_count;
 update private.wikidata_listing_batches b set status='withdrawn' where b.id=withdraw_wikidata_listing_batch.batch_id;
 return n;
end; $$;
revoke all on function private.withdraw_wikidata_listing_batch(text) from public,anon,authenticated;
