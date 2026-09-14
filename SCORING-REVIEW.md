# Scoring and drafting review

The workbook is a good basis: episode-by-episode shared teams avoid a draft-night scheduling problem, captaincy creates a differentiator, and the scoring rewards active play. The biggest weakness is overlapping and subjective scoring, not the spreadsheet interface.

These are proposals for discussion, not rules silently applied to the app.

## Recommended changes

| Area | Current effect | Recommendation |
|---|---|---|
| Traitor banishment vote | A Traitor voting for a banished Faithful can receive +3 for voting Faithful, +5 for voting the banished Faithful and +3 for voting the banished character: +11 before leadership bonuses. A Faithful’s correct successful vote earns +8. | Keep the universal +3 outcome bonus. Remove `TRAITOR_VOTES_BANISHED_FAITHFUL` so the Traitor gets +6 for the basic successful deception vote. Keep a separate +10 leadership award only when clearly earned. |
| Deception overlaps | Framing, misleading true information, swinging votes, pushing suspicion and leading banishment can all describe one conversation. | Award the single highest-value influence event per character per round table. Distinct actions need separate evidence; do not routinely stack them. |
| Major game move | +10 can duplicate almost any successful tactical event. | Set `POWER_MOVE` to 0 initially. Keep it only as a documented exceptional award agreed by the league. |
| Confessionals | +1 each with a suggested, unenforced cap of 3. | Enforce 3 per episode. This is mostly editing exposure, so it should not dominate. The current app shows the note but does not impose a hard cap yet. |
| Survival | Faithful survival +3; Traitors have zero-vote +3 and routine murder +10, plus deception bonuses. | Keep role quotas, which partly balance the difference. Do not claim the individual roles are equally profitable. Consider reducing routine murder to +5; test against an episode before deciding. |
| Shield | Winning, using and blocking can stack to +22 before captaincy. | Keep +8 for obtaining and +10 for blocking. Remove the +4 use bonus to simplify the outcome. |
| In-person murder | Could be +15 plus the normal +10. | Treat +15 as a replacement for the regular murder reward, not an additional +15. |
| Subjective reads | Private/public reads can multiply through repeat accusations and hindsight. | At most one public-read and one private-read award per celebrity per episode. Require a specific named target and episode timestamp. No retroactive penalty merely because a defended person is later exposed. |
| Quit/disqualification | -35/-25, doubled by captaincy, can swamp several episodes. | Decide whether to remove medical/compassionate withdrawals from quit penalties. Consider -10 for voluntary tactical quitting and -15 for disciplinary removal; publish the definition first. |
| Delayed rewards | “Buses and survives next episode” has an unclear credit episode. | Credit the bonus in the next episode, when the condition becomes true, to the team holding that character then. State this explicitly. |

I would start by removing the three redundant events above (banished-Faithful vote bonus, shield-use bonus, power move), specifying non-stacking influence awards and applying the confessional cap. Keep the remaining point values for a first playtest; avoid changing every variable at once. This is a design recommendation, not a statistically calibrated balance claim: the supplied workbook has no populated episode scores from which to estimate outcome distributions.

## Drafting upgrades

**Keep shared picks and fresh weekly teams.** More players do not consume the available celebrity pool. An exclusive snake draft would become awkward with 21 celebrities and expanding membership.

**Shrink teams based on the remaining eligible field, not just episode number.** The workbook’s 2+6 then 1+3 schedule is a sensible starting point. However, if fewer than two Traitors remain, the current requirement becomes impossible. Before opening each draft, choose quotas everyone can meet. A sensible policy is 2+6 while at least 3 Traitors and 9 Faithful remain, then 1+3 while at least 2 Traitors and 5 Faithful remain, then 1+2 where possible. If one role has no eligible characters, publish an emergency open-role rule before the draft opens; do not invent it after picks arrive. Episode 1 supports a configurable team size with no role quotas and scores only Any-role events. Episodes 2–10 still use configurable Traitor/Faithful counts; there is no emergency open-role mode for those later rounds.

**Keep captaincy at 2× initially.** It gives players a reason to choose differently when teams overlap. Negative points should double too, as implemented. If late-season results become excessively volatile, consider 1.5× in the next season rather than changing it mid-season.

**Add deadlines next.** Scheduled lock times in Europe/London, enforced by the database, are better than relying on the organiser to click Lock. Current locks are server-enforced once manually set. A visible submission receipt and a list of who has submitted (without revealing open picks) would make administration easier.

**Agree a missed-draft policy.** Zero is strict but clear and is the current behaviour. An optional fallback could reuse last week’s still-eligible selections, drop invalid ones, and fill from a preseason ranked reserve list. It must never substitute using knowledge from the new episode. This requires explicit rules and is not implemented yet.

**Protect predictions and history.** The app already uses starting roles for preseason, keeps roster snapshots per episode, locks drafts on the server, and hides other players’ open picks. An organiser export includes all entries for backup, so the organiser remains a trusted role.

**New players before the season.** Add as many as needed in the organiser form, with unique emails and display names. There is no 15-player application limit. All start at zero and can submit preseason predictions while open. If you permit late entrants, they start at zero; no automatic catch-up points are granted.

## Decisions to settle before launch

Agree the final scoring changes, evidence standard, roster-size policy, exact lock deadlines and missed-draft treatment with players. Publish the rules before taking predictions and freeze point values at the preseason lock. The initial build deliberately preserves the workbook values so changes can be reviewed first.
