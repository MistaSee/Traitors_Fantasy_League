const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {score} from '../web/engine.mjs';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.jwt() returns jsonb language sql as $$ select current_setting('test.jwt',true)::jsonb $$;
create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;`);
await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
const seed = JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
delete seed.episodes[0].teamSize;
seed.episodes[0].counts = {'4':{SHIELD_RECEIVED:1,TRAITOR_MURDER_SUCCESS:99}};
await db.query('insert into public.league_config values(1,$1,0)',[seed]);
await db.exec(`insert into public.league_players(email,name,is_admin) values('admin@example.com','Admin',true),('player@example.com','Player',false);`);
async function as(email) {
 await db.exec('reset role');
 await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({email,sub:'11111111-1111-4111-8111-111111111111'})]);
 await db.exec('set role authenticated');
}
const read = async () => (await db.query('select public.read_league() as data')).rows[0].data;
const backup = async () => (await db.query('select public.export_league() as data')).rows[0].data;
const saveTeam = payload => db.query("select public.save_entry('weekly',1,$1)",[payload]);
const team = {picks:['4','5','6','7','8','9','10','11'],captain:'4'};
async function change(edit) {
 const data=await read(); edit(data.state);
 await db.query('select public.save_league($1,$2)',[data.state,data.revision]);
}

await as('player@example.com');
await db.query("select public.save_entry('preseason',1,$1)",[{picks:['4','5','6']}]);
await assert.rejects(()=>saveTeam(team),/not enabled/);
await as('admin@example.com');
const before = await backup();
// Simulate an installed backend which does not implement either new RPC yet.
await db.exec('reset role');
await db.exec(`create or replace function public.save_entry(entry_kind text,episode_number integer,entry_payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin raise exception 'Old submission RPC'; end $$;
create or replace function public.save_league(new_state jsonb,expected_revision integer) returns void language plpgsql security definer set search_path='' as $$ begin raise exception 'Old organiser RPC'; end $$;`);
const migration = readFileSync(new URL('../migrations/20260907_episode_one.sql',import.meta.url),'utf8');
await db.exec(migration);
await as('admin@example.com');
const upgraded = await backup();
const expected = structuredClone(before);
expected.config.state.episodes[0].teamSize=8;
expected.config.revision++;
assert.deepEqual(upgraded,expected,'Upgrade preserves every field, player, entry and count except the new size and revision');
await db.exec('reset role'); await db.exec(migration); await as('admin@example.com');
assert.deepEqual(await backup(),upgraded,'Repeating the upgrade does not reset edits or advance the revision');
await assert.rejects(()=>db.query('select public.save_league($1,$2)',[before.config.state,before.config.revision]),/another window/);
for (const size of [0,8.5,22,'8']) await assert.rejects(()=>change(s=>{s.episodes[0].teamSize=size;}),/whole number/);
await change(s=>{s.episodes[0].teamSize=7;});
await change(s=>{s.episodes[0].teamSize=8;});

await as('player@example.com');
await saveTeam(team);
assert.equal((await read()).entries.length,2,'The episode team and preseason predictions coexist');
assert.equal((await read()).me.is_admin,false);
await assert.rejects(()=>saveTeam({...team,picks:team.picks.slice(1)}),/team size/);
await assert.rejects(()=>saveTeam({...team,picks:[...team.picks.slice(1),'5']}),/Duplicate/);
await assert.rejects(()=>saveTeam({...team,captain:'12'}),/Captain/);
await assert.rejects(()=>saveTeam({...team,picks:[...team.picks.slice(1),'unknown']}),/Unknown celebrity/);
await assert.rejects(()=>db.query("select public.save_entry('weekly',0,$1)",[team]),/Invalid episode/);
await assert.rejects(()=>db.query('select public.save_league($1,3)',[seed]),/Organiser/);

await as('admin@example.com');
assert.equal((await read()).entries.length,0,'Other players’ open episode 1 teams remain private');
await assert.rejects(()=>change(s=>{s.episodes[0].teamSize=7;}),/invalidate/);
await assert.rejects(()=>change(s=>{s.episodes[0].roster['4']={role:'Unknown',status:'Withdrawn'};}),/invalidate/);
await change(s=>{
 s.episodes[0].counts={'4':{SHIELD_RECEIVED:1,TALKING_HEAD:3,VOTES_RECEIVED:2,TRAITOR_MURDER_SUCCESS:99},'5':{MISSION_GROUP_COMPLETE:1,FAITHFUL_SURVIVES_EPISODE:99}};
 s.episodes[0].locked=true;
});
assert.equal((await read()).entries.length,1,'Locking episode 1 reveals the team but not open preseason predictions');
await assert.rejects(()=>change(s=>{s.episodes[0].locked=false;}),/Locked/);
await assert.rejects(()=>change(s=>{s.episodes[0].teamSize=7;}),/Locked/);
await assert.rejects(()=>change(s=>{s.episodes[0].roster['4']={role:'Traitor',status:'Active'};}),/Locked/);
await change(s=>{s.characters[0].startingRole='Traitor';s.episodes[1].roster['4']={role:'Traitor',status:'Active'};});
await as('player@example.com');
await assert.rejects(()=>saveTeam(team),/locked/);
await db.query("select public.save_entry('preseason',1,$1)",[{picks:['4','5','7']}]);
let data=await read();
assert.equal(score(data.state,data.entries,data.me.id).weekly,20,'Only neutral events score, with the captain doubled');
await as('admin@example.com');
await change(s=>{s.episodes[0].counts['4'].VOTES_RECEIVED=3;});
await change(s=>{s.episodes[0].counts['4'].VOTES_RECEIVED=3;});
await as('player@example.com'); data=await read();
assert.equal(score(data.state,data.entries,data.me.id).weekly,18,'Corrections replace counts without double awarding');

// Upgrading a legacy league must never reopen an already locked episode.
await db.exec('reset role');
await db.exec("update public.league_config set state=state #- '{episodes,0,teamSize}'");
await db.exec(migration); await as('player@example.com');
assert.equal((await read()).state.episodes[0].locked,true);
await assert.rejects(()=>saveTeam(team),/locked/);
await db.exec('reset role; set role anon');
await assert.rejects(()=>saveTeam(team),/permission denied/);
await db.close();
console.log('Episode 1 database passed: repeatable upgrade, data preservation, ordinary-player teams, privacy, independent locks, frozen eligibility, neutral scoring and corrections.');
