import {characterPoints} from './engine.mjs';

// Only persisted, locked rounds may be inspected, even if an open entry is present locally.
export function revealedTeam(state, entries, playerId, episode) {
 const round=state.episodes.find(ep=>ep.number===episode);
 if(!round?.locked)return null;
 const entry=entries.find(e=>e.player_id===playerId&&e.kind==='weekly'&&e.episode===episode);
 if(!entry)return {picks:[],total:0,missing:true};
 const picks=entry.payload.picks.map(id=>{
  const celebrity=state.characters.find(c=>c.id===id);
  const points=characterPoints(state,episode,id),captain=entry.payload.captain===id;
  return {id,name:celebrity?.name||'Unknown celebrity',points,captain,total:points*(captain?2:1)};
 });
 return {picks,total:picks.reduce((sum,p)=>sum+p.total,0),missing:false};
}
