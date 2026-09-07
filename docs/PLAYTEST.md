# Scoring walkthrough and pre-launch playtest

Use this guide to practise an episode and check the league before inviting players. Record a pass or failure against each item; unchecked items have not been verified.

## How an organiser scores an episode

1. Open **Organiser → Episode setup & scoring** and choose the episode.
2. Before players draft, set that episode's **active cast and team requirements**, then click **Save episode setup**. Episode 1 uses any eight eligible celebrities by default, with no roles required. Episode 2 copies starting roles from Season controls; later episodes copy the previous roster. The roster describes the cast **before** the episode starts.
3. Before broadcast, tick **Lock episode N drafts** and save. Confirm the lock. Players can no longer change that episode's picks, and the roster and slot counts become fixed.
4. After watching, choose a celebrity in **Score a celebrity**. Enter how many times each scoring event happened to them in this episode.
5. Click **Save event counts** before selecting another celebrity. Repeat for the cast members who earned points or penalties.
6. Open **Standings** and choose **Refresh scores**. Other players also refresh to retrieve your saved changes.
7. Download a league backup after finishing the episode.

**Enter counts, not points.** For an event worth 8 points, enter `1` if it happened once. For two banishment votes received, enter `2`; the rule supplies the negative value automatically. Leave events that did not happen at `0`.

With the default rules, a celebrity with three confessionals, two votes received and one shield earns:

| Event | Count | Points each | Contribution |
|---|---:|---:|---:|
| Confessional/direct-to-camera appearance | 3 | +1 | +3 |
| Receives banishment votes | 2 | −1 | −2 |
| Receives or wins a shield | 1 | +8 | +8 |
| **Celebrity total** | | | **9** |

Every player who selected that celebrity gets 9 points from them. If they are the player's captain, the contribution is 18. The app calculates this for every team; you never enter points separately for each player.

To correct three confessionals to four, change the count to `4` and save. You are replacing the episode's total for that event, not adding another batch. Saving the same counts again should not award them twice. To remove an award, change its count to `0`.

### Scoring details to agree before play

- Team scoring covers **episodes 1–9** after the episode 1 upgrade. Episode 1 accepts any eight eligible celebrities plus a captain and scores **only rules labelled Any role**. Its points appear under Weekly. Three original-Traitor predictions remain a separate preseason entry. Episodes 2–9 keep their role quotas and all scoring rules.
- Preseason awards **5 points per correctly predicted original Traitor**, plus **5 for all three correct**. It uses starting roles, so later recruitment must be recorded in episode rosters rather than changing starting roles.
- Captaincy doubles penalties as well as rewards.
- Group events must be recorded for each eligible celebrity. Recording a murder, elimination or shield does not automatically award related events, change roles or update another celebrity's counts.
- Role labels and scoring notes guide the organiser. The app does not automatically enforce event eligibility, subjective-award limits, non-stacking rules or the suggested confessional cap.
- Scores for a locked episode update as each celebrity's counts are saved. There is no separate **Publish episode scores** button, so players may see an episode while it is partly scored.
- Scoring values freeze when preseason locks. Event counts can still be corrected afterwards.

Read [the scoring review](../SCORING-REVIEW.md) and agree any changes before collecting real predictions.

## Fixed issues to regression-test

The previously identified failures have been addressed:

- **Unsaved edits:** changing tab, pick type, episode or scored celebrity now prompts before discarding affected edits. **Keep editing** (or Escape) preserves the original selection and values. Saving one organiser section retains unsaved edits in the other sections; those sections still need their own save. Sign-out and the home link are guarded, and browser reload/close requests a native warning while edits or a save are pending. Browser warnings cannot protect against a device crash or forced browser termination.
- **Scoring selection:** saving event counts keeps the same celebrity and episode selected. Switching celebrity discards only that celebrity's unsaved counts after confirmation; it preserves edits elsewhere on the organiser page.
- **Episode context:** the episode selector and heading refer to the same episode. After the episode 1 upgrade, episode 1 is a valid team draft; installations awaiting that upgrade continue to start at episode 2.

A save temporarily prevents further editing and navigation. If it fails, the form remains available with its edits. When several organiser sections have changes, save scoring values before locking preseason; the app will remind you because that lock freezes the values.

Missing automatic locks, score-publication controls, event-rule enforcement and password/account-management screens are current feature limits rather than evidence that those features have passed testing.

## Prepare a safe playtest

Use a **separate test league** for the full rehearsal. Follow the [installation README](../README.md) with a separate Supabase project and an isolated app copy/deployment connected to it. For a second Cloudflare deployment, use a different Worker name and match it in that copy's `wrangler.json`. Preserve the production configuration.

A [disposable local demo](DEVELOPMENT.md#preview-the-website) is enough for practising the interface and arithmetic. It is not a substitute for testing real email delivery, database permissions or multiple accounts.

Use two email accounts you control, labelled **Player A** and **Player B** below. Start with A as an organiser and B as a normal player. Use different browser profiles, different browsers or separate devices: two ordinary tabs usually share the same signed-in account. Have one additional unlisted address available for the access check.

**Do not practise locks in the real preseason league.** Locks cannot be reopened through the app, and a downloaded backup has no one-click restore screen.

Record the app commit, browser/device and date of each test. Use the default scoring values for the arithmetic rehearsal below; if you change them, recalculate the expected results.

## Rehearse episode 1

Use a separate fresh test league for this exercise so its points do not alter the episode 2 arithmetic below. Existing installations must first run [the episode 1 migration](../migrations/20260907_episode_one.sql).

1. Leave all roles Unknown. As a normal player, choose **Pick episode 1 team**. Select Amol Rajan, Bella Ramsey, James Acaster, James Blunt, Jerry Hall, Joanne McNally, Joe Lycett and Julie Hesmondhalgh. Choose **Amol** as captain and save.
2. Verify that seven/nine selections, a missing captain and a duplicate/unknown celebrity are refused. Save a separate set of three preseason predictions and confirm both entries survive refresh.
3. As organiser, choose episode 1. Only Any-role count fields should appear. Enter **Amol: three confessionals, two votes received and one shield**; save. Enter **Bella: one successful group mission participation**; save. Leave all other counts zero.
4. Before episode 1 locks, the Weekly score is **0**. Lock episode 1: Amol contributes `9 × 2 = 18`, Bella contributes `2`, so the Weekly score is **20**. Preseason remains separately open until its own lock is set.
5. Correct Amol’s votes received from 2 to 3: Weekly becomes **18**. Save those same counts again: it stays **18**. Traitor/Faithful-specific counts in older data must contribute nothing to episode 1.
6. Try editing a locked team, its size or eligibility: these changes must fail. Counts must remain correctable. Record starting roles in Season controls, select episode 2 and copy them: the known roles should appear there while episode 1 remains locked and its score unchanged.
7. Check both locks before real broadcast: **Lock preseason predictions** and **Lock episode 1 drafts**. One does not automatically lock the other.

## A complete miniature episode

This episode 2–finale fixture assumes no episode 1 team points. Start fresh after the separate episode 1 rehearsal.

All roles and events here are fictional test data, not predictions or programme results. Start with all event counts at zero.

### 1. Submit preseason predictions

- Player A selects **Amol Rajan, Bella Ramsey and James Acaster**.
- Player B selects **Amol Rajan, Bella Ramsey and James Blunt**.
- Save both submissions. Leave **preseason unlocked** initially: both preseason scores should be zero.
- As organiser, lock preseason predictions. Set the starting roles of Amol, Bella and James Acaster to **Traitor**, and everyone else to **Faithful**. Save.
- Refresh both players: A should have **20** preseason points and B **10**.

### 2. Set up episode 2 and draft teams

Select episode 2, choose **Copy starting roles** and save. Leave the default **2 Traitor + 6 Faithful** slots and keep the episode unlocked.

Both players select the following eight celebrities:

| Traitors | Faithful |
|---|---|
| Amol Rajan | James Blunt |
| Bella Ramsey | Jerry Hall |
| | Joanne McNally |
| | Joe Lycett |
| | Julie Hesmondhalgh |
| | King Kenny |

A chooses **Amol** as captain. B chooses **Bella**. Save both teams, refresh, and confirm each player's selections and captain persist.

### 3. Enter the test events

In episode 2, enter and save these counts. Leave every other count at zero, including survival and zero-vote bonuses.

| Celebrity | Event | Count | Result |
|---|---|---:|---:|
| Amol Rajan | Confessional/direct-to-camera appearance | 3 | +3 |
| Amol Rajan | Receives banishment votes | 2 | −2 |
| Amol Rajan | Receives or wins a shield | 1 | +8 |
| Bella Ramsey | Banished as a Traitor | 1 | −10 |
| James Blunt | Faithful votes for a Traitor | 1 | +5 |
| James Blunt | Votes for the character ultimately banished | 1 | +3 |

Amol's total is **9**, Bella's **−10** and James Blunt's **8**. All other selected celebrities score zero. The shared team total before captaincy is **7**.

This rehearsal deliberately records counts while episode 2 is still unlocked to test visibility. The leaderboard's weekly points should remain **0** until you lock it. In real play, lock drafts before broadcast.

### 4. Lock and check the arithmetic

Lock episode 2, save, and refresh both players:

| Checkpoint | A preseason | A weekly | A total | B preseason | B weekly | B total |
|---|---:|---:|---:|---:|---:|---:|
| Episode 2 still open | 20 | 0 | **20** | 10 | 0 | **10** |
| Episode 2 locked | 20 | 16 | **36** | 10 | −3 | **7** |
| Amol's votes received corrected from 2 to 3 | 20 | 14 | **34** | 10 | −4 | **6** |
| Same corrected counts saved again | 20 | 14 | **34** | 10 | −4 | **6** |

A's original weekly score is `7 + 9 = 16`; B's is `7 − 10 = −3`. The extra contribution is the captain's score, since the captain was already counted once in the shared team total.

### 5. Check history and the final

Copy episode 2's roster into episode 3. Mark Bella **Banished** and change James Blunt's episode-3 role to **Traitor**, then save. Do not change starting roles. A's total must remain **34**, and B's **6**: episode 2 and preseason are unchanged by later events.

Submit **Faithful** as A's final prediction and **Traitors** as B's. Until final predictions are locked and a winner is recorded, neither gets a final bonus. Lock final predictions, set the winner to Faithful and save: A should finish on **59**, and B on **6**. If you correct the winner to Traitors, the totals should become **34** and **31** respectively.

## Playtest checklist

### Sign-in and membership

- [ ] **AUTH-01 — First sign-in:** A and B each receive the themed email, return to the correct test-site URL and see their own name. Only A initially sees Organiser.
- [ ] **AUTH-02 — Returning sessions:** refresh and reopen the browser; saved picks persist. Sign out and sign back in as the other player; the new account sees its own selections.
- [ ] **AUTH-03 — Unlisted email:** an address absent from the player list cannot read league data after authentication. It may still receive a sign-in email; league access is checked separately.
- [ ] **AUTH-04 — Used or expired link:** in a signed-out browser, a used/expired link cannot create a fresh session. Requesting a new link restores access.
- [ ] **AUTH-05 — Correct email identity:** the sender Gmail account can differ from the organiser/player address. Case differences in the same email do not create duplicate league players.

### Players and organiser access

- [ ] **PEOPLE-01 — Add and expand:** add a player, refresh and find them again. Reach at least 16 players in the test league to confirm the old limit is gone.
- [ ] **PEOPLE-02 — Invalid and duplicate entries:** empty/whitespace-only names, malformed emails and duplicate emails are rejected on the hosted test league without adding another player. Test duplicate addresses with different case and surrounding spaces.
- [ ] **PEOPLE-03 — Promote:** make B an organiser, refresh B's session and use B to save an organiser change. Picks and scores remain attached to B.
- [ ] **PEOPLE-04 — Demote:** return B to Player. B loses organiser access after refresh, and an already-open organiser page cannot successfully save further admin changes.
- [ ] **PEOPLE-05 — Last organiser:** the remaining organiser cannot be demoted. With two organisers, one can step down and continue playing.

### Predictions and drafts

- [ ] **DRAFT-01 — Preseason discovery and validation:** as a normal player before any roles are entered, My picks must default to preseason with all 21 celebrities. Make preseason picks on Standings and the empty weekly view must open the same form. Two or four selections cannot be submitted; exactly three distinct celebrities can. Unlocked predictions can be updated and survive refresh.
- [ ] **DRAFT-02 — Preseason lock:** follow the miniature episode and get A=20/B=10 after the reveal. Changes are refused after locking, including from a player tab that was opened before the lock.
- [ ] **DRAFT-03 — Weekly role quotas:** a valid 2+6 team saves. Too few/many picks and a wrong role mix are rejected, even when the overall team size is eight.
- [ ] **DRAFT-04 — Captain:** a captain is required and must be selected in the team. Removing the captain from the team clears that choice and requires a replacement.
- [ ] **DRAFT-05 — Shared teams:** A and B can select the same celebrities. One player's submission does not change the other's team.
- [ ] **DRAFT-06 — Eligibility:** Unknown-role and inactive celebrities cannot be newly selected for a weekly team. The same person remains available for preseason predictions regardless of later episode status.
- [ ] **DRAFT-07 — Smaller teams:** in another open test episode, set 1 Traitor + 3 Faithful before submissions. A valid four-person team saves. Ensure each required role has enough active celebrities available.
- [ ] **DRAFT-08 — Missing submission:** a player who does not submit gets zero for that round, with no automatic team or catch-up bonus.
- [ ] **DRAFT-09 — Episode 1:** complete the episode 1 rehearsal above, including exact 20/18 totals, separate preseason entries, role-neutral-only counts and unchanged episode 2 role quotas.

### Episode setup and locks

- [ ] **ROUND-01 — Save boundaries:** copying a roster changes the form; Save episode setup persists it. Changing the next episode does not change the previous one. After viewing organiser episode 1, open Episode team: the selector and heading must both show episode 1 once the upgrade is installed.
- [ ] **ROUND-02 — Lock enforcement:** after locking, picks, roster and slot counts cannot change. Event counts remain editable for corrections.
- [ ] **ROUND-03 — Existing submissions:** before a lock, attempting to change roles/statuses/quotas in a way that invalidates a submitted team is rejected rather than silently changing its validity.
- [ ] **ROUND-04 — Freeze rules:** point values can be changed before preseason locks and remain saved. After that lock, value changes are refused. Perform this in a separate fresh rehearsal if it would affect the arithmetic fixture.

### Scores and corrections

- [ ] **SCORE-01 — Exact totals:** complete the miniature episode and match every total in its checkpoint table, including the negative captain contribution.
- [ ] **SCORE-02 — Replace, do not accumulate:** correct a count, save it again, then refresh. Only the current count contributes. Setting a count to zero removes that award.
- [ ] **SCORE-03 — Count validation:** negative and fractional event counts are rejected on the hosted test league. Penalties are represented by positive counts against negative-value rules.
- [ ] **SCORE-04 — Correct celebrity and episode:** enter different counts for two celebrities in two episodes. Revisit each and confirm the values belong to the intended person and episode.
- [ ] **SCORE-05 — Later recruitment/elimination:** follow the history check above. Previously earned weekly and preseason points remain unchanged.
- [ ] **SCORE-06 — Final:** match the fixture's 59/6 totals and the corrected-winner 34/31 totals. Before locking or choosing a winner, final points stay zero.
- [ ] **SCORE-07 — Ties and totals:** arrange identical scores for two test players. They share a rank; a subsequent player uses competition ranking, such as 1, 1, 3. Total equals preseason + weekly + final.
- [ ] **SCORE-08 — Partial scoring:** a second player can see new points after refreshing during scoring of a locked episode. Confirm that organisers understand there is no separate publication step.

### Unsaved edits, interruptions and two organisers

- [ ] **SAVE-01 — Unsaved draft:** change a pick or captain and navigate away without saving. A warning must appear; Keep editing must preserve the team, captain and previous selector. Test preseason and final predictions as well as weekly picks. Saving or undoing the change clears the warning.
- [ ] **SAVE-02 — Unsaved scoring:** type a count, then change celebrity, episode or tab without saving. A warning must appear. Keep editing must retain both the original celebrity/episode and the typed count. Discard changes must load the newly selected saved values.
- [ ] **SAVE-03 — Repeated scoring:** save several celebrities in succession. Each save must retain that celebrity, episode and count. Switching episodes must load only that episode’s counts; reloading must retain saved values.
- [ ] **SAVE-04 — Concurrent organisers:** open the same league state in A and B as organisers. Save a scoring/setup change in A, then try to save B's older copy. B should receive a refresh/conflict message, and A's changes must survive. Refresh B and reapply intentionally.
- [ ] **SAVE-05 — Interrupted save:** on the hosted test league, disconnect the device's network before saving. The UI must not claim success. Reconnect, refresh and verify what actually persisted before retrying. A local demo saves on the device, so it cannot validate this check.
- [ ] **SAVE-06 — Rapid clicks:** double-click Save/Add on the test league. No duplicate player, duplicated award or duplicated submission is created. Record any confusing error or stale-state message.
- [ ] **SAVE-07 — Multiple edited sections:** change a count and the final winner without saving either. Save counts: the winner must remain in the form but still be unsaved. Navigating away must warn about Season controls only. Save season controls; both changes must survive reload. Repeat with a partially completed Add player form and scoring values.
- [ ] **SAVE-08 — Leaving the browser:** with unsaved edits, try the home link, sign-out, reload and closing the tab. Cancel each and verify the edits remain. Test Escape in the in-app warning. Save or undo all changes and confirm normal navigation no longer warns.

### Privacy, mobile use and supporting features

- [ ] **CHECK-01 — Player privacy:** B cannot see another player's email address or open picks in the normal player views. A normal player's API responses must also omit other players' open entries; the database tests cover this separately from the interface.
- [ ] **CHECK-02 — Trusted organiser backup:** Download league backup produces readable JSON containing players, entries and configuration. Organiser backups include open picks and player emails, so organisers are trusted and exports must stay private. No restore button is expected.
- [ ] **CHECK-03 — Phone and keyboard:** complete sign-in, preseason picks, captain choice and one organiser scoring save on a phone. Buttons and fields are usable, wide tables scroll within their container, and keyboard focus is visible on desktop.
- [ ] **CHECK-04 — News:** headlines load, their links work, Pause works, the stationary story list is usable and a reduced-motion browser avoids the scrolling animation. News updates must not alter cast roles or points.
- [ ] **CHECK-05 — Fresh deployment:** repeat the first sign-in and one saved-pick check against the deployed test site after the final code changes, rather than relying only on local demo results.

## Automated checks and launch decision

The [development guide](DEVELOPMENT.md#automated-checks) explains how to run the existing engine, news, database and browser checks. They cover core calculations, draft validation, membership, private drafts, organiser privileges, lock handling and migration behaviour. Hosted email delivery, browser/device behaviour and the manual scoring workflow still need the checks above.

On 7 September 2026, the engine/edit-state tests, six news tests and isolated SQL suite passed locally. Browser checks in a disposable demo verified discard/cancel behaviour, preseason/final/weekly edits, captain changes, copied rosters, saving one section while retaining another, rejected-player recovery, celebrity/episode scoring separation and persistence after reload. Episode 1 additionally has isolated upgrade, permissions, lock and neutral-scoring tests. These checks did not change the hosted league or verify live SMTP/network failure scenarios; the checklist remains a rehearsal to complete with real test accounts.

Before inviting the league, resolve failures involving access, lost submissions, incorrect totals, draft locks or overwritten scores. Repeat the affected regression tests after changes. Agree the subjective scoring rules and complete one whole rehearsal without having to repair live data manually.

For each problem, record:

```text
Test ID:
App commit / test URL:
Browser and device:
Account role:
Steps to reproduce:
Expected result:
Actual result:
Screenshot or exact error text:
```

Keep account passwords, sign-in links, verification codes and real private backups out of bug reports or public issues.
