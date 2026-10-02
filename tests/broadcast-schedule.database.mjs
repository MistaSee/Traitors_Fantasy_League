const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legacySeason} from './legacy-season.mjs';
import {carryTeam} from '../web/carry-over.mjs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=file('schema.sql'),migration=file('migrations/20261002_broadcast_schedule.sql');
// Catch drift between the fresh-install and upgrade paths.
for(const name of ['with_broadcast_locks','carried_team','carry_locked_teams','lock_due_rounds','draft_review','read_league','save_entry','save_league','export_league']){
 const pattern=new RegExp('create (?:or replace )?function public\\.'+name+'\\(.*?end \\$\\$;','s');
 assert.equal(schema.match(pattern)[0].replace('create function','create or replace function'),migration.match(pattern)[0]);
}
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.jwt() returns jsonb language sql as $$select current_setting('test.jwt',true)::jsonb$$;
create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
create function public.test_clock() returns timestamptz language sql as $$select current_setting('test.now')::timestamptz$$;
select set_config('test.now','2026-10-02T08:00:00Z',false);`);
// Owner-controlled deterministic wall clock, substituted only in this test database.
const clocked=text=>text.replaceAll('clock_timestamp()','public.test_clock()');
await db.exec(clocked(schema));
const legacy=legacySeason();legacy.episodes[0].locked=true;legacy.preseasonLocked=true;
legacy.episodes[0].counts={'4':{SHIELD_RECEIVED:1}};
await db.query('insert into public.league_config values(1,$1,4)',[legacy]);
await db.exec("insert into public.league_players(email,name,team_name,is_admin) values('admin@example.com','Admin','Daggers',true),('player@example.com','Player','Cloaks',false),('late@example.com','Late','Late team',false)");
const player=(await db.query("select id from public.league_players where name='Player'")).rows[0].id;
const late=(await db.query("select id from public.league_players where name='Late'")).rows[0].id;
const picks=['11','4','5','6','7','8','9','10'];
const payload={picks,captain:'11'};
await db.query("insert into public.league_entries values($1,'weekly',1,$2,'2026-10-01T18:00:00Z'),($1,'preseason',1,$3,'2026-10-01T18:00:00Z'),($4,'weekly',1,$5,'2026-10-01T19:00:00Z')",[player,payload,{picks:['4','5','6']},late,{picks:['4'],captain:'4'}]);
const entriesBefore=(await db.query('select * from public.league_entries order by player_id,kind,episode')).rows;
const playersBefore=(await db.query('select * from public.league_players order by id')).rows;
await db.exec(clocked(migration));
const after=(await db.query('select * from public.league_config')).rows[0];
assert.equal(after.revision,5);assert.equal(after.state.episodes[1].teamSize,8);
assert.equal(after.state.episodes[1].roleNeutral,true);assert.equal(after.state.episodes[1].locked,false);
assert.deepEqual((await db.query('select * from public.league_entries order by player_id,kind,episode')).rows,entriesBefore);
assert.deepEqual((await db.query('select * from public.league_players order by id')).rows,playersBefore);
await db.exec(clocked(migration));assert.deepEqual((await db.query('select * from public.league_config')).rows[0],after,'Migration rerun is harmless');
await db.exec(file('scripts/record-opening-roles.sql'));
await db.exec(file('scripts/record-opening-roles.sql'));
const roles=(await db.query('select state from public.league_config')).rows[0].state.characters;
assert.deepEqual(roles.filter(c=>c.startingRole==='Traitor').map(c=>c.name),['Maya Jama','Richard E. Grant']);
assert.deepEqual(roles.filter(c=>c.startingRole==='Unknown').map(c=>c.name),['Amol Rajan','James Acaster']);
assert.equal(roles.filter(c=>c.startingRole==='Faithful').length,17);
assert.deepEqual((await db.query('select * from public.league_entries order by player_id,kind,episode')).rows,entriesBefore);
async function as(email){await db.exec('reset role');await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({email,sub:'11111111-1111-4111-8111-111111111111'})]);await db.exec('set role authenticated');}
async function now(time){await db.exec('reset role');await db.query("select set_config('test.now',$1,false)",[time]);}
const read=async()=>(await db.query('select public.read_league() as data')).rows[0].data;
await as('admin@example.com');let league=await read();
assert.equal(league.review.length,1);assert.equal(league.review[0].issues.length,2,'Late and incompatible saved entries are flagged, never deleted');
assert.equal(league.review[0].name,'Late');assert.ok(!('payload' in league.review[0]));
// A preserved legacy exception must not prevent scoring corrections.
league.state.episodes[0].counts['4'].SHIELD_RECEIVED=2;
await db.query('select public.save_league($1,$2)',[league.state,league.revision]);
league=await read();
const tampered=structuredClone(league.state);delete tampered.episodes[1].deadline;
await assert.rejects(()=>db.query('select public.save_league($1,$2)',[tampered,league.revision]),/deadlines/);
const stale=legacySeason();await assert.rejects(()=>db.query('select public.save_league($1,$2)',[stale,league.revision]),/schedule/);
await as('player@example.com');league=await read();assert.deepEqual(league.review,[]);
await assert.rejects(()=>db.query('select public.lock_due_rounds()'),/permission denied/);
await assert.rejects(()=>db.query('select public.draft_review($1)',[league.state]),/permission denied/);
await assert.rejects(()=>db.query("select public.save_entry('preseason',1,$1)",[{picks:['7','8','9']}]),/locked/);
await db.query("select public.save_entry('weekly',2,$1)",[payload]);
let saved=(await read()).entries.find(e=>e.kind==='weekly'&&e.episode===2&&e.player_id===player);
assert.deepEqual(saved.payload.selectionOrder,picks,'New manual saves record selection order');
await as('admin@example.com');assert.ok(!(await read()).entries.some(e=>e.episode===2),'Open teams stay private');
await now('2026-10-02T18:59:59.999Z');await as('player@example.com');
await db.query("select public.save_entry('weekly',2,$1)",[payload]);
await now('2026-10-02T19:00:00Z');await as('player@example.com');
await assert.rejects(()=>db.query("select public.save_entry('weekly',2,$1)",[payload]),/locked/);
league=await read();assert.equal(league.state.episodes[1].locked,true);
assert.ok(league.entries.some(e=>e.player_id===late&&e.episode===2&&e.payload.autoCarried),'Missed round carries automatically without that player signing in');
assert.deepEqual(league.entries.find(e=>e.player_id===player&&e.episode===2).payload.selectionOrder,picks,'Manual team is never overwritten');
// Freeze eligibility even on an organiser screen opened before the deadline.
await as('admin@example.com');league=await read();const changed=structuredClone(league.state);changed.episodes[1].roster['4']={role:'Unknown',status:'Banished'};
await assert.rejects(()=>db.query('select public.save_league($1,$2)',[changed,league.revision]),/Locked episode/);
// Prepare future rosters, and exercise falling role quotas plus elimination.
league.state.characters.forEach((c,i)=>{for(const ep of league.state.episodes.slice(2))ep.roster[c.id]={role:i<2?'Traitor':'Faithful',status:'Active'};});
await db.query('select public.save_league($1,$2)',[league.state,league.revision]);
await now('2026-10-08T19:00:00Z');await as('admin@example.com');league=await read();
let auto3=league.entries.find(e=>e.player_id===player&&e.episode===3);
assert.deepEqual(auto3.payload,carryTeam(league.state,3,saved),'SQL and browser agree on role-based carry');
// Entire missed run through episode 7, where the team shrinks to 1T + 3F.
await now('2026-10-22T19:00:00Z');league=await read();
const auto7=league.entries.find(e=>e.player_id===player&&e.episode===7);
assert.equal(auto7.payload.picks.length,4);assert.deepEqual(auto7.payload.picks,['11','4','6','7']);
assert.equal(auto7.payload.captain,'11');
assert.ok(!league.review.some(e=>e.player_id===player&&e.issues.some(x=>x.startsWith('Last saved'))),'Automatic carries are not late user submissions');
const ep8=league.state.episodes[7];ep8.roster['11'].status='Banished';
await as('admin@example.com');await db.query('select public.save_league($1,$2)',[league.state,league.revision]);
await now('2026-10-23T19:00:00Z');league=await read();
const auto8=league.entries.find(e=>e.player_id===player&&e.episode===8);
assert.deepEqual(auto8.payload.picks,['4','6','7']);assert.equal(auto8.payload.captain,'4');
assert.ok(league.review.some(e=>e.player_id===player&&e.episode===8&&e.issues.some(x=>x.startsWith('Carried team'))));
// Final lock uses GMT, not BST, and an old transaction cannot evade the wall clock.
await now('2026-10-30T19:59:59.999Z');await as('player@example.com');
await db.exec('begin');await db.query("select public.save_entry('final',10,$1)",[{side:'Faithful'}]);await db.exec('commit');
await now('2026-10-30T20:00:00Z');await as('player@example.com');
await assert.rejects(()=>db.query("select public.save_entry('final',10,$1)",[{side:'Traitors'}]),/locked/);
assert.equal((await read()).state.finalLocked,true);
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select public.read_league()'),/permission denied/);
await db.close();
console.log('Broadcast schedule: safe/repeatable upgrade, preserved legacy entries, exact deadlines, private drafts, stale screens, review flags, multi-round carry-over, smaller quotas, missing captain and GMT final passed.');
