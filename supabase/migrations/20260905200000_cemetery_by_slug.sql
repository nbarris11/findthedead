-- The cemetery profile page needs the cemetery's own coordinate (for its
-- map), not a person's effective discovery point. cemeteries_in_bounds
-- already does this ST_Y/ST_X extraction for a bounding box; this is the
-- same thing keyed by slug instead.
create function public.cemetery_by_slug(p_slug text)
returns table (
  id uuid, slug text, name text, description text, city text, state text,
  country text, website_url text, latitude double precision, longitude double precision
) language sql stable security invoker set search_path = '' as $$
  select c.id, c.slug, c.name, c.description, c.city, c.state, c.country, c.website_url,
    extensions.st_y(c.location::extensions.geometry), extensions.st_x(c.location::extensions.geometry)
  from public.cemeteries c
  where c.slug = p_slug and c.status = 'published' and not c.is_fixture;
$$;
revoke execute on function public.cemetery_by_slug(text) from public;
grant execute on function public.cemetery_by_slug(text) to anon, authenticated, service_role;
