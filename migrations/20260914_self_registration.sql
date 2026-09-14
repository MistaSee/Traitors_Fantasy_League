-- Run this whole file in the existing project's Supabase SQL Editor.
-- Lets verified email users choose a name and join as ordinary players.
-- Existing players, organiser roles, picks, scores and locks are preserved.
-- Safe to run again. Does not create an organiser or change email delivery.

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
