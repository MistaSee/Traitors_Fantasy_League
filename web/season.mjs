// Menus and final predictions follow the installed league, including before an upgrade.
export const episodeNumbers = state => state.episodes.map(ep => ep.number);
export const finalEpisode = state => state.episodes.at(-1).number;
export const entryEpisode = (state, kind, episode) => kind === 'weekly' ? episode : kind === 'preseason' ? 1 : finalEpisode(state);

// Cached local demos need the same non-destructive move as hosted leagues.
export function upgradeDemoSeason(data, seed) {
 if(data.state.episodes.length!==9 || seed.episodes.length!==10)return false;
 if(data.state.episodes.some((ep,i)=>ep.number!==i+1))return false;
 const finals=data.entries.filter(e=>e.kind==='final');
 if(finals.some(a=>a.episode===9&&finals.some(b=>b.player_id===a.player_id&&b.episode===10)))return false;
 data.state.episodes.push(structuredClone(seed.episodes[9]));
 for(const entry of finals)if(entry.episode===9)entry.episode=10;
 data.revision++;
 return true;
}
