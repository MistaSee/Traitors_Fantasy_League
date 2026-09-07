export function episodeOneTeamSize(state) {
  const size = state.episodes.find(e => e.number === 1)?.teamSize;
  return Number.isInteger(size) && size > 0 ? size : 0;
}
export function validateDraft(state, episode, picks, captain) {
  const ep = state.episodes.find(e => e.number === episode);
  if (!ep) return 'Choose an episode from 1 to 9.';
  const opening = episode === 1;
  if (opening && !episodeOneTeamSize(state)) return 'Episode 1 teams are not enabled for this league yet.';
  if (ep.locked) return 'This episode is locked.';
  if (opening && picks.length !== ep.teamSize) return `Choose ${ep.teamSize} celebrities of any role.`;
  if (!opening && picks.length !== ep.traitors + ep.faithful) return `Choose ${ep.traitors} Traitors and ${ep.faithful} Faithful.`;
  if (new Set(picks).size !== picks.length) return 'Choose each celebrity only once.';
  if (!picks.includes(captain)) return 'Choose a captain from your team.';
  if (picks.some(id => !state.characters.some(c => c.id === id))) return 'Choose celebrities from this season’s cast.';
  const roster = picks.map(id => opening ? {status:ep.roster[id]?.status || 'Active'} : ep.roster[id]);
  if (roster.some(c => !c || c.status !== 'Active')) return 'Only active celebrities can be drafted.';
  if (!opening && (roster.filter(c => c.role === 'Traitor').length !== ep.traitors || roster.filter(c => c.role === 'Faithful').length !== ep.faithful)) return 'The team has the wrong mix of roles.';
  return '';
}
export function episodeScoringRules(state, episode) {
  return episode === 1 ? state.rules.filter(rule => rule.role === 'Any') : state.rules;
}
export function characterPoints(state, episode, id) {
  const ep = state.episodes.find(e => e.number === episode);
  return episodeScoringRules(state, episode).reduce((sum, r) => sum + (ep?.counts[id]?.[r.id] || 0) * r.points, 0);
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
