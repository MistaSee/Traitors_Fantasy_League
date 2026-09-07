import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDraft,score,characterPoints,episodeOneTeamSize,episodeScoringRules} from '../web/engine.mjs';
const seed=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
function fixture(){const s=structuredClone(seed);s.characters.forEach((c,i)=>{c.startingRole=i<3?'Traitor':'Faithful';s.episodes[1].roster[c.id]={role:i<3?'Traitor':'Faithful',status:'Active'};});return s;}
test('imports every rule and celebrity from the workbook',()=>{assert.equal(seed.characters.length,21);assert.equal(seed.rules.length,47);assert.deepEqual(seed.episodes.map(e=>e.traitors+e.faithful),[0,8,8,8,8,8,4,4,4]);});
test('validates role counts, duplicates, captain, elimination and locks',()=>{const s=fixture(),p=['4','5','7','8','9','10','11','12'];assert.equal(validateDraft(s,2,p,'4'),'');assert.match(validateDraft(s,2,[...p.slice(0,7),'4'],'4'),/once/);assert.match(validateDraft(s,2,p,'6'),/captain/);s.episodes[1].roster['4'].status='Murdered';assert.match(validateDraft(s,2,p,'4'),/active/);s.episodes[1].locked=true;assert.match(validateDraft(s,2,p,'4'),/locked/);});
test('preseason uses original roles and all-three bonus',()=>{const s=fixture();s.preseasonLocked=true;s.episodes[1].roster['7'].role='Traitor';assert.equal(score(s,[{player_id:'a',kind:'preseason',payload:{picks:['4','5','6']}}],'a').preseason,20);assert.equal(score(s,[{player_id:'a',kind:'preseason',payload:{picks:['4','5','7']}}],'a').preseason,10);});
test('captain doubles negative scores and later eliminations do not change history',()=>{const s=fixture();s.episodes[1].locked=true;s.episodes[1].counts={'4':{TRAITOR_BANISHED:1},'7':{FAITHFUL_VOTES_TRAITOR:1}};const entries=[{player_id:'a',kind:'weekly',episode:2,payload:{picks:['4','5','7','8','9','10','11','12'],captain:'4'}}];assert.equal(characterPoints(s,2,'4'),-10);assert.equal(score(s,entries,'a').weekly,-15);s.episodes[2].roster['4']={role:'Traitor',status:'Banished'};assert.equal(score(s,entries,'a').weekly,-15);});
test('unlocked drafts do not score; final awards exactly 25 only after lock',()=>{const s=fixture();s.winner='Faithful';const e=[{player_id:'a',kind:'final',payload:{side:'Faithful'}}];assert.equal(score(s,e,'a').total,0);s.finalLocked=true;assert.equal(score(s,e,'a').total,25);assert.equal(score(s,e,'b').total,0);});

test('episode 1 accepts eight eligible celebrities without revealed roles, separately from preseason',()=>{
 const s=structuredClone(seed), picks=['4','5','6','7','8','9','10','11'];
 assert.equal(episodeOneTeamSize(s),8);
 assert.equal(validateDraft(s,1,picks,'4'),'');
 s.preseasonLocked=true;
 assert.equal(validateDraft(s,1,picks,'4'),'','Preseason lock does not lock the episode team');
 assert.match(validateDraft(s,1,picks.slice(1),'5'),/8 celebrities/);
 assert.match(validateDraft(s,1,[...picks.slice(1),'5'],'5'),/once/);
 assert.match(validateDraft(s,1,picks,'12'),/captain/);
 assert.match(validateDraft(s,1,[...picks.slice(1),'unknown'],'5'),/cast/);
 s.episodes[0].roster['4']={role:'Traitor',status:'Withdrawn'};
 assert.match(validateDraft(s,1,picks,'4'),/active/);
 s.episodes[0].roster['4'].status='Active';
 assert.equal(validateDraft(s,1,picks,'4'),'','Revealed roles do not impose an episode 1 quota');
 s.episodes[0].locked=true;
 assert.match(validateDraft(s,1,picks,'4'),/locked/);
 delete s.episodes[0].teamSize;
 assert.equal(episodeOneTeamSize(s),0);
 assert.match(validateDraft(s,1,picks,'4'),/not enabled/);
});

test('episode 1 scores only Any-role events, including captain penalties, and keeps preseason separate',()=>{
 const s=fixture(), picks=['4','5','6','7','8','9','10','11'];
 s.preseasonLocked=true;
 s.episodes[0].counts={'4':{SHIELD_RECEIVED:1,TALKING_HEAD:3,VOTES_RECEIVED:2,TRAITOR_MURDER_SUCCESS:99},'5':{MISSION_GROUP_COMPLETE:1,FAITHFUL_SURVIVES_EPISODE:99}};
 const entries=[{player_id:'a',kind:'weekly',episode:1,payload:{picks,captain:'4'}},{player_id:'a',kind:'preseason',episode:1,payload:{picks:['4','5','6']}}];
 assert.ok(episodeScoringRules(s,1).every(r=>r.role==='Any'));
 assert.equal(score(s,entries,'a').weekly,0);
 s.episodes[0].locked=true;
 assert.equal(characterPoints(s,1,'4'),9);
 assert.deepEqual([score(s,entries,'a').preseason,score(s,entries,'a').weekly,score(s,entries,'a').total],[20,20,40]);
 s.episodes[0].counts['4'].VOTES_RECEIVED=3;
 assert.equal(score(s,entries,'a').weekly,18,'Correcting a count replaces its previous value');
 s.episodes[0].counts['4']={VOTES_RECEIVED:3,TRAITOR_MURDER_SUCCESS:99};
 assert.equal(score(s,entries,'a').weekly,-4,'Captain doubles role-neutral penalties too');
 s.episodes[1].roster['4']={role:'Faithful',status:'Banished'};
 s.episodes[1].counts={'4':{TRAITOR_MURDER_SUCCESS:1}};
 assert.equal(score(s,entries,'a').weekly,-4);
 assert.equal(characterPoints(s,2,'4'),10,'Later episodes retain all scoring rules');
});
