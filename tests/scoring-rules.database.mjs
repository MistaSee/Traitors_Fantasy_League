const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {removeRetiredScoring} from '../web/scoring-rules.mjs';
import {score} from '../web/engine.mjs';
const readFile=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const migration=readFile('migrations/20260925_retire_shield_activation.sql');
for(const locked of [false,true]){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.jwt() returns jsonb language sql as $$select current_setting('test.jwt',true)::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;`);
 await db.exec(readFile('schema.sql'));
 const seed=JSON.parse(readFile('web/seed.json'));
 seed.rules.push({id:'SHIELD_USED',role:'Any',category:'Universal',label:'Legacy event',points:4});
 seed.rules.find(r=>r.id==='TALKING_HEAD').points=2;
 seed.preseasonLocked=locked;seed.episodes[0].locked=locked;
 seed.episodes[0].counts={'4':{SHIELD_USED:1,SHIELD_RECEIVED:1,BLOCKS_MURDER_WITH_SHIELD:1},'5':{SHIELD_USED:0,TALKING_HEAD:3}};
 seed.episodes[9].counts={'4':{SHIELD_USED:7},'5':{TRAITOR_MURDER_BLOCKED:1}};
 // Current fresh installs strip stale seed data before storing it.
 await db.query('insert into public.league_config values(1,$1,7)',[seed]);
 const expectedState=structuredClone(seed);removeRetiredScoring(expectedState);
 assert.deepEqual((await db.query('select state from public.league_config')).rows[0].state,expectedState);
 // Recreate the previous installation to exercise the real upgrade path.
 await db.exec('drop trigger remove_retired_scoring_on_write on public.league_config');
 await db.query('update public.league_config set state=$1 where id=1',[seed]);
 await db.exec("insert into public.league_players(email,name,team_name,is_admin) values('admin@example.com','Admin','The Cloaks',true),('player@example.com','Player','The Daggers',false)");
 const player=(await db.query("select id from public.league_players where email='player@example.com'")).rows[0].id;
 const picks=['4','5','6','7','8','9','10','11'];
 await db.query("insert into public.league_entries values($1,'weekly',1,$2,'2026-09-01T12:00:00Z'),($1,'preseason',1,$3,'2026-09-01T13:00:00Z')",[player,{picks,captain:'4'},{picks:['4','5','6']}]);
 async function as(email){await db.exec('reset role');await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({email,sub:'11111111-1111-4111-8111-111111111111'})]);await db.exec('set role authenticated');}
 const backup=async()=>(await db.query('select public.export_league() as data')).rows[0].data;
 const ordered=x=>({...x,players:x.players.toSorted((a,b)=>a.id.localeCompare(b.id)),entries:x.entries.toSorted((a,b)=>a.kind.localeCompare(b.kind))});
 await as('admin@example.com');const before=await backup();
 await db.exec('reset role');await db.exec(migration);await as('admin@example.com');const after=await backup();
 const expected=structuredClone(before);expected.config.state=expectedState;expected.config.revision++;
 assert.deepEqual(ordered(after),ordered(expected),'Only the retired rule/counts and revision change');
 assert.equal(score(after.config.state,after.entries,player).weekly,locked?42:0);
 await db.exec('reset role');await db.exec(migration);await as('admin@example.com');
 assert.deepEqual(ordered(await backup()),ordered(after),'Rerunning does not change revision or data');
 await assert.rejects(()=>db.query('select public.save_league($1,$2)',[before.config.state,before.config.revision]),/another window/);
 const next=structuredClone(after.config.state);next.episodes[0].counts['4'].SHIELD_RECEIVED=2;
 // Old count keys are harmless even if a client submits them again.
 next.episodes[0].counts['4'].SHIELD_USED=88;
 await db.query('select public.save_league($1,$2)',[next,after.config.revision]);
 let saved=await backup();removeRetiredScoring(next);assert.deepEqual(saved.config.state,next);
 next.rules.push(seed.rules.at(-1));
 if(locked)await assert.rejects(()=>db.query('select public.save_league($1,$2)',[next,saved.config.revision]),/frozen/);
 else {await db.query('select public.save_league($1,$2)',[next,saved.config.revision]);saved=await backup();removeRetiredScoring(next);assert.deepEqual(saved.config.state,next);}
 await as('player@example.com');await assert.rejects(()=>db.query('select public.save_league($1,$2)',[next,saved.config.revision]),/Organiser/);
 await assert.rejects(()=>db.query('select public.without_retired_scoring($1)',[next]),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select public.save_league($1,$2)',[next,saved.config.revision]),/permission denied/);
 await db.close();
}
console.log('Scoring retirement: fresh/legacy leagues, frozen seasons, preserved picks and custom points, repeatability, stale saves and access controls passed.');
