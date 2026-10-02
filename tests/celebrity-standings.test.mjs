import {test} from 'node:test';
import assert from 'node:assert/strict';
import {celebrityStandings} from '../web/celebrity-standings.mjs';
test('celebrity standings sum locked rounds, exclude future counts, share ranks and retain negative scores',()=>{
 const s={characters:[{id:'a',name:'Amol'},{id:'b',name:'Bella'},{id:'c',name:'James'}],rules:[{id:'bonus',points:3},{id:'penalty',points:-5}],episodes:[
 {number:1,locked:true,counts:{a:{bonus:1},b:{bonus:1},c:{penalty:1}}},
 {number:2,locked:true,counts:{a:{bonus:1}}},
 {number:3,locked:false,counts:{c:{bonus:100}}}]};
 assert.deepEqual(celebrityStandings(s).map(r=>[r.id,r.points,r.rank]),[['a',6,1],['b',3,2],['c',-5,3]]);
 assert.deepEqual(celebrityStandings(s,1).map(r=>[r.id,r.points,r.rank]),[['a',3,1],['b',3,1],['c',-5,3]]);
 assert.ok(celebrityStandings(s,3).every(r=>r.points===0));
 assert.ok(celebrityStandings({...s,episodes:[]}).every(r=>r.points===0));
});
