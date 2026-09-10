-- Same public parent visibility, evaluated as reusable membership sets rather
-- than a person and cemetery lookup for every burial in a large viewport.
alter policy burials_read on public.burials using (
 person_id in (select p.id from public.people p)
 and (cemetery_id is null or cemetery_id in (select c.id from public.cemeteries c))
);
