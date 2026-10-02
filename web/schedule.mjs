// BBC One broadcast deadlines, including the return to GMT on 25 October.
export const broadcastDeadlines = [
 '2026-10-01T19:00:00Z','2026-10-02T19:00:00Z',
 '2026-10-08T19:00:00Z','2026-10-09T19:00:00Z',
 '2026-10-15T19:00:00Z','2026-10-16T19:00:00Z',
 '2026-10-22T19:00:00Z','2026-10-23T19:00:00Z',
 '2026-10-29T20:00:00Z','2026-10-30T20:00:00Z'
];
export const neutralRound = ep => ep?.number === 1 || ep?.roleNeutral === true;
export function entryDeadline(state, kind, episode) {
 return kind === 'weekly' ? state.episodes.find(ep=>ep.number===episode)?.deadline
  : kind === 'preseason' ? state.episodes[0]?.deadline : state.episodes.at(-1)?.deadline;
}
export function draftClosed(state, kind, episode, now=Date.now()) {
 const manual = kind==='weekly' ? state.episodes.find(ep=>ep.number===episode)?.locked
  : kind==='preseason' ? state.preseasonLocked : state.finalLocked;
 const deadline=Date.parse(entryDeadline(state,kind,episode));
 return Boolean(manual || Number.isFinite(deadline) && now>=deadline);
}
export function nextDraftEpisode(state, now=Date.now()) {
 return state.episodes.find(ep=>(ep.number!==1||ep.teamSize>0)&&!draftClosed(state,'weekly',ep.number,now))?.number ?? state.episodes.at(-1).number;
}
export function applyDeadlineLocks(state, now=Date.now()) {
 for(const ep of state.episodes)ep.locked=draftClosed(state,'weekly',ep.number,now);
 state.preseasonLocked=draftClosed(state,'preseason',1,now);
 state.finalLocked=draftClosed(state,'final',state.episodes.at(-1).number,now);
 return state;
}
export function broadcastLabel(deadline) {
 return deadline ? new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(deadline)) : 'Organiser sets the deadline';
}
export function deadlineStatus(state, kind, episode, now=Date.now()) {
 if(draftClosed(state,kind,episode,now))return 'CLOSED · Picks preserved';
 const remaining=Date.parse(entryDeadline(state,kind,episode))-now;
 if(!Number.isFinite(remaining))return 'OPEN · Awaiting broadcast schedule';
 const minutes=Math.ceil(remaining/60000), days=Math.floor(minutes/1440), hours=Math.floor(minutes%1440/60), mins=minutes%60;
 return `OPEN · Closes in ${days?`${days}d `:''}${hours}h ${mins}m`;
}
export function upgradeDemoSchedule(state) {
 if(state.broadcastScheduleVersion===1||state.episodes.length!==10)return false;
 state.episodes.forEach((ep,i)=>{ep.deadline=broadcastDeadlines[i];if(i<2){ep.roleNeutral=true;ep.teamSize||=8;}});
 state.broadcastScheduleVersion=1;
 return true;
}
