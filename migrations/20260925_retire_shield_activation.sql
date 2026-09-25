-- Existing leagues: run the WHOLE file in the Supabase SQL Editor.
-- Only the retired rule and its event counts are removed. Other points,
-- player entries, identities, rosters, names and locks remain intact.
-- Safe to rerun; a changed league revision makes stale organiser tabs refresh.
begin;
lock table public.league_config in share row exclusive mode;

-- Remove only the retired scoring event, preserving all other league settings.
create or replace function public.without_retired_scoring(s jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare ep record; celebrity record;
begin
 s := jsonb_set(s, '{rules}', (select coalesce(jsonb_agg(value order by position),'[]'::jsonb)
   from jsonb_array_elements(s->'rules') with ordinality as rules(value,position)
   where value->>'id' is distinct from 'SHIELD_USED'));
 for ep in select value, position from jsonb_array_elements(s->'episodes') with ordinality as rounds(value,position) loop
   for celebrity in select key, value from jsonb_each(ep.value->'counts') loop
     if celebrity.value ? 'SHIELD_USED' then
       s := jsonb_set(s, array['episodes',(ep.position-1)::text,'counts',celebrity.key], celebrity.value - 'SHIELD_USED');
     end if;
   end loop;
 end loop;
 return s;
end $$;
revoke all on function public.without_retired_scoring(jsonb) from public, anon, authenticated;

create or replace function public.remove_retired_scoring_on_write() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.state := public.without_retired_scoring(new.state);
 return new;
end $$;
revoke all on function public.remove_retired_scoring_on_write() from public, anon, authenticated;

-- Install once without dropping an existing trigger on repeat runs.
do $$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.league_config'::regclass and tgname='remove_retired_scoring_on_write' and not tgisinternal) then
   create trigger remove_retired_scoring_on_write before insert or update of state on public.league_config
   for each row execute function public.remove_retired_scoring_on_write();
   
 end if;
end $$;

update public.league_config
set state=public.without_retired_scoring(state), revision=revision+1
where state is distinct from public.without_retired_scoring(state);
commit;
