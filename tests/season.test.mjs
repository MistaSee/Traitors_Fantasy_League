import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {episodeNumbers,finalEpisode,entryEpisode,upgradeDemoSeason} from '../web/season.mjs';
import {validateDraft,score} from '../web/engine.mjs';
const seed=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));

test('ten-episode seeds match and episode 10 uses the late-season quota',()=>{
 const sql=readFileSync(new URL('../seed.sql',import.meta.url),'utf8');
 assert.deepEqual(JSON.parse(sql.split('$seed$')[1]),seed);
 assert.deepEqual(episodeNumbers(seed),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(finalEpisode(seed),10);assert.equal(entryEpisode(seed,'final'),10);
 const legacy=structuredClone(seed);legacy.episodes.pop();
 assert.equal(entryEpisode(legacy,'final'),9,'Old installations remain usable before the SQL upgrade');
 assert.equal(entryEpisode(seed,'preseason'),1);assert.equal(entryEpisode(seed,'weekly',9),9);
 const state=structuredClone(seed),ep=state.episodes[9],picks=['4','5','6','7'];
 assert.deepEqual([ep.traitors,ep.faithful],[1,3]);
 picks.forEach((id,i)=>ep.roster[id]={role:i?'Faithful':'Traitor',status:'Active'});
 assert.equal(validateDraft(state,10,picks,'4'),'');assert.match(validateDraft(state,11,picks,'4'),/1 to 10/);
 ep.counts={'4':{TRAITOR_MURDER_SUCCESS:1},'5':{SHIELD_RECEIVED:1}};
 const entries=[{player_id:'p',kind:'weekly',episode:10,payload:{picks,captain:'4'}},{player_id:'p',kind:'final',episode:10,payload:{side:'Faithful'}}];
 assert.equal(score(state,entries,'p').total,0);ep.locked=true;
 assert.equal(score(state,entries,'p').weekly,28,'Episode 10 includes role-specific points and doubles the captain');
 state.finalLocked=true;state.winner='Faithful';assert.equal(score(state,entries,'p').total,53);
});

test('cached demo upgrade preserves nine rounds, final picks, names and locks',()=>{
 const data={state:structuredClone(seed),revision:8,players:[{id:'p',team_name:'The Cloaks',is_admin:true}],entries:[{player_id:'p',kind:'weekly',episode:9,payload:{picks:['4'],captain:'4'}},{player_id:'p',kind:'final',episode:9,payload:{side:'Traitors'}}]};
 data.state.episodes.pop();data.state.episodes[8].locked=true;data.state.episodes[8].counts={'4':{SHIELD_RECEIVED:1}};data.state.finalLocked=true;
 const before=structuredClone(data);
 assert.equal(upgradeDemoSeason(data,seed),true);
 assert.deepEqual(data.state.episodes.slice(0,9),before.state.episodes);assert.equal(data.state.finalLocked,true);
 assert.deepEqual(data.players,before.players);assert.deepEqual(data.entries[0],before.entries[0]);
 assert.deepEqual(data.entries[1],{...before.entries[1],episode:10});assert.equal(data.revision,9);
 const after=structuredClone(data);assert.equal(upgradeDemoSeason(data,seed),false);assert.deepEqual(data,after);
});
