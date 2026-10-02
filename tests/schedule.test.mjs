import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {broadcastDeadlines,entryDeadline,draftClosed,nextDraftEpisode,applyDeadlineLocks,broadcastLabel,deadlineStatus,upgradeDemoSchedule} from '../web/schedule.mjs';
import {score,validateDraft,characterPoints,episodeScoringRules} from '../web/engine.mjs';
import {legacySeason} from './legacy-season.mjs';
const seed=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
const picks=['4','5','6','7','8','9','10','11'];
test('ten UK 20:00 broadcasts, BST to GMT, and exact inclusive cutoffs',()=>{
 assert.deepEqual(seed.episodes.map(e=>e.deadline),broadcastDeadlines);
 for(const ep of seed.episodes){
  const at=Date.parse(ep.deadline);
  assert.match(broadcastLabel(ep.deadline),/20:00/);
  assert.match(broadcastLabel(ep.deadline),ep.number<9?/BST/:/GMT/);
  assert.equal(draftClosed(seed,'weekly',ep.number,at-1),false);
  assert.equal(draftClosed(seed,'weekly',ep.number,at),true);
  assert.equal(draftClosed(seed,'weekly',ep.number,at+1),true);
 }
 assert.equal(entryDeadline(seed,'preseason'),broadcastDeadlines[0]);
 assert.equal(entryDeadline(seed,'final'),broadcastDeadlines[9]);
 assert.equal(draftClosed(seed,'preseason',1,Date.parse(broadcastDeadlines[0])),true);
 assert.equal(draftClosed(seed,'final',10,Date.parse(broadcastDeadlines[9])),true);
 const s=structuredClone(seed);s.episodes[1].locked=true;
 assert.equal(draftClosed(s,'weekly',2,0),true,'Manual early locks remain closed');
});
test('next-round default, countdown, and locks do not mutate saved teams',()=>{
 const at=Date.parse('2026-10-02T08:00:00Z');
 assert.equal(nextDraftEpisode(seed,at),2);
 assert.equal(nextDraftEpisode(seed,Date.parse(broadcastDeadlines[1])),3);
 assert.match(deadlineStatus(seed,'weekly',2,at),/OPEN.*11h 0m/);
 assert.match(deadlineStatus(seed,'weekly',1,at),/CLOSED/);
 const s=structuredClone(seed);applyDeadlineLocks(s,at);
 assert.equal(s.preseasonLocked,true);assert.equal(s.episodes[0].locked,true);assert.equal(s.episodes[1].locked,false);
 assert.equal(s.finalLocked,false);
 const legacy=legacySeason();const before=structuredClone(legacy.episodes[0]);
 assert.equal(upgradeDemoSchedule(legacy),true);assert.equal(upgradeDemoSchedule(legacy),false);
 assert.deepEqual(legacy.episodes[0].counts,before.counts);assert.deepEqual(legacy.episodes[0].roster,before.roster);
});
test('episode 2 accepts any eight active celebrities and scores only neutral events; episode 3 keeps quotas',()=>{
 const s=structuredClone(seed),at=Date.parse('2026-10-02T08:00:00Z');
 assert.equal(validateDraft(s,2,picks,'4',at),'');
 assert.match(validateDraft(s,2,picks.slice(1),'5',at),/8 celebrities/);
 s.episodes[1].roster['4']={role:'Unknown',status:'Banished'};
 assert.match(validateDraft(s,2,picks,'4',at),/active/);
 s.episodes[1].roster['4'].status='Active';
 assert.match(validateDraft(s,2,picks,'4',Date.parse(broadcastDeadlines[1])),/locked/);
 assert.match(validateDraft(s,3,picks,'4',at),/active/);
 s.characters.forEach((c,i)=>s.episodes[2].roster[c.id]={role:i<2?'Traitor':'Faithful',status:'Active'});
 assert.equal(validateDraft(s,3,picks,'4',at),'');
 s.episodes[1].locked=true;s.episodes[1].counts={'4':{SHIELD_RECEIVED:1,VOTES_RECEIVED:2,TRAITOR_MURDER_SUCCESS:100},'5':{FAITHFUL_SURVIVES_EPISODE:100}};
 assert.ok(episodeScoringRules(s,2).every(r=>r.role==='Any'));
 assert.equal(characterPoints(s,2,'4'),6);
 assert.equal(score(s,[{player_id:'p',kind:'weekly',episode:2,payload:{picks,captain:'4'}}],'p').weekly,12);
 s.episodes[2].counts={'4':{TRAITOR_MURDER_SUCCESS:1}};
 assert.equal(characterPoints(s,3,'4'),10);
});
test('all three original-Traitor predictions stay intact and wait for the complete reveal',()=>{
 const s=structuredClone(seed);s.preseasonLocked=true;
 const entries=[{player_id:'p',kind:'preseason',episode:1,payload:{picks:['4','5','6']}}],saved=structuredClone(entries);
 s.characters[0].startingRole='Traitor';s.characters[1].startingRole='Traitor';
 assert.equal(score(s,entries,'p').preseason,0);
 s.characters[2].startingRole='Traitor';assert.equal(score(s,entries,'p').preseason,20);
 assert.deepEqual(entries,saved);
});
