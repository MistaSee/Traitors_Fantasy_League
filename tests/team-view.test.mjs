import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {revealedTeam} from '../web/team-view.mjs';
import {score} from '../web/engine.mjs';
const seed=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
test('open and unknown rounds never reveal picks, even if locally available',()=>{
 const entries=[{player_id:'other',kind:'weekly',episode:2,payload:{picks:['4'],captain:'4'}}];
 assert.equal(revealedTeam(seed,entries,'other',2),null);
 assert.equal(revealedTeam(seed,entries,'other',99),null);
});
test('locked team totals match standings with captain penalties and historical picks',()=>{
 const s=structuredClone(seed);s.episodes[0].locked=true;
 s.episodes[0].counts={'4':{VOTES_RECEIVED:3},'5':{SHIELD_RECEIVED:1}};
 const entries=[{player_id:'other',kind:'weekly',episode:1,payload:{picks:['4','5'],captain:'4'}}];
 const view=revealedTeam(s,entries,'other',1);
 assert.equal(view.total,2);assert.equal(view.total,score(s,entries,'other').weekly);
 assert.equal(view.picks[0].captain,true);assert.equal(view.picks[0].total,-6);
 assert.deepEqual(revealedTeam(s,entries,'missing',1),{picks:[],total:0,missing:true});
 s.episodes[1].roster['4']={role:'Traitor',status:'Banished'};
 assert.deepEqual(revealedTeam(s,entries,'other',1),view);
});
