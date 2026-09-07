-- Run in the existing league's Supabase SQL editor to enable organiser management.
-- Safe to run again. Preserves all players, picks, scoring and current organiser roles.
begin;

create or replace function public.read_league() returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.league_players; cfg public.league_config; result jsonb;
begin
 select * into me from public.league_players where email=lower(auth.jwt()->>'email') and auth.uid() is not null;
 if me.id is null then raise exception 'Your email is not on this league. Ask the organiser to add it.'; end if;
 select * into cfg from public.league_config where id=1;
 select jsonb_build_object('state',cfg.state,'revision',cfg.revision,'me',jsonb_build_object('id',me.id,'name',me.name,'is_admin',me.is_admin),
 'players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'email',case when me.is_admin then email else null end,'is_admin',is_admin)),'[]'::jsonb) from public.league_players),
 'entries',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from public.league_entries e where e.player_id=me.id or
   (e.kind='preseason' and (cfg.state->>'preseasonLocked')::boolean) or
   (e.kind='final' and (cfg.state->>'finalLocked')::boolean) or
   (e.kind='weekly' and (cfg.state->'episodes'->(e.episode-1)->>'locked')::boolean))) into result;
 return result;
end $$;
revoke all on function public.read_league() from public, anon;
grant execute on function public.read_league() to authenticated;

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

notify pgrst, 'reload schema';
commit;
