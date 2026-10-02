import {characterPoints} from './engine.mjs';

export function celebrityStandings(state, episode=null) {
 const rounds=state.episodes.filter(ep=>ep.locked&&(episode===null||ep.number===episode));
 const rows=state.characters.map(c=>({id:c.id,name:c.name,points:rounds.reduce((sum,ep)=>sum+characterPoints(state,ep.number,c.id),0)}))
  .sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name));
 return rows.map(row=>({...row,rank:rows.findIndex(other=>other.points===row.points)+1}));
}
