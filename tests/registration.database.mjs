const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql as $$ select current_setting('test.jwt',true)::jsonb $$;
create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;`);
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/20260914_self_registration.sql',import.meta.url),'utf8');
assert.equal(schema.slice(schema.indexOf('create or replace function public.join_league')),migration.slice(migration.indexOf('create or replace function')),'Fresh installs and upgrades use identical registration SQL');
await db.exec(schema);
const seed=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
await db.query('insert into public.league_config values(1,$1,7)',[seed]);
const ids={new:'11111111-1111-4111-8111-111111111111',admin:'22222222-2222-4222-8222-222222222222',preadded:'33333333-3333-4333-8333-333333333333',unverified:'44444444-4444-4444-8444-444444444444',late:'55555555-5555-4555-8555-555555555555'};
for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users values($1,$2,$3)',[id,`${name}@example.com`,name==='unverified'?null:'2026-09-14T12:00:00Z']);
async function as(name,override={}) {
 await db.exec('reset role');
 await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({sub:ids[name],email:`${name}@example.com`,...override})]);
 await db.exec('set role authenticated');
}
const join=async name=>(await db.query('select public.join_league($1) as data',[name])).rows[0].data;
const read=async ()=>(await db.query('select public.read_league() as data')).rows[0].data;

// Missing, unverified or mismatched identities cannot register.
await db.exec('set role anon');
await assert.rejects(()=>join('Anonymous'),/permission denied/);
await as('unverified');await assert.rejects(()=>join('Unverified'),/verify your email/);
await as('new',{sub:null});await assert.rejects(()=>join('No session'),/verify your email/);
await as('new',{sub:'66666666-6666-4666-8666-666666666666'});await assert.rejects(()=>join('Missing user'),/verify your email/);
await as('new',{email:'admin@example.com'});await assert.rejects(()=>join('Wrong account'),/verify your email/);

// A user whose earlier email link failed can register without another email.
await as('new',{email:'NEW@EXAMPLE.COM',user_metadata:{is_admin:true,role:'organiser',email:'admin@example.com'}});
await assert.rejects(()=>read(),/not on this league/);
for(const invalid of [null,'','   ','x'.repeat(81)])await assert.rejects(()=>join(invalid),/between 1 and 80/);
const first=await join('  New player  ');
assert.equal(first.me.name,'New player');assert.equal(first.me.is_admin,false,'Even the first player cannot become an organiser by registering');
assert.equal(first.players.length,1);assert.equal(first.players[0].email,null);
assert.deepEqual(first.state,seed);assert.equal(first.revision,7);
await assert.rejects(()=>db.query('select * from public.league_players'),/permission denied/);
await assert.rejects(()=>db.query('select public.save_league($1,7)',[seed]),/Organiser/);
await assert.rejects(()=>db.query("select public.add_player('other@example.com','Other')"),/Organiser/);
await assert.rejects(()=>db.query('select public.set_player_organiser($1,true)',[first.me.id]),/Organiser/);
await assert.rejects(()=>db.query('select public.export_league()'),/Organiser/);
await db.query("select public.save_entry('preseason',1,$1)",[{picks:['4','5','6']}]);
const saved=await read();
const retried=await join('Changed name');
assert.deepEqual(retried,saved,'Retries keep the same name, identity, picks and role');

// Existing organiser and pre-added player entries are retained verbatim.
await db.exec('reset role');
await db.exec("insert into public.league_players(email,name,is_admin) values('admin@example.com','Existing organiser',true),('preadded@example.com','Invited player',false)");
await as('admin');const admin=await read();assert.deepEqual(await join('Overwrite organiser'),admin);
await as('preadded');const preadded=await read();assert.deepEqual(await join('Overwrite invite'),preadded);
assert.equal(preadded.entries.length,0,'Other players’ open picks stay private');

// Updating an installed league twice must not modify any data.
await as('admin');const before=(await db.query('select public.export_league() as data')).rows[0].data;
await db.exec('reset role');await db.exec('drop function public.join_league(text)');
await db.exec(migration);await db.exec(migration);
await as('admin');assert.deepEqual((await db.query('select public.export_league() as data')).rows[0].data,before);
assert.deepEqual(await join(null),admin,'The existing organiser remains an organiser after upgrading');

// New arrivals may join after deadlines, but cannot submit for locked rounds.
const locked=structuredClone(seed);locked.preseasonLocked=true;locked.episodes[0].locked=true;
await db.query('select public.save_league($1,7)',[locked]);
await as('late');const late=await join('Late arrival');assert.equal(late.me.is_admin,false);
await assert.rejects(()=>db.query("select public.save_entry('preseason',1,$1)",[{picks:['4','5','6']}]),/locked/);
await assert.rejects(()=>db.query("select public.save_entry('weekly',1,$1)",[{picks:['4','5','6','7','8','9','10','11'],captain:'4'}]),/locked/);
assert.equal(late.entries.filter(e=>e.player_id===late.me.id).length,0);
await db.exec('reset role');
const rows=(await db.query("select count(*)::integer as n from public.league_players where email='new@example.com'")).rows[0];assert.equal(rows.n,1);
await db.exec('delete from public.league_config');
await as('unverified');await assert.rejects(()=>join('Still unverified'),/verify your email/);
await as('new');await assert.rejects(()=>join('Uninitialised'),/not initialised/);
await db.close();
console.log('Self-registration: verified identity, ordinary-player permissions, retries, migration preservation and locks passed.');
