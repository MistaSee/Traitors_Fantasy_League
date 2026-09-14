-- Existing leagues: run this WHOLE file once in Supabase SQL Editor.
-- Safe to rerun. Includes self-registration if that earlier upgrade is pending.
-- Preserves player names/IDs, picks, scores, locks and organiser permissions.
begin;
alter table public.league_players add column if not exists team_name text
 check(team_name is null or (team_name=btrim(team_name) and char_length(team_name) between 1 and 80));

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

create or replace function public.read_league() returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.league_players; cfg public.league_config; result jsonb;
begin
 select * into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me.id is null then raise exception 'Your email is not on this league. Ask the organiser to add it.'; end if;
 -- Also cover late arrivals and installations upgraded after episode 1 locked.
 perform public.assign_default_team_names();
 select * into me from public.league_players where id=me.id;
 select * into cfg from public.league_config where id=1;
 select jsonb_build_object('state',cfg.state,'revision',cfg.revision,'me',jsonb_build_object('id',me.id,'name',me.name,'team_name',me.team_name,'is_admin',me.is_admin),
 'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'team_name',team_name,'email',case when me.is_admin then email else null end,'is_admin',is_admin)),'[]'::jsonb) from public.league_players),
 'entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.league_entries e where e.player_id=me.id or
   (e.kind='preseason' and (cfg.state->>'preseasonLocked')::boolean) or
   (e.kind='final' and (cfg.state->>'finalLocked')::boolean) or
   (e.kind='weekly' and (cfg.state->'episodes'->(e.episode-1)->>'locked')::boolean))) into result;
 return result;
end $$;
revoke all on function public.read_league() from public, anon;
grant execute on function public.read_league() to authenticated;

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

select public.assign_default_team_names();
commit;
