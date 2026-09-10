-- Count every public record; limits apply only to detail pages, never map totals.
create function public.map_candidates(west double precision,south double precision,east double precision,north double precision,min_score integer default 0,category_slug text default null)
returns table(id uuid,longitude double precision,latitude double precision)
language plpgsql stable security invoker set search_path='' as $$
begin
 if min_score is null or min_score not between 0 and 100 then raise exception 'Invalid score' using errcode='22023'; end if;
 perform public.query_envelopes(west,south,east,north);
 return query with envelopes as materialized (select public.query_envelopes(west,south,east,north) geom), points as (
 select b.person_id,b.location point from public.burials b where b.is_primary and b.location is not null and exists(select 1 from envelopes e where b.location::extensions.geometry operator(extensions.&&) e.geom)
 union all
 select b.person_id,c.location from public.cemeteries c join public.burials b on b.cemetery_id=c.id where b.is_primary and b.location is null and exists(select 1 from envelopes e where c.location::extensions.geometry operator(extensions.&&) e.geom)
 ) select p.id,extensions.st_x(x.point::extensions.geometry),extensions.st_y(x.point::extensions.geometry)
 from points x join public.people p on p.id=x.person_id
 where p.status='published' and not p.is_fixture and p.dead_score>=min_score
 and (category_slug is null or exists(select 1 from public.person_categories pc join public.categories cat on cat.id=pc.category_id where pc.person_id=p.id and cat.slug=category_slug));
end; $$;

create function public.map_summary(west double precision,south double precision,east double precision,north double precision,min_score integer default 0,category_slug text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with points as (select * from public.map_candidates(west,south,east,north,min_score,category_slug)),
 bins as (
 select count(*)::integer count,avg(longitude) longitude,avg(latitude) latitude,min(longitude) west,max(longitude) east,min(latitude) south,max(latitude) north
 from points group by floor((longitude+180)/greatest((case when east>=west then east-west else 360-west+east end)/48,0.000001)),floor((latitude+90)/greatest((north-south)/32,0.000001))
 ) select jsonb_build_object('total',coalesce(sum(count),0),'points',coalesce(jsonb_agg(to_jsonb(bins)),'[]'::jsonb)) from bins;
$$;

create function public.map_people_page(west double precision,south double precision,east double precision,north double precision,min_score integer default 0,category_slug text default null,after_id uuid default null)
returns setof public.discovery_people language sql stable security invoker set search_path='' as $$
 with page as (select id from public.map_candidates(west,south,east,north,min_score,category_slug) where after_id is null or id>after_id order by id limit 51)
 select d.* from page join public.discovery_people d on d.id=page.id order by d.id;
$$;
revoke all on function public.map_candidates(double precision,double precision,double precision,double precision,integer,text) from public;
revoke all on function public.map_summary(double precision,double precision,double precision,double precision,integer,text) from public;
revoke all on function public.map_people_page(double precision,double precision,double precision,double precision,integer,text,uuid) from public;
grant execute on function public.map_candidates(double precision,double precision,double precision,double precision,integer,text) to anon,authenticated,service_role;
grant execute on function public.map_summary(double precision,double precision,double precision,double precision,integer,text) to anon,authenticated,service_role;
grant execute on function public.map_people_page(double precision,double precision,double precision,double precision,integer,text,uuid) to anon,authenticated,service_role;
