// Historical migration fixtures deliberately predate broadcast deadlines and episode 2's format.
import {readFileSync} from 'node:fs';
export function legacySeason(){
 const state=JSON.parse(readFileSync(new URL('../web/seed.json',import.meta.url)));
 delete state.broadcastScheduleVersion;
 for(const ep of state.episodes){delete ep.deadline;delete ep.roleNeutral;if(ep.number===2)delete ep.teamSize;}
 return state;
}
