-- Existing leagues: run the WHOLE file in Supabase SQL Editor.
-- Adds episode 10 and moves saved final-side predictions from 9 to 10.
-- Keeps player/team names, permissions, picks, timestamps, scores and locks.
-- Safe to rerun. No tables, records or triggers are dropped or deleted.
begin;

-- Match the submission lock so no final pick can arrive midway through the move.
do $$
declare cfg public.league_config;
begin
 select * into cfg from public.league_config where id=1 for update;
 if cfg.id is null then raise exception 'League is not initialised'; end if;
 if jsonb_typeof(cfg.state->'episodes') is distinct from 'array' or jsonb_array_length(cfg.state->'episodes') not in (9,10) then raise exception 'Expected an existing nine- or ten-episode league; no changes made'; end if;
 if exists(select 1 from jsonb_array_elements(cfg.state->'episodes') with ordinality as rounds(value,position) where rounds.value->'number' is distinct from to_jsonb(rounds.position)) then raise exception 'Episode numbers need checking; no changes made'; end if;
 if exists(select 1 from public.league_entries a join public.league_entries b on a.player_id=b.player_id and a.kind='final' and b.kind='final' where a.episode=9 and b.episode=10) then raise exception 'A player has final predictions in both rounds 9 and 10; resolve this before upgrading. No changes made'; end if;
 if exists(select 1 from public.league_entries where kind='final' and episode not in (9,10)) then raise exception 'A final prediction has an unexpected round; no changes made'; end if;
 if jsonb_array_length(cfg.state->'episodes')=9 then
   update public.league_config set state=jsonb_set(state,'{episodes}',state->'episodes'||jsonb_build_array(jsonb_build_object('number',10,'traitors',1,'faithful',3,'locked',false,'roster','{}'::jsonb,'counts','{}'::jsonb))), revision=revision+1 where id=1;
 end if;
 update public.league_entries set episode=10 where kind='final' and episode=9;
end $$;

create or replace function public.save_entry(entry_kind text, episode_number integer, entry_payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid; s jsonb; ep jsonb; picks jsonb; n integer; t integer; f integer; valid integer;
begin
 select id into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me is null then raise exception 'Not a league member'; end if;
 -- This lock serialises submissions against the organiser locking an episode.
 select state into s from public.league_config where id=1 for update;
 if s is null then raise exception 'League is not initialised'; end if;
 if entry_kind not in ('weekly','preseason','final') or entry_kind is null then raise exception 'Invalid entry type'; end if;
 if entry_kind='final' then
   if episode_number is distinct from jsonb_array_length(s->'episodes') or (s->>'finalLocked')::boolean or coalesce(entry_payload->>'side','') not in ('Faithful','Traitors') then raise exception 'Final prediction is locked or invalid'; end if;
   entry_payload := jsonb_build_object('side',entry_payload->>'side');
 else
   picks := entry_payload->'picks';
   if jsonb_typeof(picks) is distinct from 'array' then raise exception 'Picks must be an array'; end if;
   n := jsonb_array_length(picks);
   if n <> (select count(distinct value) from jsonb_array_elements_text(picks)) then raise exception 'Duplicate picks'; end if;
   select count(*) into valid from jsonb_array_elements(s->'characters') c where c->>'id' in (select jsonb_array_elements_text(picks));
   if valid <> n then raise exception 'Unknown celebrity'; end if;
   if entry_kind='preseason' then
     if episode_number is distinct from 1 or n<>3 or (s->>'preseasonLocked')::boolean then raise exception 'Preseason predictions are locked or invalid'; end if;
     entry_payload := jsonb_build_object('picks',picks);
   else
     if episode_number is null or episode_number<1 or episode_number>jsonb_array_length(s->'episodes') then raise exception 'Invalid episode'; end if;
     ep := s->'episodes'->(episode_number-1);
     if ep is null or (ep->>'locked')::boolean then raise exception 'Episode is locked'; end if;
     if episode_number=1 then
       if coalesce((ep->>'teamSize')::integer,0)<1 then raise exception 'Episode 1 teams are not enabled for this league yet'; end if;
       if n<>(ep->>'teamSize')::integer then raise exception 'Wrong episode 1 team size'; end if;
       if exists(select 1 from jsonb_array_elements_text(picks) as picked(celebrity_id) where coalesce(ep->'roster'->picked.celebrity_id->>'status','Active')<>'Active') then raise exception 'Only active celebrities can be drafted'; end if;
     else
     select count(*) filter(where ep->'roster'->value->>'role'='Traitor'), count(*) filter(where ep->'roster'->value->>'role'='Faithful'), count(*) filter(where ep->'roster'->value->>'status'='Active') into t,f,valid from jsonb_array_elements_text(picks);
     if n <> (ep->>'traitors')::integer+(ep->>'faithful')::integer or t<>(ep->>'traitors')::integer or f<>(ep->>'faithful')::integer or valid<>n then raise exception 'Wrong team size, roles or eligibility'; end if;
     end if;
     if coalesce(picks ? (entry_payload->>'captain'),false)=false then raise exception 'Captain must be in the team'; end if;
     entry_payload := jsonb_build_object('picks',picks,'captain',entry_payload->>'captain');
   end if;
 end if;
 insert into public.league_entries(player_id,kind,episode,payload) values(me,entry_kind,episode_number,entry_payload)
 on conflict(player_id,kind,episode) do update set payload=excluded.payload,updated_at=now();
end $$;

create or replace function public.save_league(new_state jsonb, expected_revision integer) returns void language plpgsql security definer set search_path = '' as $$
declare old public.league_config; ep jsonb; e public.league_entries; p text; t integer; f integer; c jsonb; count_value jsonb;
begin
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
 select * into old from public.league_config where id=1 for update;
 if old.revision is distinct from expected_revision then raise exception 'The league changed in another window. Refresh before saving.'; end if;
 if (old.state->>'preseasonLocked')::boolean and new_state->'rules' is distinct from old.state->'rules' then raise exception 'Scoring values are frozen for the season'; end if;
 if jsonb_typeof(new_state->'episodes') is distinct from 'array' or jsonb_array_length(new_state->'episodes')<>jsonb_array_length(old.state->'episodes') then raise exception 'Keep all % episodes in the league', jsonb_array_length(old.state->'episodes'); end if;
 if exists(select 1 from jsonb_array_elements(new_state->'episodes') with ordinality as rounds(value,position) where rounds.value->'number' is distinct from to_jsonb(rounds.position)) then raise exception 'Episodes must stay numbered consecutively from 1'; end if;
 if jsonb_typeof(new_state->'characters') is distinct from 'array' or jsonb_typeof(new_state->'rules') is distinct from 'array' then raise exception 'Missing cast or rules'; end if;
 if new_state->>'winner' not in ('','Faithful','Traitors') then raise exception 'Invalid winner'; end if;
 for ep in select value from jsonb_array_elements(new_state->'episodes') loop
   if ep->>'number'='1' and ep ? 'teamSize' then
     if jsonb_typeof(ep->'teamSize') is distinct from 'number' or (ep->>'teamSize')::numeric<1 or (ep->>'teamSize')::numeric>jsonb_array_length(new_state->'characters') or mod((ep->>'teamSize')::numeric,1)<>0 then raise exception 'Episode 1 team size must be a whole number from 1 to the cast size'; end if;
   end if;
   if (ep->>'traitors')::integer<0 or (ep->>'faithful')::integer<0 then raise exception 'Slot counts cannot be negative'; end if;
   for c in select value from jsonb_each(ep->'counts') loop
     for count_value in select value from jsonb_each(c) loop
       if jsonb_typeof(count_value)<>'number' or count_value::text::numeric<0 or mod(count_value::text::numeric,1)<>0 then raise exception 'Event counts must be whole non-negative numbers'; end if;
     end loop;
   end loop;
 end loop;
 -- Freeze roster and slot requirements as soon as an episode locks. Counts remain correctable.
 for ep in select value from jsonb_array_elements(old.state->'episodes') loop
   if (ep->>'locked')::boolean then
     c := new_state->'episodes'->((ep->>'number')::integer-1);
     if c->'roster' is distinct from ep->'roster' or c->'traitors' is distinct from ep->'traitors' or c->'faithful' is distinct from ep->'faithful' or c->'teamSize' is distinct from ep->'teamSize' or c->>'locked'<>'true' then raise exception 'Locked episode eligibility cannot change'; end if;
   end if;
 end loop;
 if (old.state->>'preseasonLocked')::boolean and not (new_state->>'preseasonLocked')::boolean then raise exception 'Preseason cannot be reopened'; end if;
 if (old.state->>'finalLocked')::boolean and not (new_state->>'finalLocked')::boolean then raise exception 'Final picks cannot be reopened'; end if;
 -- A roster edit must not silently invalidate an already submitted team.
 for e in select * from public.league_entries where kind='weekly' loop
   ep := new_state->'episodes'->(e.episode-1); t:=0; f:=0;
   if e.episode=1 then
     if coalesce((ep->>'teamSize')::integer,0)<>jsonb_array_length(e.payload->'picks') then raise exception 'Episode 1 team size would invalidate a submitted team'; end if;
     for p in select jsonb_array_elements_text(e.payload->'picks') loop
       if not exists(select 1 from jsonb_array_elements(new_state->'characters') as cast_member(value) where cast_member.value->>'id'=p) or coalesce(ep->'roster'->p->>'status','Active')<>'Active' then raise exception 'Roster change would invalidate a submitted team'; end if;
     end loop;
     continue;
   end if;
   for p in select jsonb_array_elements_text(e.payload->'picks') loop
     if coalesce(ep->'roster'->p->>'status','')<>'Active' then raise exception 'Roster change would invalidate a submitted team'; end if;
     if ep->'roster'->p->>'role'='Traitor' then t:=t+1; elsif ep->'roster'->p->>'role'='Faithful' then f:=f+1; end if;
   end loop;
   if t<>(ep->>'traitors')::integer or f<>(ep->>'faithful')::integer then raise exception 'Slot or role change would invalidate a submitted team'; end if;
 end loop;
 update public.league_config set state=new_state, revision=revision+1 where id=1;
end $$;

revoke all on function public.save_entry(text,integer,jsonb), public.save_league(jsonb,integer) from public, anon;
grant execute on function public.save_entry(text,integer,jsonb), public.save_league(jsonb,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
