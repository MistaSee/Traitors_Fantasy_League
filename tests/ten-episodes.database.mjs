const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {score} from '../web/engine.mjs';
const readFile=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const schema=readFile('schema.sql'),migration=readFile('migrations/20260914_ten_episodes.sql');
for(const {count,finalLocked} of [{count:9,finalLocked:false},{count:9,finalLocked:true},{count:10,finalLocked:false}]){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.jwt() returns jsonb language sql as $$select current_setting('test.jwt',true)::jsonb$$;
 create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;`);
 await db.exec(schema);
 const seed=JSON.parse(readFile('web/seed.json'));seed.episodes=seed.episodes.slice(0,count);seed.finalLocked=finalLocked;seed.winner='Faithful';
 const picks=['4','5','6','7'];picks.forEach((id,i)=>seed.episodes[8].roster[id]={role:i?'Faithful':'Traitor',status:'Active'});
 seed.episodes[8].locked=true;seed.episodes[8].counts={'4':{TRAITOR_BANISHED:1},'5':{SHIELD_RECEIVED:1}};
 await db.query('insert into public.league_config values(1,$1,7)',[seed]);
 await db.exec("insert into public.league_players(email,name,team_name,is_admin) values('admin@example.com','Admin','The Cloaks',true),('player@example.com','Player','The Daggers',false)");
 const player=(await db.query("select id from public.league_players where email='player@example.com'")).rows[0].id;
 await db.query("insert into public.league_entries values($1,'weekly',9,$2,'2026-09-01T12:00:00Z'),($1,'final',$3,$4,'2026-09-01T13:00:00Z')",[player,{picks,captain:'4'},count,{side:'Faithful'}]);
 if(count===9)await db.exec(readFile('migrations/20260907_episode_one.sql'));
 async function as(email){await db.exec('reset role');await db.query("select set_config('test.jwt',$1,false)",[JSON.stringify({email,sub:'11111111-1111-4111-8111-111111111111'})]);await db.exec('set role authenticated');}
 const read=async()=>(await db.query('select public.read_league() as data')).rows[0].data;
 const backup=async()=>(await db.query('select public.export_league() as data')).rows[0].data;
 const save=async(state,revision)=>(await db.query('select public.save_league($1,$2)',[state,revision]));
 await as('admin@example.com');const before=await backup();
 await db.exec('reset role');await db.exec(migration);await as('admin@example.com');const after=await backup();
 const expected=structuredClone(before);
 if(count===9){expected.config.state.episodes.push({number:10,traitors:1,faithful:3,locked:false,roster:{},counts:{}});expected.config.revision++;expected.entries.find(e=>e.kind==='final').episode=10;}
 // SQL UPDATE may change row order; the records themselves must match exactly.
 const ordered=x=>({...x,entries:x.entries.toSorted((a,b)=>a.kind.localeCompare(b.kind))});
 assert.deepEqual(ordered(after),ordered(expected),'Upgrade preserves all existing fields, timestamps, scores, names and permissions');
 await db.exec('reset role');await db.exec(migration);await as('admin@example.com');assert.deepEqual(ordered(await backup()),ordered(after),'Upgrade can be rerun without changing data or revisions');
 if(count===9)await assert.rejects(()=>save(before.config.state,7),/another window/);
 let data=await read();
 const shorter=structuredClone(data.state);shorter.episodes.pop();await assert.rejects(()=>save(shorter,data.revision),/Keep all 10/);
 const reordered=structuredClone(data.state);[reordered.episodes[8],reordered.episodes[9]]=[reordered.episodes[9],reordered.episodes[8]];await assert.rejects(()=>save(reordered,data.revision),/consecutively/);
 await as('player@example.com');data=await read();assert.deepEqual(data.entries.find(e=>e.kind==='final').payload,{side:'Faithful'});
 assert.equal(data.entries.find(e=>e.kind==='final').episode,10);
 assert.equal(score(data.state,data.entries,player).weekly,-12,'Existing episode 9 score remains unchanged');
 await assert.rejects(()=>save(data.state,data.revision),/Organiser/);
 await assert.rejects(()=>db.query("select public.save_entry('weekly',11,$1)",[{picks,captain:'4'}]),/Invalid episode/);
 await assert.rejects(()=>db.query("select public.save_entry('final',9,$1)",[{side:'Traitors'}]),/locked or invalid/);
 if(finalLocked){
  await assert.rejects(()=>db.query("select public.save_entry('final',10,$1)",[{side:'Traitors'}]),/locked or invalid/);
  assert.equal(score(data.state,data.entries,player).final,25);await db.close();continue;
 }
 await db.query("select public.save_entry('final',10,$1)",[{side:'Traitors'}]);
 assert.equal((await read()).entries.filter(e=>e.kind==='final').length,1,'Updating the moved prediction creates no duplicate');
 await as('admin@example.com');data=await read();data.state.episodes[9].roster=structuredClone(seed.episodes[8].roster);await save(data.state,data.revision);
 await as('player@example.com');await db.query("select public.save_entry('weekly',10,$1)",[{picks,captain:'4'}]);
 await as('admin@example.com');data=await read();assert.equal(data.entries.filter(e=>e.kind==='weekly'&&e.episode===10).length,0,'Open episode 10 teams stay private');
 data.state.episodes[9].counts={'4':{TRAITOR_MURDER_SUCCESS:1},'5':{SHIELD_RECEIVED:1}};data.state.episodes[9].locked=true;data.state.finalLocked=true;data.state.winner='Traitors';await save(data.state,data.revision);
 await as('player@example.com');data=await read();assert.deepEqual(score(data.state,data.entries,player).episodes,{'9':-12,'10':28});assert.equal(score(data.state,data.entries,player).total,41);
 await assert.rejects(()=>db.query("select public.save_entry('weekly',10,$1)",[{picks,captain:'4'}]),/locked/);
 await assert.rejects(()=>db.query("select public.save_entry('final',10,$1)",[{side:'Faithful'}]),/locked/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query("select public.save_entry('final',10,$1)",[{side:'Faithful'}]),/permission denied/);
 // A conflicting historical final must abort atomically rather than overwrite a pick.
 await db.exec('reset role');await db.query("insert into public.league_entries values($1,'final',9,$2,now())",[player,{side:'Faithful'}]);
 await as('admin@example.com');const conflict=await backup();await db.exec('reset role');await assert.rejects(()=>db.exec(migration),/both rounds 9 and 10/);await db.exec('rollback');await as('admin@example.com');assert.deepEqual(ordered(await backup()),ordered(conflict));
 await db.close();
}
console.log('Ten episodes: fresh/legacy leagues, moved finals, data preservation, repeatability, privacy, locks, scoring and conflict rollback passed.');
