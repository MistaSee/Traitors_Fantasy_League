import {neutralRound} from './schedule.mjs';

// Explicit selection order survives every carry. Older entries fall back to A–Z.
export function carryTeam(state, episode, previous) {
 const ep=state.episodes.find(e=>e.number===episode);
 if(!ep||!previous)return null;
 const payload=previous.payload, picks=payload.picks||[];
 const known=Array.isArray(payload.selectionOrder)&&payload.selectionOrder.length===picks.length&&new Set(payload.selectionOrder).size===picks.length&&payload.selectionOrder.every(id=>picks.includes(id));
 const byName=(a,b)=>{
  const an=state.characters.find(c=>c.id===a)?.name||a,bn=state.characters.find(c=>c.id===b)?.name||b;
  return an<bn?-1:an>bn?1:a<b?-1:a>b?1:0;
 };
 const order=known?[...payload.selectionOrder]:[...picks].sort(byName);
 const kept=[];let traitors=0,faithful=0;
 for(const id of order){
  if(!state.characters.some(c=>c.id===id))continue;
  const roster=ep.roster[id];
  if((roster?.status||(neutralRound(ep)?'Active':''))!=='Active')continue;
  if(neutralRound(ep)){if(kept.length<(ep.teamSize||0))kept.push(id);}
  else if(roster?.role==='Traitor'&&traitors<ep.traitors){kept.push(id);traitors++;}
  else if(roster?.role==='Faithful'&&faithful<ep.faithful){kept.push(id);faithful++;}
 }
 return {picks:kept,captain:kept.includes(payload.captain)?payload.captain:kept[0]||null,selectionOrder:kept,autoCarried:true,carriedFrom:previous.episode};
}

export function carriedPreview(state, entries, playerId, episode) {
 let previous=null;
 for(let n=1;n<episode;n++){
  const saved=entries.find(e=>e.player_id===playerId&&e.kind==='weekly'&&e.episode===n);
  if(saved)previous=saved;
  else if(previous)previous={episode:n,payload:carryTeam(state,n,previous)};
 }
 return previous?carryTeam(state,episode,previous):null;
}
