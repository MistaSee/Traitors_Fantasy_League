import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeScoringRules,removeRetiredScoring} from '../web/scoring-rules.mjs';
import {episodeScoringRules,characterPoints,score} from '../web/engine.mjs';
const seed=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
const retired={id:'SHIELD_USED',role:'Any',category:'Universal',label:'Legacy event',points:4};

test('legacy shield activation never scores or appears among active rules, including before migration',()=>{
 const s=structuredClone(seed);s.rules.splice(3,0,retired);
 for(const episode of [1,2,10]){
  s.episodes[episode-1].locked=true;
  s.episodes[episode-1].counts={'4':{SHIELD_RECEIVED:1,SHIELD_USED:99,BLOCKS_MURDER_WITH_SHIELD:1},'5':{TRAITOR_MURDER_BLOCKED:1}};
  assert.ok(!activeScoringRules(s).some(r=>r.id===retired.id));
  assert.ok(!episodeScoringRules(s,episode).some(r=>r.id===retired.id));
  assert.equal(characterPoints(s,episode,'4'),18);
  assert.equal(characterPoints(s,episode,'5'),episode===1?0:-5);
  assert.equal(score(s,[{player_id:'p',kind:'weekly',episode,payload:{picks:['4'],captain:'4'}}],'p').weekly,36);
 }
 assert.equal(s.rules.length,47,'Reading old live state leaves its saved rules intact until migration');
});

test('cleanup removes only the retired rule/counts, preserves custom values and is repeatable',()=>{
 const s=structuredClone(seed);s.rules.push(retired);s.rules[0].points=123;s.preseasonLocked=true;
 s.episodes[0].locked=true;s.episodes[0].counts={'4':{SHIELD_USED:0,SHIELD_RECEIVED:1},'5':{SHIELD_USED:2},'6':{TALKING_HEAD:3}};
 s.episodes[9].counts={'7':{SHIELD_USED:1,BLOCKS_MURDER_WITH_SHIELD:1}};
 const expected=structuredClone(s);expected.rules.pop();
 for(const ep of expected.episodes)for(const counts of Object.values(ep.counts))delete counts.SHIELD_USED;
 assert.equal(removeRetiredScoring(s),true);assert.deepEqual(s,expected);
 assert.equal(removeRetiredScoring(s),false);assert.deepEqual(s,expected);
 assert.equal(removeRetiredScoring(structuredClone(seed)),false);
 // Counts without a matching rule must also be removed.
 const orphan=structuredClone(seed);orphan.episodes[1].counts={'4':{SHIELD_USED:1}};
 assert.equal(removeRetiredScoring(orphan),true);assert.deepEqual(orphan.episodes[1].counts,{'4':{}});
});
