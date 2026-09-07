export function validateDraft(state, episode, picks, captain) {
  const ep = state.episodes.find(e => e.number === episode);
  if (!ep || episode === 1) return 'Choose an episode from 2 onwards.';
  if (ep.locked) return 'This episode is locked.';
  if (picks.length !== ep.traitors + ep.faithful) return `Choose ${ep.traitors} Traitors and ${ep.faithful} Faithful.`;
  if (new Set(picks).size !== picks.length) return 'Choose each celebrity only once.';
  if (!picks.includes(captain)) return 'Choose a captain from your team.';
  const roster = picks.map(id => ep.roster[id]);
  if (roster.some(c => !c || c.status !== 'Active')) return 'Only active celebrities can be drafted.';
  if (roster.filter(c => c.role === 'Traitor').length !== ep.traitors || roster.filter(c => c.role === 'Faithful').length !== ep.faithful) return 'The team has the wrong mix of roles.';
  return '';
}
export function characterPoints(state, episode, id) {
  const ep = state.episodes.find(e => e.number === episode);
  return state.rules.reduce((sum, r) => sum + (ep?.counts[id]?.[r.id] || 0) * r.points, 0);
}
export function score(state, entries, playerId) {
  let preseason = 0, final = 0, weekly = 0;
  const episodes = {};
  for (const entry of entries.filter(d => d.player_id === playerId)) {
    const p = entry.payload;
    if (entry.kind === 'preseason' && state.preseasonLocked) {
      const correct = p.picks.filter(id => state.characters.find(c => c.id === id)?.startingRole === 'Traitor').length;
      preseason = correct * 5 + (correct === 3 ? 5 : 0);
    }
    if (entry.kind === 'final' && state.finalLocked && p.side === state.winner) final = 25;
    if (entry.kind === 'weekly' && state.episodes.find(e => e.number === entry.episode)?.locked) {
      const points = p.picks.reduce((sum, id) => sum + characterPoints(state, entry.episode, id), 0) + characterPoints(state, entry.episode, p.captain);
      episodes[entry.episode] = points;
      weekly += points;
    }
  }
  return { preseason, weekly, final, total: preseason + weekly + final, episodes };
}
