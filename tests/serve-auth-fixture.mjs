// Disposable browser fixture: fake email/session/RPC responses, real app UI.
// Bound to loopback only. Nothing is sent to Supabase and no emails are sent.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../web/',import.meta.url);
const fakeSdk=`
const seed=await fetch('/seed.json').then(r=>r.json());
const key='round-table-auth-fixture';
const session=()=>JSON.parse(sessionStorage.getItem(key)||'null');
const pause=()=>new Promise(resolve=>setTimeout(resolve,500));
const players=[{id:'returning',email:'returning@example.com',name:'Returning player',team_name:'The Faithful Few',is_admin:true}];
function league(){const email=session()?.user.email;const saved=JSON.parse(sessionStorage.getItem(key+'-players')||'[]');const all=[...players,...saved];return {state:seed,revision:0,players:all,entries:[],me:all.find(p=>p.email===email)};}
export function createClient(){return {
 auth:{
  getSession:async()=>({data:{session:session()}}),
  signOut:async()=>{sessionStorage.removeItem(key);return {};},
  signInWithOtp:async({email})=>{await pause();return email==='failure@example.com'?{error:{message:'Fixture email service unavailable'}}:{error:null};},
  verifyOtp:async({email,token})=>{await pause();if(token!=='12345678')return {error:{code:'otp_expired',status:403}};const value={user:{email}};sessionStorage.setItem(key,JSON.stringify(value));return {data:{session:value}};}
 },
 rpc:async(name,args)=>{
  if(name==='join_league'){const current=league();if(!current.me){const saved=JSON.parse(sessionStorage.getItem(key+'-players')||'[]');saved.push({id:'new',email:session().user.email,name:args.player_name,team_name:null,is_admin:false});sessionStorage.setItem(key+'-players',JSON.stringify(saved));}}
  const data=league();return data.me?{data}:{error:{code:'P0001',message:'Your email is not on this league. Ask the organiser to add it.'}};
 }
};}
`;
const types={html:'text/html',js:'text/javascript',mjs:'text/javascript',json:'application/json',css:'text/css',jpg:'image/jpeg',png:'image/png',svg:'image/svg+xml'};
createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  let body,type='text/javascript';
  if(path==='/config.js') body="window.LEAGUE_CONFIG={url:'fixture',publishableKey:'fixture'}";
  else if(path==='/fixture-sdk.mjs') body=fakeSdk;
  else {
   const file=new URL('.'+(path==='/'?'/index.html':path),root);
   if(!file.href.startsWith(root.href)) throw Error('Invalid path');
   body=await readFile(file);type=types[path.split('.').pop()]||'text/html';
   if(path==='/app.js') body=body.toString().replace('https://esm.sh/@supabase/supabase-js@2.57.4','/fixture-sdk.mjs');
   if(path==='/') body=body.toString().replace('<body>','<body><div class="help">LOCAL AUTH FIXTURE · No real emails or league data · Use example.com addresses only.</div>');
  }
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 } catch {res.writeHead(404);res.end('Not found');}
}).listen(8768,'127.0.0.1',()=>console.log('Auth fixture: http://127.0.0.1:8768/'));
