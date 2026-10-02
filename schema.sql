-- Run once in the Supabase SQL editor. All application access is through RPCs.
create table public.league_config (id integer primary key check(id=1), state jsonb not null, revision integer not null default 0);
create table public.league_players (id uuid primary key default gen_random_uuid(), email text unique not null check(email=lower(email)), name text not null, team_name text check(team_name is null or (team_name=btrim(team_name) and char_length(team_name) between 1 and 80)), is_admin boolean not null default false);
create table public.league_entries (player_id uuid references public.league_players(id), kind text check(kind in ('weekly','preseason','final')), episode integer not null, payload jsonb not null, updated_at timestamptz not null default now(), primary key(player_id,kind,episode));
alter table public.league_config enable row level security;
alter table public.league_players enable row level security;
alter table public.league_entries enable row level security;
revoke all on public.league_config, public.league_players, public.league_entries from anon, authenticated;

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

create trigger remove_retired_scoring_on_write before insert or update of state on public.league_config
for each row execute function public.remove_retired_scoring_on_write();

-- Deadlines are evaluated after acquiring the configuration lock. No scheduler is needed.
create or replace function public.with_broadcast_locks(s jsonb, at_time timestamptz) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare ep record;
begin
 for ep in select value, position from jsonb_array_elements(s->'episodes') with ordinality as rounds(value,position) loop
   if nullif(ep.value->>'deadline','')::timestamptz <= at_time then
     s := jsonb_set(s,array['episodes',(ep.position-1)::text,'locked'],'true');
   end if;
 end loop;
 if nullif(s->'episodes'->0->>'deadline','')::timestamptz <= at_time then s := jsonb_set(s,'{preseasonLocked}','true'); end if;
 if nullif(s->'episodes'->(jsonb_array_length(s->'episodes')-1)->>'deadline','')::timestamptz <= at_time then s := jsonb_set(s,'{finalLocked}','true'); end if;
 return s;
end $$;
revoke all on function public.with_broadcast_locks(jsonb,timestamptz) from public, anon, authenticated;

-- Original picks arrays are stored in click order. Use A–Z only for explicitly missing or invalid order.
create or replace function public.carried_team(s jsonb, episode_number integer, previous_payload jsonb, previous_episode integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare ep jsonb := s->'episodes'->(episode_number-1); ordered jsonb; kept jsonb := '[]'; pick text; role_name text; t integer := 0; f integer := 0; neutral boolean; captain text;
begin
 if previous_payload is null then return null; end if;
 neutral := episode_number=1 or coalesce((ep->>'roleNeutral')::boolean,false);
 ordered := case when previous_payload ? 'selectionOrder' then previous_payload->'selectionOrder' else previous_payload->'picks' end;
 if jsonb_typeof(ordered) is distinct from 'array' then ordered := null;
 elsif jsonb_array_length(ordered)<>jsonb_array_length(previous_payload->'picks')
   or (select count(distinct value) from jsonb_array_elements_text(ordered))<>jsonb_array_length(ordered)
   or exists(select 1 from jsonb_array_elements_text(ordered) where not (previous_payload->'picks' ? value)) then ordered := null; end if;
 if ordered is null then
   select coalesce(jsonb_agg(id order by name collate "C", id collate "C"),'[]') into ordered
   from (select picked.id,coalesce((select c->>'name' from jsonb_array_elements(s->'characters') c where c->>'id'=picked.id),picked.id) as name from jsonb_array_elements_text(previous_payload->'picks') picked(id)) names;
 end if;
 for pick in select jsonb_array_elements_text(ordered) loop
   if not exists(select 1 from jsonb_array_elements(s->'characters') c where c->>'id'=pick) then continue; end if;
   if coalesce(ep->'roster'->pick->>'status',case when neutral then 'Active' else '' end)<>'Active' then continue; end if;
   role_name := ep->'roster'->pick->>'role';
   if neutral then
     if jsonb_array_length(kept)<coalesce((ep->>'teamSize')::integer,0) then kept := kept || to_jsonb(pick); end if;
   elsif role_name='Traitor' and t<(ep->>'traitors')::integer then kept := kept || to_jsonb(pick); t := t+1;
   elsif role_name='Faithful' and f<(ep->>'faithful')::integer then kept := kept || to_jsonb(pick); f := f+1;
   end if;
 end loop;
 captain := case when kept ? (previous_payload->>'captain') then previous_payload->>'captain' else kept->>0 end;
 return jsonb_build_object('picks',kept,'captain',captain,'selectionOrder',kept,'autoCarried',true,'carriedFrom',previous_episode);
end $$;
revoke all on function public.carried_team(jsonb,integer,jsonb,integer) from public, anon, authenticated;

create or replace function public.carry_locked_teams(s jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare ep jsonb; n integer;
begin
 if s->>'broadcastScheduleVersion' is distinct from '1' then return; end if;
 -- In episode order: a player can miss several rounds without signing in.
 for ep in select value from jsonb_array_elements(s->'episodes') order by (value->>'number')::integer loop
   n := (ep->>'number')::integer;
   if n>1 and (ep->>'locked')::boolean then
     insert into public.league_entries(player_id,kind,episode,payload,updated_at)
       select e.player_id,'weekly',n,public.carried_team(s,n,e.payload,n-1),clock_timestamp()
       from public.league_entries e where e.kind='weekly' and e.episode=n-1
       on conflict(player_id,kind,episode) do nothing;
   end if;
 end loop;
end $$;
revoke all on function public.carry_locked_teams(jsonb) from public, anon, authenticated;

create or replace function public.lock_due_rounds() returns void
language plpgsql security definer set search_path = '' as $$
declare current_state jsonb; locked_state jsonb;
begin
 select state into current_state from public.league_config where id=1 for update;
 if current_state is null then return; end if;
 locked_state := public.with_broadcast_locks(current_state,clock_timestamp());
 if locked_state is distinct from current_state then
   update public.league_config set state=locked_state, revision=revision+1 where id=1;
 end if;
 perform public.carry_locked_teams(locked_state);
end $$;
revoke all on function public.lock_due_rounds() from public, anon, authenticated;

-- Review metadata only: no other player's open picks are disclosed here.
create or replace function public.draft_review(s jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e record; ep jsonb; cutoff timestamptz; issues text[]; result jsonb := '[]'; n integer; valid integer; t integer; f integer;
begin
 for e in select le.*,lp.name from public.league_entries le join public.league_players lp on lp.id=le.player_id order by le.kind,le.episode,lp.name loop
   ep := s->'episodes'->(case when e.kind='preseason' then 0 when e.kind='final' then jsonb_array_length(s->'episodes')-1 else e.episode-1 end);
   cutoff := nullif(ep->>'deadline','')::timestamptz; issues := '{}';
   if e.updated_at>=cutoff and coalesce(e.payload->>'autoCarried','false')<>'true' then issues := array_append(issues,'Last saved at or after the broadcast deadline'); end if;
   if e.kind='weekly' then
     n := jsonb_array_length(e.payload->'picks');
     select count(*) filter(where c->>'id' is not null and coalesce(ep->'roster'->id->>'status',case when e.episode=1 or ep->>'roleNeutral'='true' then 'Active' else '' end)='Active'),
       count(*) filter(where ep->'roster'->id->>'role'='Traitor'), count(*) filter(where ep->'roster'->id->>'role'='Faithful')
       into valid,t,f from jsonb_array_elements_text(e.payload->'picks') picked(id)
       left join jsonb_array_elements(s->'characters') c on c->>'id'=id;
     if n<>(select count(distinct value) from jsonb_array_elements_text(e.payload->'picks')) or valid<>n or not coalesce(e.payload->'picks' ? (e.payload->>'captain'),false)
       or (case when e.episode=1 or ep->>'roleNeutral'='true' then n is distinct from (ep->>'teamSize')::integer else n is distinct from (ep->>'traitors')::integer+(ep->>'faithful')::integer or t is distinct from (ep->>'traitors')::integer or f is distinct from (ep->>'faithful')::integer end)
       then issues := array_append(issues,case when e.payload->>'autoCarried'='true' then 'Carried team has unfilled places; retained picks still score' else 'Saved team does not match this episode’s current requirements' end); end if;
   end if;
   if cardinality(issues)>0 then result := result || jsonb_build_array(jsonb_build_object('player_id',e.player_id,'name',e.name,'kind',e.kind,'episode',e.episode,'updated_at',e.updated_at,'issues',issues)); end if;
 end loop;
 return result;
end $$;
revoke all on function public.draft_review(jsonb) from public, anon, authenticated;

create function public.read_league() returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.league_players; cfg public.league_config; result jsonb;
begin
 select * into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me.id is null then raise exception 'Your email is not on this league. Ask the organiser to add it.'; end if;
 perform public.lock_due_rounds();
 -- Also cover late arrivals and installations upgraded after episode 1 locked.
 perform public.assign_default_team_names();
 select * into me from public.league_players where id=me.id;
 select * into cfg from public.league_config where id=1;
 select jsonb_build_object('state',cfg.state,'revision',cfg.revision,'serverNow',case when cfg.state->>'broadcastScheduleVersion'='1' then clock_timestamp() else null end,'review',case when me.is_admin then public.draft_review(cfg.state) else '[]'::jsonb end,'me',jsonb_build_object('id',me.id,'name',me.name,'team_name',me.team_name,'is_admin',me.is_admin),
 'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'team_name',team_name,'email',case when me.is_admin then email else null end,'is_admin',is_admin)),'[]'::jsonb) from public.league_players),
 'entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.league_entries e where e.player_id=me.id or
   (e.kind='preseason' and (cfg.state->>'preseasonLocked')::boolean) or
   (e.kind='final' and (cfg.state->>'finalLocked')::boolean) or
   (e.kind='weekly' and (cfg.state->'episodes'->(e.episode-1)->>'locked')::boolean))) into result;
 return result;
end $$;

-- Naming is optional. Assign defaults when episode 1 locks; never touch picks.
create or replace function public.assign_default_team_names() returns void
language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.league_config where id=1 and (state->'episodes'->0->>'locked')::boolean) then
   update public.league_players set team_name=left(name,63)||'’s Secret Society' where team_name is null;
 end if;
end $$;
revoke all on function public.assign_default_team_names() from public, anon, authenticated;

create or replace function public.team_names_on_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform public.assign_default_team_names();
 return new;
end $$;
revoke all on function public.team_names_on_lock() from public, anon, authenticated;
drop trigger if exists team_names_on_lock on public.league_config;
create trigger team_names_on_lock after insert or update of state on public.league_config
for each row execute function public.team_names_on_lock();

create function public.save_entry(entry_kind text, episode_number integer, entry_payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid; s jsonb; ep jsonb; picks jsonb; n integer; t integer; f integer; valid integer;
begin
 select id into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me is null then raise exception 'Not a league member'; end if;
 -- This lock serialises submissions against the organiser locking an episode.
 select state into s from public.league_config where id=1 for update;
 s := public.with_broadcast_locks(s,clock_timestamp());
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
     if episode_number=1 or ep->>'roleNeutral'='true' then
       if coalesce((ep->>'teamSize')::integer,0)<1 then raise exception 'Episode 1 teams are not enabled for this league yet'; end if;
       if n<>(ep->>'teamSize')::integer then raise exception 'Wrong role-neutral team size'; end if;
       if exists(select 1 from jsonb_array_elements_text(picks) as picked(celebrity_id) where coalesce(ep->'roster'->picked.celebrity_id->>'status','Active')<>'Active') then raise exception 'Only active celebrities can be drafted'; end if;
     else
     select count(*) filter(where ep->'roster'->value->>'role'='Traitor'), count(*) filter(where ep->'roster'->value->>'role'='Faithful'), count(*) filter(where ep->'roster'->value->>'status'='Active') into t,f,valid from jsonb_array_elements_text(picks);
     if n <> (ep->>'traitors')::integer+(ep->>'faithful')::integer or t<>(ep->>'traitors')::integer or f<>(ep->>'faithful')::integer or valid<>n then raise exception 'Wrong team size, roles or eligibility'; end if;
     end if;
     if coalesce(picks ? (entry_payload->>'captain'),false)=false then raise exception 'Captain must be in the team'; end if;
     entry_payload := jsonb_build_object('picks',picks,'captain',entry_payload->>'captain');
     if s->>'broadcastScheduleVersion'='1' then entry_payload := entry_payload || jsonb_build_object('selectionOrder',picks); end if;
   end if;
 end if;
 -- Check again at the write, using wall time rather than transaction-start time.
 if (public.with_broadcast_locks(s,clock_timestamp())->'episodes'->(episode_number-1)->>'locked')::boolean and entry_kind='weekly'
   or entry_kind='preseason' and (public.with_broadcast_locks(s,clock_timestamp())->>'preseasonLocked')::boolean
   or entry_kind='final' and (public.with_broadcast_locks(s,clock_timestamp())->>'finalLocked')::boolean then raise exception 'Broadcast deadline reached. Picks are locked.'; end if;
 insert into public.league_entries(player_id,kind,episode,payload,updated_at) values(me,entry_kind,episode_number,entry_payload,clock_timestamp())
 on conflict(player_id,kind,episode) do update set payload=excluded.payload,updated_at=excluded.updated_at;
end $$;

create function public.save_league(new_state jsonb, expected_revision integer) returns void language plpgsql security definer set search_path = '' as $$
declare old public.league_config; ep jsonb; e public.league_entries; p text; t integer; f integer; c jsonb; count_value jsonb;
begin
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
 select * into old from public.league_config where id=1 for update;
 if old.revision is distinct from expected_revision then raise exception 'The league changed in another window. Refresh before saving.'; end if;
 old.state := public.with_broadcast_locks(old.state,clock_timestamp());
 new_state := public.with_broadcast_locks(new_state,clock_timestamp());
 if new_state->'broadcastScheduleVersion' is distinct from old.state->'broadcastScheduleVersion' then raise exception 'Refresh to use the current broadcast schedule'; end if;
 for ep in select value from jsonb_array_elements(old.state->'episodes') loop
   c := new_state->'episodes'->((ep->>'number')::integer-1);
   if c->'deadline' is distinct from ep->'deadline' or c->'roleNeutral' is distinct from ep->'roleNeutral' then raise exception 'Broadcast deadlines and round format cannot change from the app'; end if;
 end loop;
 if (old.state->>'preseasonLocked')::boolean and new_state->'rules' is distinct from old.state->'rules' then raise exception 'Scoring values are frozen for the season'; end if;
 if jsonb_typeof(new_state->'episodes') is distinct from 'array' or jsonb_array_length(new_state->'episodes')<>jsonb_array_length(old.state->'episodes') then raise exception 'Keep all % episodes in the league', jsonb_array_length(old.state->'episodes'); end if;
 if exists(select 1 from jsonb_array_elements(new_state->'episodes') with ordinality as rounds(value,position) where rounds.value->'number' is distinct from to_jsonb(rounds.position)) then raise exception 'Episodes must stay numbered consecutively from 1'; end if;
 if jsonb_typeof(new_state->'characters') is distinct from 'array' or jsonb_typeof(new_state->'rules') is distinct from 'array' then raise exception 'Missing cast or rules'; end if;
 if new_state->>'winner' not in ('','Faithful','Traitors') then raise exception 'Invalid winner'; end if;
 for ep in select value from jsonb_array_elements(new_state->'episodes') loop
   if (ep->>'number'='1' or ep->>'roleNeutral'='true') and ep ? 'teamSize' then
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
   -- Preserve any legacy exception when neither eligibility nor the cast changed.
   if ep - 'counts' - 'locked' is not distinct from (old.state->'episodes'->(e.episode-1)) - 'counts' - 'locked'
     and (select jsonb_agg(value->'id') from jsonb_array_elements(new_state->'characters')) is not distinct from (select jsonb_agg(value->'id') from jsonb_array_elements(old.state->'characters')) then continue; end if;
   if e.episode=1 or ep->>'roleNeutral'='true' then
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
 if public.with_broadcast_locks(old.state,clock_timestamp()) is distinct from old.state then raise exception 'A broadcast deadline was reached. Refresh before saving.'; end if;
 update public.league_config set state=new_state, revision=revision+1 where id=1;
 perform public.carry_locked_teams(new_state);
end $$;

create function public.export_league() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
 perform public.lock_due_rounds();
 return jsonb_build_object('config',(select to_jsonb(c) from public.league_config c where id=1),'players',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.league_players p),'entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.league_entries e));
end $$;
revoke all on function public.export_league() from public, anon;
grant execute on function public.export_league() to authenticated;

create function public.add_player(player_email text, player_name text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
 if length(trim(player_name))<1 or length(player_name)>80 or player_email not like '%@%.%' then raise exception 'Enter a name and valid email'; end if;
 insert into public.league_players(email,name) values(lower(trim(player_email)),trim(player_name));
end $$;

revoke all on function public.read_league(), public.save_entry(text,integer,jsonb), public.save_league(jsonb,integer), public.add_player(text,text) from public, anon;
grant execute on function public.read_league(), public.save_entry(text,integer,jsonb), public.save_league(jsonb,integer), public.add_player(text,text) to authenticated;

create or replace function public.set_player_organiser(target_player_id uuid, organiser boolean) returns void language plpgsql security definer set search_path = '' as $$
declare target public.league_players;
begin
 -- Serialise role changes so concurrent demotions cannot remove every organiser.
 perform 1 from public.league_config where id=1 for update;
 if not found then raise exception 'League is not initialised'; end if;
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
 if organiser is null then raise exception 'Choose Player or Organiser'; end if;
 select * into target from public.league_players where id=target_player_id;
 if target.id is null then raise exception 'Player not found'; end if;
 if target.is_admin and not organiser and (select count(*) from public.league_players where is_admin)<=1 then
   raise exception 'The league must keep at least one organiser';
 end if;
 update public.league_players set is_admin=organiser where id=target_player_id;
end $$;
revoke all on function public.set_player_organiser(uuid,boolean) from public, anon;
grant execute on function public.set_player_organiser(uuid,boolean) to authenticated;

-- Players can rename only their own team, including after episode 1 locks.
create or replace function public.set_team_name(new_team_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare player_id uuid; chosen_name text;
begin
 select id into player_id from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if player_id is null then raise exception 'Not a league member'; end if;
 chosen_name := nullif(btrim(new_team_name),'');
 if char_length(chosen_name)>80 then raise exception 'Use a team name of 80 characters or fewer'; end if;
 update public.league_players set team_name=chosen_name where id=player_id;
 return public.read_league();
end $$;
revoke all on function public.set_team_name(text) from public, anon;
grant execute on function public.set_team_name(text) to authenticated;

-- Verified players can register themselves without organiser permissions.
create or replace function public.join_league(player_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare member_email text; display_name text;
begin
 if auth.uid() is null then raise exception 'Sign in and verify your email before joining'; end if;
 -- Identity comes from Supabase, never from a supplied email or user metadata.
 select lower(trim(email)) into member_email from auth.users
 where id=auth.uid() and email_confirmed_at is not null;
 if member_email is null or member_email='' or member_email is distinct from lower(auth.jwt()->>'email') then
   raise exception 'Sign in and verify your email before joining';
 end if;
 if not exists(select 1 from public.league_config where id=1) then raise exception 'League is not initialised'; end if;
 -- A retry or an organiser adding this email must retain that player's identity.
 if exists(select 1 from public.league_players where email=member_email) then
   return public.read_league();
 end if;
 display_name := trim(player_name);
 if display_name is null or char_length(display_name)<1 or char_length(display_name)>80 then
   raise exception 'Choose a league name between 1 and 80 characters';
 end if;
 insert into public.league_players(email,name,is_admin)
 values(member_email,display_name,false)
 on conflict(email) do nothing;
 return public.read_league();
end $$;

revoke all on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;
notify pgrst, 'reload schema';
