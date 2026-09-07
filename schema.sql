-- Run once in the Supabase SQL editor. All application access is through RPCs.
create table public.league_config (id integer primary key check(id=1), state jsonb not null, revision integer not null default 0);
create table public.league_players (id uuid primary key default gen_random_uuid(), email text unique not null check(email=lower(email)), name text not null, is_admin boolean not null default false);
create table public.league_entries (player_id uuid references public.league_players(id), kind text check(kind in ('weekly','preseason','final')), episode integer not null, payload jsonb not null, updated_at timestamptz not null default now(), primary key(player_id,kind,episode));
alter table public.league_config enable row level security;
alter table public.league_players enable row level security;
alter table public.league_entries enable row level security;
revoke all on public.league_config, public.league_players, public.league_entries from anon, authenticated;

create function public.read_league() returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.league_players; cfg public.league_config; result jsonb;
begin
 select * into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me.id is null then raise exception 'Your email is not on this league. Ask the organiser to add it.'; end if;
 select * into cfg from public.league_config where id=1;
 select jsonb_build_object('state',cfg.state,'revision',cfg.revision,'me',jsonb_build_object('id',me.id,'name',me.name,'is_admin',me.is_admin),
 'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'email',case when me.is_admin then email else null end)),'[]'::jsonb) from public.league_players),
 'entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.league_entries e where e.player_id=me.id or
   (e.kind='preseason' and (cfg.state->>'preseasonLocked')::boolean) or
   (e.kind='final' and (cfg.state->>'finalLocked')::boolean) or
   (e.kind='weekly' and (cfg.state->'episodes'->(e.episode-1)->>'locked')::boolean))) into result;
 return result;
end $$;

create function public.save_entry(entry_kind text, episode_number integer, entry_payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid; s jsonb; ep jsonb; picks jsonb; n integer; t integer; f integer; valid integer;
begin
 select id into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me is null then raise exception 'Not a league member'; end if;
 -- This lock serialises submissions against the organiser locking an episode.
 select state into s from public.league_config where id=1 for update;
 if s is null then raise exception 'League is not initialised'; end if;
 if entry_kind not in ('weekly','preseason','final') or entry_kind is null then raise exception 'Invalid entry type'; end if;
 if entry_kind='final' then
   if episode_number is distinct from 9 or (s->>'finalLocked')::boolean or coalesce(entry_payload->>'side','') not in ('Faithful','Traitors') then raise exception 'Final prediction is locked or invalid'; end if;
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
     if episode_number is null or episode_number<2 or episode_number>9 then raise exception 'Invalid episode'; end if;
     ep := s->'episodes'->(episode_number-1);
     if ep is null or (ep->>'locked')::boolean then raise exception 'Episode is locked'; end if;
     select count(*) filter(where ep->'roster'->value->>'role'='Traitor'), count(*) filter(where ep->'roster'->value->>'role'='Faithful'), count(*) filter(where ep->'roster'->value->>'status'='Active') into t,f,valid from jsonb_array_elements_text(picks);
     if n <> (ep->>'traitors')::integer+(ep->>'faithful')::integer or t<>(ep->>'traitors')::integer or f<>(ep->>'faithful')::integer or valid<>n then raise exception 'Wrong team size, roles or eligibility'; end if;
     if coalesce(picks ? (entry_payload->>'captain'),false)=false then raise exception 'Captain must be in the team'; end if;
     entry_payload := jsonb_build_object('picks',picks,'captain',entry_payload->>'captain');
   end if;
 end if;
 insert into public.league_entries(player_id,kind,episode,payload) values(me,entry_kind,episode_number,entry_payload)
 on conflict(player_id,kind,episode) do update set payload=excluded.payload,updated_at=now();
end $$;

create function public.save_league(new_state jsonb, expected_revision integer) returns void language plpgsql security definer set search_path = '' as $$
declare old public.league_config; ep jsonb; e public.league_entries; p text; t integer; f integer; c jsonb; count_value jsonb;
begin
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
 select * into old from public.league_config where id=1 for update;
 if old.revision is distinct from expected_revision then raise exception 'The league changed in another window. Refresh before saving.'; end if;
 if (old.state->>'preseasonLocked')::boolean and new_state->'rules' is distinct from old.state->'rules' then raise exception 'Scoring values are frozen for the season'; end if;
 if jsonb_typeof(new_state->'episodes') is distinct from 'array' or jsonb_array_length(new_state->'episodes')<>9 then raise exception 'Nine episodes required'; end if;
 if jsonb_typeof(new_state->'characters') is distinct from 'array' or jsonb_typeof(new_state->'rules') is distinct from 'array' then raise exception 'Missing cast or rules'; end if;
 if new_state->>'winner' not in ('','Faithful','Traitors') then raise exception 'Invalid winner'; end if;
 for ep in select value from jsonb_array_elements(new_state->'episodes') loop
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
     if c->'roster' is distinct from ep->'roster' or c->'traitors' is distinct from ep->'traitors' or c->'faithful' is distinct from ep->'faithful' or c->>'locked'<>'true' then raise exception 'Locked episode eligibility cannot change'; end if;
   end if;
 end loop;
 if (old.state->>'preseasonLocked')::boolean and not (new_state->>'preseasonLocked')::boolean then raise exception 'Preseason cannot be reopened'; end if;
 if (old.state->>'finalLocked')::boolean and not (new_state->>'finalLocked')::boolean then raise exception 'Final picks cannot be reopened'; end if;
 -- A roster edit must not silently invalidate an already submitted team.
 for e in select * from public.league_entries where kind='weekly' loop
   ep := new_state->'episodes'->(e.episode-1); t:=0; f:=0;
   for p in select jsonb_array_elements_text(e.payload->'picks') loop
     if coalesce(ep->'roster'->p->>'status','')<>'Active' then raise exception 'Roster change would invalidate a submitted team'; end if;
     if ep->'roster'->p->>'role'='Traitor' then t:=t+1; elsif ep->'roster'->p->>'role'='Faithful' then f:=f+1; end if;
   end loop;
   if t<>(ep->>'traitors')::integer or f<>(ep->>'faithful')::integer then raise exception 'Slot or role change would invalidate a submitted team'; end if;
 end loop;
 update public.league_config set state=new_state, revision=revision+1 where id=1;
end $$;

create function public.export_league() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.league_players where email=lower(auth.jwt()->>'email') and is_admin and auth.uid() is not null) then raise exception 'Organiser access required'; end if;
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
