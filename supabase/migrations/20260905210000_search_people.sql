-- Performant person search over the people_name_search GIN index from the
-- foundation migration (gin(to_tsvector('simple', name))). Each
-- whitespace-separated word in the query becomes a prefix term, ANDed
-- together, so a visitor typing "aret fran" matches "Aretha Franklin"
-- before they finish typing either word. Tsquery-special characters are
-- stripped from each word first so arbitrary punctuation in a search box
-- can never throw a tsquery syntax error back at the visitor.
create function public.search_people(q text, result_limit integer default 20)
returns setof public.discovery_people language plpgsql stable security invoker set search_path = '' as $$
declare tsq tsquery;
begin
  if q is null or length(trim(q)) = 0 then
    raise exception 'Search query must not be empty' using errcode='22023';
  end if;
  if result_limit is null or not result_limit between 1 and 50 then
    raise exception 'Invalid result limit' using errcode='22023';
  end if;
  select to_tsquery('simple', string_agg(w || ':*', ' & '))
    into tsq
  from (
    select regexp_replace(lexeme, '[^a-z0-9]', '', 'g') as w
    from unnest(regexp_split_to_array(lower(trim(q)), '\s+')) as lexeme
  ) words
  where length(w) > 0;
  if tsq is null then
    raise exception 'Search query must contain at least one word character' using errcode='22023';
  end if;
  return query
  select d.* from public.discovery_people d
  where to_tsvector('simple', d.name) @@ tsq
  order by ts_rank(to_tsvector('simple', d.name), tsq) desc, d.dead_score desc, d.id
  limit result_limit;
end;
$$;
revoke execute on function public.search_people(text, integer) from public;
grant execute on function public.search_people(text, integer) to anon, authenticated, service_role;
