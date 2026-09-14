import {validateDraft, score, characterPoints, episodeOneTeamSize, episodeScoringRules} from './engine.mjs';
import {EditTracker, readForm, restoreForm, confirmDiscard} from './edits.mjs';
import {castPhotos} from './cast-photos.mjs';
import {needsRegistration, registrationError} from './registration.mjs';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seed = await fetch('./seed.json').then(r=>r.json());
const cfg = window.LEAGUE_CONFIG;
let api, data, signedInEmail='', tab='Standings', episode=null, kind=null, selected=[], captain='', scoredCharacter=seed.characters[0]?.id||'', saving=false, navigating=false;
const edits = new EditTracker();
const sectionNames = {picks:'Your picks', add:'New player', season:'Season controls', 'episode-form':'Episode setup', counts:'Event counts', 'rules-form':'Scoring values'};
const demo = !cfg.url || !cfg.publishableKey;
const notice = message => { $('#notice').textContent=message; clearTimeout(notice.timer); notice.timer=setTimeout(()=>$('#notice').textContent='',6500); };
const options = (values,current) => values.map(v=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(v)}</option>`).join('');
const initials = name => name.split(' ').map(x=>x[0]).slice(0,2).join('');
function bind(selector,event,fn){$(selector)?.addEventListener(event,async e=>{try{await fn(e);}catch(error){notice(error.message);}});}
async function rpc(name,args){const {data,error}=await api.rpc(name,args);if(error)throw error;return data;}
function trackForm(id){edits.track(id,sectionNames[id],()=>readForm(document.getElementById(id)),(values,saved)=>restoreForm(document.getElementById(id),values,saved));}
async function leave(options){
 if(saving||navigating)return false;
 navigating=true;
 try{return await confirmDiscard(edits.changed(options));}finally{navigating=false;}
}
function setSaving(value){
 saving=value;$('#app').inert=value;$('#account').inert=value;
 if(value)$('#app').setAttribute('aria-busy','true');else $('#app').removeAttribute('aria-busy');
}
async function performSave(action,message='Saving changes…'){
 if(saving||navigating)return;
 setSaving(true);
 try{
  notice(message);
  await action();
 }finally{
  setSaving(false);
 }
}
window.addEventListener('beforeunload',e=>{if(saving||edits.changed().length){e.preventDefault();e.returnValue='';}});
bind('.brand','click',async e=>{e.preventDefault();const href=e.currentTarget.href;if(!await leave())return;edits.clear();location.assign(href);});
async function refresh(savedSection, savedState){
 const pending=edits.pending({except:savedSection});
 if(!demo){
  const next=await rpc('read_league');
  // Keep the revision that these other edits were based on. A later save must
  // still conflict if another organiser changed the configuration meanwhile.
  if(pending.length){next.state=savedState||data.state;next.revision=data.revision+(savedState?1:0);}
  data=next;
 }
 render();edits.restore(pending);
}
async function saveState(next,section){
 await performSave(async()=>{
 if(demo){data.state=next;data.revision++;localStorage.setItem('round-table-demo',JSON.stringify(data));}
 else await rpc('save_league',{new_state:next,expected_revision:data.revision});
 await refresh(section,next);notice('League changes saved.');
 });
}
function login(){
 $('#app').innerHTML=`<section class="hero"><div class="eyebrow">Trust your instincts</div><h1>A seat at<br>the Round Table.</h1><p>Your celebrities. Your suspicions. One very competitive league.</p></section><section class="panel login"><h2>Enter the castle</h2><p class="muted">Enter your email to sign in or join the league. We’ll send you a private sign-in link. New players choose their league name after verifying their email.</p><form id="login"><label>Email address<input type="email" id="email" required autocomplete="email" placeholder="you@example.com"></label><button class="primary">Send sign-in link</button></form></section>`;
 bind('#login','submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const {error}=await api.auth.signInWithOtp({email:$('#email').value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;notice('Check your email for your sign-in link.');}finally{button.disabled=false;}});
}
async function useAnotherEmail(){
 await performSave(async()=>{
  const {error}=await api.auth.signOut({scope:'local'});if(error)throw error;
  data=null;signedInEmail='';edits.clear();$('#account').innerHTML='';login();notice('Enter the email you want to use.');
 },'Signing out…');
}
function register(){
 $('#account').textContent='Email verified';
 $('#app').innerHTML=`<section class="hero"><div class="eyebrow">The castle doors are open</div><h1>Take your seat.<br>Trust no one.</h1><p>Your email is verified. There’s one last introduction to make.</p></section><section class="panel login"><h2>What shall we call you?</h2><p>You’re joining as <strong class="account-email">${esc(signedInEmail)}</strong>.</p><form id="join"><label>Your league name<input id="league-name" required maxlength="80" autocomplete="nickname" aria-describedby="name-help" placeholder="A name your rivals will recognise"></label><p id="name-help" class="muted">This name appears on the leaderboard. You’ll join as a player and can make picks for any rounds still open.</p><p id="join-error" role="alert"></p><button class="primary">Join the league</button></form><button id="join-exit" class="space">Use another email</button></section>`;
 bind('#join','submit',async e=>{
  e.preventDefault();const name=$('#league-name').value.trim();$('#join-error').textContent='';
  if(!name){$('#join-error').textContent='Choose a league name between 1 and 80 characters.';return;}
  try{
   await performSave(async()=>{data=await rpc('join_league',{player_name:name});tab='Standings';render();notice('Your seat is reserved. Welcome to the league.');},'Reserving your seat…');
  }catch(error){$('#join-error').textContent=registrationError(error);notice('Your seat hasn’t been reserved yet.');}
 });
 bind('#join-exit','click',useAnotherEmail);
}
function accessError(error){
 if(signedInEmail&&needsRegistration(error)){register();return;}
 $('#app').innerHTML=`<section class="panel"><h2>We couldn’t open the league</h2><p>${esc(error.message)}</p>${signedInEmail?`<p class="muted">Signed in as <span class="account-email">${esc(signedInEmail)}</span></p>`:''}<div class="row"><button id="retry">Try again</button>${api?'<button id="exit">Use another email</button>':''}</div></section>`;
 bind('#retry','click',()=>location.reload());bind('#exit','click',useAnotherEmail);
}
function render(){
 edits.clear();
 episode??=episodeOneTeamSize(data.state)&&!data.state.episodes[0].locked?1:2;
 if(tab==='Organiser'&&!data.me.is_admin)tab='Standings';
 const s=data.state;
 $('#account').innerHTML=`<span>${esc(data.me.name)}${demo?' · LOCAL DEMO':''}</span> <button id="signout">${demo?'Reset demo':'Sign out'}</button>`;
 bind('#signout','click',async()=>{if(saving||navigating)return;if(demo){if(!confirm('Clear this browser’s demo league?'))return;localStorage.removeItem('round-table-demo');edits.clear();location.reload();}else{if(!await leave())return;setSaving(true);try{const {error}=await api.auth.signOut();if(error)throw error;edits.clear();data=null;$('#account').innerHTML='';login();}finally{setSaving(false);}}});
 $('#app').innerHTML=`${demo?'<div class="help">Interactive demo · Changes stay in this browser. Email sign-in and shared play become available after connecting the free backend.</div>':''}<section class="hero"><div class="row spread"><span class="eyebrow">Celebrity Traitors · UK · Series 2</span><span class="tag gold">${s.preseasonLocked?'THE GAME IS ON':'PRESEASON'}</span></div><h1>Faithful to the game.<br>Ruthless in the league.</h1><p>Build your team, choose your captain and make every round table count.</p></section><nav aria-label="Main navigation">${['Standings','My picks','The cast','Scoring',...(data.me.is_admin?['Organiser']:[])].map(t=>`<button data-tab="${t}" class="${tab===t?'active':''}">${t}</button>`).join('')}</nav><div id="view"></div>`;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=async()=>{if(b.dataset.tab===tab||!await leave())return;tab=b.dataset.tab;render();});
 ({Standings:standings,'My picks':draft,'The cast':cast,Scoring:rules,Organiser:admin}[tab])();
}
function bindOpeningTeamLink(){
 bind('#opening-team','click',async()=>{if(!await leave())return;kind='weekly';episode=1;tab='My picks';render();});
}
function bindPreseasonLink(){
 bind('#preseason-picks','click',async()=>{if(!await leave())return;kind='preseason';tab='My picks';render();});
}
function standings(){
 const s=data.state, openingSize=episodeOneTeamSize(s), openingEntry=data.entries.find(e=>e.player_id===data.me.id&&e.kind==='weekly'&&e.episode===1), preseasonEntry=data.entries.find(e=>e.player_id===data.me.id&&e.kind==='preseason'), rows=data.players.map(p=>({...p,...score(s,data.entries,p.id)})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
 $('#view').innerHTML=`${!s.preseasonLocked?`<section class="panel"><span class="eyebrow">Before episode 1 · Predictions open</span><h2>Who’s hiding a traitorous heart?</h2><p>Choose three celebrities you think will be the original Traitors. The full cast is available now, before any roles are revealed.</p><button class="primary" id="preseason-picks">${preseasonEntry?'Review preseason picks':'Make preseason picks'}</button></section>`:''}${openingSize&&!s.episodes[0].locked?`<section class="panel"><span class="eyebrow">Episode 1 · Team picks open</span><h2>Make your opening move.</h2><p>Choose any ${openingSize} eligible celebrities and a captain. Episode 1 scores shields, missions, confessionals and other events labelled Any role. No Traitor or Faithful quota applies.</p><button id="opening-team" class="primary">${openingEntry?'Review episode 1 team':'Pick episode 1 team'}</button></section>`:''}<div class="grid"><section class="panel stat"><span class="eyebrow">At the table</span><strong>${rows.length}</strong><small>League players</small></section><section class="panel stat"><span class="eyebrow">The prize to chase</span><strong>${rows[0]?.total||0}<small> pts</small></strong><small>Leading score</small></section><section class="panel stat"><span class="eyebrow">The season</span><strong>${s.episodes.filter(e=>e.locked).length} / 9</strong><small>Episodes locked</small></section></div><section class="panel"><div class="row spread"><h2>The leaderboard</h2><button id="refresh">Refresh scores</button></div><p class="muted">Weekly scores appear once drafts lock. Tied scores share a rank.</p><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Player</th><th>Preseason</th><th>Weekly</th><th>Final</th><th>Total</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${rows.findIndex(r=>r.total===p.total)+1}</td><td><b>${esc(p.name)}</b>${p.id===data.me.id?' <span class="tag">YOU</span>':''}</td><td>${p.preseason}</td><td>${p.weekly}</td><td>${p.final}</td><td class="score">${p.total}</td></tr>`).join('')}</tbody></table></div></section><section class="panel"><h2>How the season works</h2><div class="grid"><div><span class="eyebrow">Before episode 1</span><h3>Spot three Traitors</h3><p>+5 per correct prediction, plus +5 if all three are right.</p></div><div><span class="eyebrow">Episodes ${openingSize?'1':'2'}–9</span><h3>Pick a fresh team</h3><p>${openingSize?'Pick any eligible celebrities for episode 1; use role quotas from episode 2.':'Draft the required roles each episode.'} Your captain’s points count twice, including penalties.</p></div><div><span class="eyebrow">Before the finale</span><h3>Choose your side</h3><p>Faithful or Traitors? Predict the winning side for +25.</p></div></div></section>`;
 bindPreseasonLink();bindOpeningTeamLink();
 bind('#refresh','click',()=>performSave(async()=>{await refresh();notice('Scores refreshed.');},'Refreshing scores…'));
}
function draft(){
 edits.clear();
 kind??=data.state.preseasonLocked?'weekly':'preseason';
 if(kind==='weekly'&&episode===1&&!episodeOneTeamSize(data.state))episode=2;
 const s=data.state, ep=s.episodes.find(e=>e.number===episode), opening=kind==='weekly'&&episode===1, weeklyEpisodes=episodeOneTeamSize(s)?[1,2,3,4,5,6,7,8,9]:[2,3,4,5,6,7,8,9];
 const entry=data.entries.find(d=>d.player_id===data.me.id&&d.kind===kind&&d.episode===(kind==='weekly'?episode:kind==='preseason'?1:9));
 selected=[...(entry?.payload.picks||[])];captain=entry?.payload.captain||'';
 const locked=kind==='weekly'?ep.locked:kind==='preseason'?s.preseasonLocked:s.finalLocked;
 $('#view').innerHTML=`<div class="row spread"><h2>Your next move</h2><div class="row"><label>Pick type<select id="kind">${[['preseason','Preseason · original Traitors'],['weekly',`Episode team · ${weeklyEpisodes[0]}–9`],['final','Final · winning side']].map(([value,label])=>`<option value="${value}" ${value===kind?'selected':''}>${label}</option>`).join('')}</select></label>${kind==='weekly'?`<label>Episode<select id="episode">${options(weeklyEpisodes,episode)}</select></label>`:''}</div></div><section class="panel"><div class="row spread"><h3>${kind==='weekly'?(opening?`Episode 1 · ${ep.teamSize} celebrities · any role`:`Episode ${episode} · ${ep.traitors} Traitors + ${ep.faithful} Faithful`):kind==='preseason'?'Who are the original Traitors?':'Who will win the final?'}</h3><span class="tag">${locked?'LOCKED':'OPEN'}</span></div><p class="muted">${locked?(entry?'Your submitted picks are preserved. These predictions are locked.':'These predictions are locked and you have no saved submission. Contact your organiser if this looks wrong.'):kind==='weekly'?(opening?'Choose your team before episode 1, then a captain. Only events labelled Any role score in episode 1; your captain doubles those points and penalties. These picks are separate from your three preseason Traitor predictions.':'Pick your team, then nominate a captain. Other players may choose the same celebrities.'):kind==='preseason'?'Choose exactly three celebrities from the full cast, then save your predictions. You do not need to know their roles or choose a captain.':'Submit before your organiser locks predictions.'}</p><form id="picks"><div id="choices"></div><div id="captain-wrap" class="space"></div><p id="selection-status" role="status"></p><button class="primary" ${locked?'disabled':''}>${entry?'Update':'Save'} picks</button></form></section>`;
 bind('#kind','change',async()=>{const next=$('#kind').value;$('#kind').value=kind;if(!await leave())return;kind=next;draft();});bind('#episode','change',async()=>{const next=Number($('#episode').value);$('#episode').value=episode;if(!await leave())return;episode=next;draft();});
 function drawChoices(){
 if(kind==='final'){$('#choices').innerHTML=`<label>Winning side<select id="side"><option value="">Choose a side</option>${options(['Faithful','Traitors'],entry?.payload.side)}</select></label>`;$('#side').disabled=locked;return;}
 const available=s.characters.filter(c=>kind==='preseason'||(opening?(ep.roster[c.id]?.status||'Active')==='Active':ep.roster[c.id]?.status==='Active'&&['Traitor','Faithful'].includes(ep.roster[c.id]?.role))||selected.includes(c.id));
 $('#choices').innerHTML=available.length?`<div class="cast">${available.map(c=>`<button type="button" data-pick="${c.id}" aria-pressed="${selected.includes(c.id)}" class="person ${selected.includes(c.id)?'selected':''}" ${locked?'disabled':''}><span class="initial">${esc(initials(c.name))}</span><span>${esc(c.name)}<small>${kind==='preseason'||opening?esc(c.description):esc(ep.roster[c.id]?.role||'Unknown')}</small></span></button>`).join('')}</div>`:`<div class="help"><p>Weekly teams need this episode’s active celebrities and roles to be set by your organiser.</p>${episodeOneTeamSize(s)&&!s.episodes[0].locked&&!opening?'<p>You can pick an episode 1 team without knowing any roles.</p><button type="button" id="opening-team">Pick episode 1 team</button>':''}${!s.preseasonLocked?'<p>You can make preseason predictions now using the full cast.</p><button type="button" id="preseason-picks">Make preseason picks</button>':''}</div>`;
 bindPreseasonLink();bindOpeningTeamLink();
 document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const id=b.dataset.pick;selected=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];if(!selected.includes(captain))captain='';drawChoices();});
 $('#selection-status').textContent=`${selected.length}${opening?' / '+ep.teamSize:''} selected${entry?' · Previously saved; save again to submit changes.':''}`;
 $('#captain-wrap').innerHTML=kind==='weekly'?`<label>Captain · double points<select id="captain" ${locked?'disabled':''}><option value="">Choose your captain</option>${selected.map(id=>`<option value="${id}" ${captain===id?'selected':''}>${esc(s.characters.find(c=>c.id===id)?.name)}</option>`).join('')}</select></label>`:'';
 bind('#captain','change',()=>captain=$('#captain').value);
 }
 drawChoices();
 edits.track('picks',sectionNames.picks,()=>kind==='final'?{side:$('#side').value}:{picks:[...selected].sort(),...(kind==='weekly'?{captain}:{})});
 bind('#picks','submit',async e=>{e.preventDefault();let payload;
 if(kind==='weekly'){const error=validateDraft(s,episode,selected,captain);if(error)throw Error(error);payload={picks:selected,captain};}
 else if(kind==='preseason'){if(selected.length!==3)throw Error('Choose exactly three celebrities.');payload={picks:selected};}
 else {if(!$('#side').value)throw Error('Choose a winning side.');payload={side:$('#side').value};}
 const n=kind==='weekly'?episode:kind==='preseason'?1:9;
 await performSave(async()=>{
 if(demo){data.entries=data.entries.filter(d=>!(d.player_id===data.me.id&&d.kind===kind&&d.episode===n));data.entries.push({player_id:data.me.id,kind,episode:n,payload});localStorage.setItem('round-table-demo',JSON.stringify(data));}
 else await rpc('save_entry',{entry_kind:kind,episode_number:n,entry_payload:payload});
 await refresh('picks');notice('Your picks are saved.');});});
}
function cast(){
 const characters=data.state.characters;
 $('#view').innerHTML=`<h2>The castle’s residents</h2><p class="muted">${characters.length} familiar faces. Who will earn your trust? Roles are recorded by the organiser after the reveal.</p><div class="cast cast-directory">${characters.map(c=>{
 const photo=castPhotos[c.id];
 return `<article class="person cast-card"><span class="cast-portrait"><span aria-hidden="true">${esc(initials(c.name))}</span>${photo?`<img src="${esc(photo.src)}" alt="Portrait of ${esc(c.name)}" width="96" height="128" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="object-position:${esc(photo.position)};--portrait-scale:${esc(photo.scale||1)};--portrait-origin:${esc(photo.origin||'50% 35%')}">`:''}</span><div class="cast-info"><b>${esc(c.name)}</b><small>${esc(c.description)}</small><small class="cast-role">Starting role: ${esc(c.startingRole)}</small></div></article>`;
 }).join('')}</div><details class="photo-credits"><summary>Photo credits &amp; sources</summary><p>Portraits are displayed in a fitted frame. Source photographs retain their respective copyrights and licences; no endorsement is implied.</p><ul>${characters.filter(c=>castPhotos[c.id]).map(c=>{
 const photo=castPhotos[c.id];
 return `<li><b>${esc(c.name)}</b> — <a href="${esc(photo.source)}" target="_blank" rel="noopener noreferrer">${esc(photo.title)}</a> · ${esc(photo.creator)} · ${photo.licenseUrl?`<a href="${esc(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.license)}</a>`:esc(photo.license)}</li>`;
 }).join('')}</ul></details>`;
 document.querySelectorAll('.cast-portrait img').forEach(img=>{
 const fallback=()=>{img.hidden=true;};
 img.addEventListener('error',fallback,{once:true});
 if(img.complete&&!img.naturalWidth)fallback();
 });
}
function rules(){
 $('#view').innerHTML=`<h2>Every move has a price.</h2><p class="muted">The workbook’s scoring system, with organiser notes. Counts are awarded explicitly; events are not automatically inferred.</p><div class="help">Captain doubles positive and negative points. Episode 1 teams score only events labelled Any role. Preseason predictions use starting roles. Episode eligibility is frozen when drafts lock.</div>${[...new Set(data.state.rules.map(r=>r.category))].map(category=>`<section class="panel"><h3>${esc(category)}</h3>${data.state.rules.filter(r=>r.category===category).map(r=>`<div class="event"><div>${esc(r.label)}<small>${esc(r.notes)}</small></div><span class="tag">${esc(r.role)}</span><b>${r.points>0?'+':''}${r.points} pts</b></div>`).join('')}</section>`).join('')}`;
}
function playersPanel(){
 const rolesReady=data.players.every(p=>typeof p.is_admin==='boolean');
 const organisers=data.players.filter(p=>p.is_admin).length;
 return `<section class="panel" id="players-panel"><h3>Players & organisers</h3><p class="muted">Organisers can manage players and organiser access, change scoring, lock drafts and download league backups.</p><div class="table-wrap"><table><thead><tr><th>Player</th><th>Email</th><th>Role</th><th>Access</th></tr></thead><tbody>${data.players.map(p=>`<tr><td><b>${esc(p.name)}</b>${p.id===data.me.id?' <span class="tag">YOU</span>':''}</td><td>${esc(p.email||'Demo player')}</td><td>${rolesReady?(p.is_admin?'Organiser':'Player'):'—'}</td><td><button type="button" data-player="${esc(p.id)}" data-organiser="${!p.is_admin}" aria-label="${esc(p.is_admin?`Make ${p.name} a player`:`Make ${p.name} an organiser`)}" ${!rolesReady||(p.is_admin&&organisers===1)?'disabled':''}>${p.is_admin?'Make player':'Make organiser'}</button></td></tr>`).join('')}</tbody></table></div><p class="muted">${!rolesReady?'Organiser permissions are not available yet.':organisers===1?'Promote another player before removing the last organiser.':'Organisers also take part as players. Changing a role keeps their picks and scores.'}</p><form id="add" class="row"><label>Player name<input id="new-name" required maxlength="80"></label><label>Email address<input id="new-email" type="email" required></label><button class="primary">Add player</button></form><small>To add a new organiser, add them as a player, then choose Make organiser. Share the site address with them; no invitation email is sent here.</small></section>`;
}
function admin(){
 edits.clear();
 const s=data.state, ep=s.episodes[episode-1], opening=episode===1&&Boolean(episodeOneTeamSize(s));
 $('#view').innerHTML=`<h2>Behind the round table</h2><p class="muted">Save each section before moving on. Locks are permanent in the app; scoring counts can still be corrected.</p>${!episodeOneTeamSize(s)?'<div class="help">To enable episode 1 teams, run the episode 1 upgrade from the README in Supabase, then refresh the league. Existing picks and scores are preserved.</div>':''}${playersPanel()}<section class="panel"><h3>Season controls</h3><form id="season"><label class="check"><input id="prelock" type="checkbox" ${s.preseasonLocked?'checked disabled':''}>Lock preseason predictions</label><label class="check"><input id="finlock" type="checkbox" ${s.finalLocked?'checked disabled':''}>Lock final predictions</label><label>Final winning side<select id="winner">${options(['','Faithful','Traitors'],s.winner)}</select></label><details><summary>Record starting roles after episode 1</summary>${s.characters.map(c=>`<label>${esc(c.name)}<select data-start="${c.id}">${options(['Unknown','Faithful','Traitor'],c.startingRole)}</select></label>`).join('')}</details><button class="primary">Save season controls</button></form></section><section class="panel"><div class="row spread"><h3>Episode setup & scoring</h3><label>Episode<select id="admin-episode">${options([1,2,3,4,5,6,7,8,9],episode)}</select></label></div><form id="episode-form">${opening?`<label>Episode 1 team size<input id="team-size" type="number" min="1" max="${s.characters.length}" step="1" value="${ep.teamSize}" ${ep.locked?'disabled':''}></label><p class="muted">Any eligible celebrities, plus a captain. Only Any-role events score. Save the size before collecting teams, then lock episode 1 before broadcast. Lock the separate preseason predictions in Season controls too.</p>`:`<div class="row"><label>Traitor slots<input id="tslots" type="number" min="0" max="21" value="${ep.traitors}" ${ep.locked?'disabled':''}></label><label>Faithful slots<input id="fslots" type="number" min="0" max="21" value="${ep.faithful}" ${ep.locked?'disabled':''}></label></div>`}<label class="check"><input id="eplock" type="checkbox" ${ep.locked?'checked disabled':''}>Lock episode ${episode} drafts</label><details><summary>${opening?'Eligible cast before episode 1':'Active cast and roles before this episode'}</summary><p class="muted">${opening?'All celebrities are eligible unless marked otherwise here. Roles are not needed. Record the revealed starting roles in Season controls after broadcast, then copy them into episode 2.':'Record changes for this episode only. Set eliminated celebrities to their status before the next episode. Submitted teams must stay valid.'}</p>${opening?'':`<button type="button" id="copy-roster" ${ep.locked?'disabled':''}>Copy ${episode===1||episode===2&&episodeOneTeamSize(s)?'starting roles':'previous episode roster'}</button>`}<div class="table-wrap"><table><tbody>${s.characters.map(c=>`<tr><td>${esc(c.name)}</td>${opening?'':`<td><select aria-label="${esc(c.name)} role" data-role="${c.id}" ${ep.locked?'disabled':''}>${options(['Unknown','Faithful','Traitor'],ep.roster[c.id]?.role||'Unknown')}</select></td>`}<td><select aria-label="${esc(c.name)} status" data-status="${c.id}" ${ep.locked?'disabled':''}>${options(['Active','Murdered','Banished','Withdrawn','Disqualified'],ep.roster[c.id]?.status||'Active')}</select></td></tr>`).join('')}</tbody></table></div></details><button class="primary">Save episode setup</button></form><hr><form id="counts"><label>Score a celebrity<select id="scored-character" data-navigation>${s.characters.map(c=>`<option value="${c.id}" ${c.id===scoredCharacter?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><div id="events"></div><button class="primary space">Save event counts</button></form></section><section class="panel"><h3>Scoring values</h3><p class="muted">Agree changes before the season. Values are frozen after preseason locks.</p><form id="rules-form">${s.rules.map(r=>`<div class="event"><span>${esc(r.label)}</span><span>${esc(r.role)}</span><input aria-label="${esc(r.label)} points" data-points="${r.id}" type="number" value="${r.points}" ${s.preseasonLocked?'disabled':''}></div>`).join('')}<button class="primary space" ${s.preseasonLocked?'disabled':''}>Save scoring values</button></form></section><button id="export">Download league backup</button>`;
 bind('#admin-episode','change',async()=>{const next=Number($('#admin-episode').value);$('#admin-episode').value=episode;if(!await leave())return;episode=next;admin();});
 bind('#add','submit',async e=>{e.preventDefault();const name=$('#new-name').value.trim(),email=$('#new-email').value.trim().toLowerCase();if(!name)throw Error('Enter a player name.');await performSave(async()=>{if(demo){if(data.players.some(p=>p.email===email))throw Error('That email is already added.');data.players.push({id:crypto.randomUUID(),name,email,is_admin:false});localStorage.setItem('round-table-demo',JSON.stringify(data));}else await rpc('add_player',{player_email:email,player_name:name});await refresh('add');notice('Player added. They can sign in using that email.');});});
 bind('#players-panel','click',async e=>{
 const button=e.target.closest('button[data-organiser]');if(!button)return;
 const player=data.players.find(p=>p.id===button.dataset.player),organiser=button.dataset.organiser==='true';
 if(!player||!data.me.is_admin)throw Error('Organiser access required');
 if(player.id===data.me.id&&!organiser&&!await leave())return;
 await performSave(async()=>{
  if(demo){
   if(player.is_admin&&!organiser&&data.players.filter(p=>p.is_admin).length<=1)throw Error('The league must keep at least one organiser');
   player.is_admin=organiser;if(player.id===data.me.id)data.me.is_admin=organiser;
   localStorage.setItem('round-table-demo',JSON.stringify(data));
  }else await rpc('set_player_organiser',{target_player_id:player.id,organiser});
  await refresh();notice(`${player.name} is now ${organiser?'an organiser':'a player'}.`);
 });
 });
 bind('#season','submit',async e=>{e.preventDefault();const next=structuredClone(s);next.preseasonLocked=$('#prelock').checked;next.finalLocked=$('#finlock').checked;next.winner=$('#winner').value;document.querySelectorAll('[data-start]').forEach(el=>next.characters.find(c=>c.id===el.dataset.start).startingRole=el.value);if(next.preseasonLocked&&!s.preseasonLocked&&edits.changed({only:['rules-form']}).length)throw Error('Save your scoring values before locking preseason predictions.');if((next.preseasonLocked!==s.preseasonLocked||next.finalLocked!==s.finalLocked)&&!confirm('Lock these predictions? Players will no longer be able to edit them.'))return;await saveState(next,'season');});
 bind('#copy-roster','click',()=>{const source=episode===1||episode===2&&episodeOneTeamSize(s)?Object.fromEntries(s.characters.map(c=>[c.id,{role:c.startingRole,status:episode===2?(s.episodes[0].roster[c.id]?.status||'Active'):'Active'}])):s.episodes[episode-2].roster;document.querySelectorAll('[data-role]').forEach(el=>el.value=source[el.dataset.role]?.role||'Unknown');document.querySelectorAll('[data-status]').forEach(el=>el.value=source[el.dataset.status]?.status||'Active');});
 bind('#episode-form','submit',async e=>{e.preventDefault();const next=structuredClone(s),n=next.episodes[episode-1];if(opening)n.teamSize=Number($('#team-size').value);else{n.traitors=Number($('#tslots').value);n.faithful=Number($('#fslots').value);}n.locked=$('#eplock').checked;if(!ep.locked){if(opening)document.querySelectorAll('[data-status]').forEach(el=>{n.roster[el.dataset.status]={role:ep.roster[el.dataset.status]?.role||'Unknown',status:el.value};});document.querySelectorAll('[data-role]').forEach(el=>{n.roster[el.dataset.role]={role:el.value,status:document.querySelector(`[data-status="${el.dataset.role}"]`).value};});}if(n.locked&&!ep.locked&&!confirm(`Lock episode ${episode}? Its roster and draft requirements will be frozen.`))return;await saveState(next,'episode-form');});
 function events(){const id=$('#scored-character').value;$('#events').innerHTML=`<p class="muted">${characterPoints(s,episode,id)} points currently saved. ${episode===1?'Only events labelled Any role score in episode 1. ':''}Enter counts; use 1 for a yes/no event. Check eligibility at the time of the event, including any mid-episode recruitment.</p>${episodeScoringRules(s,episode).map(r=>`<div class="event"><div>${esc(r.label)}<small>${esc(r.role)} · ${esc(r.notes)}</small></div><b>${r.points>0?'+':''}${r.points}</b><input data-count="${r.id}" aria-label="${esc(r.label)} count" type="number" min="0" step="1" value="${ep.counts[id]?.[r.id]||0}"></div>`).join('')}`;}
 events();scoredCharacter=$('#scored-character').value;bind('#scored-character','change',async()=>{const next=$('#scored-character').value;$('#scored-character').value=scoredCharacter;if(!await leave({only:['counts']}))return;scoredCharacter=next;$('#scored-character').value=next;events();trackForm('counts');});
 bind('#counts','submit',async e=>{e.preventDefault();const next=structuredClone(s),id=$('#scored-character').value;const counts={...ep.counts[id]};document.querySelectorAll('[data-count]').forEach(el=>counts[el.dataset.count]=Number(el.value));next.episodes[episode-1].counts[id]=counts;await saveState(next,'counts');});
 bind('#rules-form','submit',async e=>{e.preventDefault();const next=structuredClone(s);document.querySelectorAll('[data-points]').forEach(el=>next.rules.find(r=>r.id===el.dataset.points).points=Number(el.value));await saveState(next,'rules-form');});
 for(const id of ['add','season','episode-form','counts','rules-form'])trackForm(id);
 bind('#export','click',async()=>{const backup=demo?data:await rpc('export_league');const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`round-table-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}
if(demo){
 try{data=JSON.parse(localStorage.getItem('round-table-demo'));}catch{}
 if(!data){const players=['Mark','Matty','Mac','Kat','Abi','Tom','Jon','Bobby','Kirsty'].map((name,i)=>({id:String(i),name,is_admin:i===0}));data={state:structuredClone(seed),revision:0,players,entries:[],me:{...players[0],is_admin:true}};}
 data.players=data.players.map(p=>({...p,is_admin:typeof p.is_admin==='boolean'?p.is_admin:p.id===data.me.id&&Boolean(data.me.is_admin)}));
 render();
}else{
 try{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');api=createClient(cfg.url,cfg.publishableKey);const {data:auth,error}=await api.auth.getSession();if(error)throw error;signedInEmail=auth.session?.user?.email||'';if(auth.session)await refresh();else login();}
 catch(error){accessError(error);}
}
