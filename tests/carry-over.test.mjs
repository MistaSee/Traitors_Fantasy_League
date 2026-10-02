import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacySeason} from './legacy-season.mjs';
import {carryTeam,carriedPreview} from '../web/carry-over.mjs';
function fixture(){const state=legacySeason();state.characters.forEach((c,i)=>{state.episodes.forEach(ep=>ep.roster[c.id]={role:i<3?'Traitor':'Faithful',status:'Active'});});return state;}
test('shrinking quotas drop the most recent eligible picks and preserve the captain',()=>{
 const s=fixture(),picks=['5','7','8','4','9','10','11','12'];
 const previous={episode:6,payload:{picks,selectionOrder:picks,captain:'7'}};
 const actual=carryTeam(s,7,previous);
 assert.deepEqual(actual.picks,['5','7','8','9']);assert.equal(actual.captain,'7');
 assert.deepEqual(previous.payload.picks,picks,'Source entry remains unchanged');
});
test('unknown order falls back to names A–Z, elimination leaves vacancies, captain replacement is deterministic',()=>{
 const s=fixture(),previous={episode:6,payload:{picks:['12','11','10','9','8','7','6','4'],captain:'12'}};
 const expected=[...previous.payload.picks].sort((a,b)=>s.characters.find(c=>c.id===a).name.localeCompare(s.characters.find(c=>c.id===b).name));
 const retained=carryTeam(s,7,previous);assert.deepEqual(retained.picks,expected.filter(id=>id==='4'||!['4','6'].includes(id)).slice(0,4));
 s.episodes[6].roster[retained.captain].status='Banished';
 const changed=carryTeam(s,7,{episode:6,payload:{...retained,selectionOrder:retained.picks}});
 assert.equal(changed.picks.length,3);assert.equal(changed.captain,changed.picks[0]);
});
test('previews follow consecutive missed rounds, but a saved later team takes priority',()=>{
 const s=fixture(),picks=['4','5','7','8','9','10','11','12'];
 const entries=[{player_id:'p',kind:'weekly',episode:2,payload:{picks,selectionOrder:picks,captain:'4'}}];
 assert.equal(carriedPreview(s,entries,'p',7).picks.length,4);
 assert.equal(carriedPreview(s,entries,'missing',7),null);
 entries.push({player_id:'p',kind:'weekly',episode:6,payload:{picks:picks.toReversed(),selectionOrder:picks.toReversed(),captain:'12'}});
 assert.equal(carriedPreview(s,entries,'p',7).captain,'12');
});
