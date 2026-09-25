// Exclude retired events even when an existing backend has not been migrated yet.
export const activeScoringRules = state => state.rules.filter(rule => rule.id !== 'SHIELD_USED');

// Used for cached demos and exported backups; leaves every other field intact.
export function removeRetiredScoring(state) {
 let changed = false;
 const rules = activeScoringRules(state);
 if (rules.length !== state.rules.length) { state.rules = rules; changed = true; }
 for (const ep of state.episodes) {
  for (const counts of Object.values(ep.counts)) {
   if (Object.hasOwn(counts, 'SHIELD_USED')) { delete counts.SHIELD_USED; changed = true; }
  }
 }
 return changed;
}
