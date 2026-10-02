-- Add the recruitment bonus without changing picks, counts, rosters or locks.
-- Safe to rerun; existing custom values for this event are retained.
begin;
lock table public.league_config in share row exclusive mode;
update public.league_config
set state=jsonb_set(state,'{rules}',(state->'rules') || $rule$[{"id": "FAITHFUL_RECRUITED", "category": "Faithful", "role": "Faithful", "label": "Faithful accepts recruitment to the Traitors", "points": 10, "notes": "Enter 1 for the recruit in the episode they accept and become a Traitor; once per celebrity per season. No points for an offer, refusal or original Traitor selection. Update their role for the next episode; keep this episode’s draft roster unchanged."}]$rule$::jsonb),
 revision=revision+1
where not exists (select 1 from jsonb_array_elements(state->'rules') rule where rule->>'id'='FAITHFUL_RECRUITED');
commit;
