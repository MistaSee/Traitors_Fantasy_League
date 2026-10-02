-- Opening reveal supplied by the organiser, 2 October 2026.
-- Leaves James Acaster and Amol Rajan unresolved. Does not alter picks or episode rosters.
-- Only fills Unknown starting roles, so rerunning cannot overwrite later reveals.
begin;
do $$
declare s jsonb; original jsonb; c record; role_name text;
begin
 select state into s from public.league_config where id=1 for update;
 original := s;
 if (select count(*) from jsonb_array_elements(s->'characters') value where value->>'name' in ('Richard E. Grant','Maya Jama','James Acaster','Amol Rajan'))<>4 then raise exception 'The expected cast was not found'; end if;
 for c in select value,position from jsonb_array_elements(s->'characters') with ordinality as cast_members(value,position) loop
   if c.value->>'startingRole'='Unknown' and c.value->>'name' not in ('James Acaster','Amol Rajan') then
     role_name := case when c.value->>'name' in ('Richard E. Grant','Maya Jama') then 'Traitor' else 'Faithful' end;
     s := jsonb_set(s,array['characters',(c.position-1)::text,'startingRole'],to_jsonb(role_name));
   end if;
 end loop;
 if s is distinct from original then update public.league_config set state=s,revision=revision+1 where id=1; end if;
end $$;
commit;
