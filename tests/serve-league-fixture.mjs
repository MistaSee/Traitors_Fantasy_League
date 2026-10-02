// Isolated browser playtest: real SQL RPCs with a synthetic signed-in account.
// Bound to loopback. No production credentials, emails or data.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../web/',import.meta.url),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.jwt() returns jsonb language sql as $$select '{"email":"fixture@example.com","sub":"11111111-1111-4111-8111-111111111111"}'::jsonb$$;
create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;`);
await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
const seed=JSON.parse(await readFile(new URL('seed.json',root),'utf8'));
seed.preseasonLocked=true;seed.episodes[0].locked=true;
// Date-relative opening fixture stays useful after the real season.
seed.episodes.forEach((ep,i)=>ep.deadline=new Date(Date.now()+(i-1)*86400000+3600000).toISOString());
await db.query('insert into public.league_config values(1,$1,0)',[seed]);
await db.exec("insert into public.league_players(email,name,team_name,is_admin) values('fixture@example.com','Fixture organiser','The Velvet Daggers',true),('other@example.com','Absent player','The Quiet Ones',false)");
await db.query("insert into public.league_entries select id,'weekly',1,$1,'2026-09-01T18:00:00Z' from public.league_players",[{picks:['4','5','6','7','8','9','10','11'],captain:'4'}]);
const sdk=`export function createClient(){return {auth:{getSession:async()=>({data:{session:{user:{email:'fixture@example.com'}}}}),signOut:async()=>({})},rpc:async(name,args)=>fetch('/fixture-rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})}).then(r=>r.json())};}`;
const toolbar='<div class="help">LOCAL PLAYTEST · Synthetic players and isolated database. <button id="short-deadline">Start 15-second deadline check</button><script>document.getElementById("short-deadline").onclick=async()=>{await fetch("/fixture-short-deadline",{method:"POST"});location.reload();};</script></div>';
const types={html:'text/html',js:'text/javascript',mjs:'text/javascript',json:'application/json',css:'text/css',svg:'image/svg+xml'};
createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;let body,type='text/javascript';
  if(path==='/fixture-short-deadline'&&req.method==='POST'){
   await db.query("update public.league_config set state=jsonb_set(state,'{episodes,1,deadline}',to_jsonb($1::text))",[new Date(Date.now()+15000).toISOString()]);body='{}';type='application/json';
  }else if(path==='/fixture-rpc'&&req.method==='POST'){
   let input='';for await(const chunk of req)input+=chunk;
   const {name,args={}}=JSON.parse(input);
   const statements={read_league:['select public.read_league() as data',[]],save_entry:['select public.save_entry($1,$2,$3) as data',[args.entry_kind,args.episode_number,args.entry_payload]],save_league:['select public.save_league($1,$2) as data',[args.new_state,args.expected_revision]],set_team_name:['select public.set_team_name($1) as data',[args.new_team_name]]};
   if(!statements[name])throw Error('Unsupported fixture RPC');
   try{const [query,params]=statements[name];body=JSON.stringify({data:(await db.query(query,params)).rows[0].data});}catch(error){body=JSON.stringify({error:{message:error.message,code:error.code}});}type='application/json';
  }else if(path==='/config.js')body="window.LEAGUE_CONFIG={url:'fixture',publishableKey:'fixture'}";
  else if(path==='/fixture-sdk.mjs')body=sdk;
  else{
   const file=new URL('.'+(path==='/'?'/index.html':path),root);if(!file.href.startsWith(root.href))throw Error('Invalid path');
   body=await readFile(file);type=types[path.split('.').pop()]||'text/html';
   if(path==='/app.js')body=body.toString().replace('https://esm.sh/@supabase/supabase-js@2.57.4','/fixture-sdk.mjs');
   if(path==='/')body=body.toString().replace('<body>','<body>'+toolbar);
  }
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch(error){res.writeHead(500);res.end(error.message);}
}).listen(8769,'127.0.0.1',()=>console.log('League fixture ready at http://127.0.0.1:8769/'));
