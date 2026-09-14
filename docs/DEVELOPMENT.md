# Development notes

The [main README](../README.md) covers browser-based installation on Supabase and Cloudflare. These notes are for working on the source locally.

## Preview the website

Use Python 3.12 or later and run this from the repository root:

```sh
python3 scripts/serve.py --port 8765
```

Open [the local preview](http://127.0.0.1:8765/). The server serves `web/` and refreshes the cached news in the background when it is due. It can update the working copy of `web/news.json`.

With populated `web/config.js`, the preview connects to the configured Supabase project and therefore its real league data. To test real email sign-in locally, add the exact local URL to Supabase's allowed redirects as well as retaining the production URL.

For a disposable demo, use a separate local copy of the project and set its `web/config.js` to:

```javascript
window.LEAGUE_CONFIG = { url: '', publishableKey: '' };
```

Do not commit this demo configuration to the deployed branch. The demo uses browser local storage, includes sample player names and starts with no scoring events or submitted teams. Its Reset demo button clears that browser's saved demo. Demo data is not shared with other devices and is not an authentication test.

## Automated checks

Use Node 22 or later and Python 3.12 or later for parity with the GitHub workflows:

```sh
npm test
python3 -m unittest discover -s tests -p 'test_news.py'
```

These checks run in [.github/workflows/test.yml](../.github/workflows/test.yml), which also installs the pinned PGlite test dependency and runs `tests/database.mjs`. The engine cases cover workbook seed integrity, draft validation, preseason roles, captain doubling, historical eligibility, final predictions and episode 1 teams with neutral-only scoring. Five additional edit-state cases cover unsaved changes, reverted changes, navigation scope and preservation of other sections after saving. Registration cases distinguish membership failures from other errors and explain an unapplied migration. News tests cover parsing, source/date filtering and deduplication.

For the database and optional browser checks locally, install their test dependencies:

```sh
npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14 playwright
npx playwright install chromium
node tests/database.mjs
```

The database suite runs the real SQL in an isolated PGlite database. It covers ordinary-player preseason submissions before any roles are revealed, preseason lock enforcement, access permissions, private drafts, validation, locked rounds, revision conflicts, adding players, organiser promotion/demotion, last-organiser protection and preservation of data when upgrading the old RPCs. The included `tests/episode-one.database.mjs` suite also checks the episode 1 migration, repeatability, existing-data preservation, independent locks, team-size validation and neutral-only scoring. `tests/registration.database.mjs` checks verified-email registration, rejection of unverified/mismatched identities, ordinary-player-only permissions, preservation of pre-added players and organisers, retry safety, migration repeatability and locked deadlines. It does not connect to your hosted Supabase project.

For the browser suite, start the server on port 8765 **from a disposable demo copy with blank connection values**, then run this in another terminal in that copy:

```sh
node tests/browser.mjs
```

The browser suite changes its demo data, submits picks, adds a player and tests roster setup, mobile layout and the regression cases in `tests/browser-edits.mjs`: discard/cancel warnings, captain and final edits, section save boundaries, celebrity/episode selection, rejected saves and reload persistence. It expects demo mode and is not a test to run against production. It writes screenshots to `/tmp/round-table-desktop.png` and `/tmp/round-table-mobile.png`.

The test scripts also accept `PGLITE_MODULE` and `PLAYWRIGHT_MODULE` overrides for dependency import locations, and `CHROME_PATH` for an installed Chromium/Chrome executable.

Hosted sign-in and email delivery require separate checks in the deployed site. Passing local checks does not verify SMTP credentials or Supabase redirect settings.

## Data and changes

- `schema.sql` and `seed.sql` initialise a fresh project. Existing projects use the named files in `migrations/`.
- `web/seed.json` is the browser demo seed. Live scores and roles come from Supabase, not this file.
- Email HTML in `emails/` must be copied into Supabase's hosted templates to take effect.
- `scripts/update_news.py` defines the feed query, publisher filters and deduplication. `web/news.mjs` handles the ticker, refresh checks, pause behaviour and reduced-motion display.
- `join_league` registers the verified email from Supabase's authenticated identity with `is_admin=false`. It accepts only a display name, ignores user metadata for permissions and preserves existing records. `web/registration.mjs` classifies registration errors; `web/app.js` renders the join form only after the known missing-member response. Existing databases can run `migrations/20260914_team_names.sql`, which includes self-registration.
- League backups include player emails and submitted picks. Keep exported JSON, SMTP passwords and Supabase secret keys out of the repository.

## Cast photographs

`web/cast-photos.mjs` maps the workbook's stable celebrity IDs to portraits and source credits. It works with both existing Supabase leagues and the demo; no database migration is needed. Add or replace a portrait in that manifest rather than adding image fields to the league state. Keep the ID matched to the correct person.

Nineteen Creative Commons portraits are bundled in `web/images/cast/`. The manifest records the source, creator and individual licence, and the cast tab displays those credits in an expandable section. Amol Rajan's photograph is CC BY-NC-SA 2.0; the others have the licences listed alongside them. Images retain their original licences, independently of the application code. The downloaded files are unchanged; CSS fits them into portrait frames.

King Kenny and Sharon Rooney use external images from their official agency profiles. Those images are not bundled or claimed to be Creative Commons: copyright remains with their owners. Keep the agency source links with them, and check reuse permissions before redistributing those photographs separately. External images can be changed or removed by their hosts; a failed image falls back to initials without losing the name or other card details. A celebrity with no manifest entry also uses initials.

For a visual check, open **The cast** in a disposable demo at desktop and phone widths. Check all 21 faces, their names, photo credits and the initials fallback (temporarily give one portrait an invalid URL in the disposable copy). Portraits load lazily as their cards approach the screen.

### Team names

`league_players.team_name` is nullable and separate from the player’s display name. Registration and draft validation do not require it. The authenticated `set_team_name` RPC updates only the current player; empty input clears the name before episode 1 locks. Names are trimmed, limited to 80 characters and escaped on display.

A database trigger assigns defaults to unnamed players when episode 1 locks. `read_league` also fills missing defaults for late arrivals or an already-locked installation. Defaults use the player’s name plus “’s Secret Society”, within the same length limit. Chosen names are retained and players may rename later. Neither operation changes league revisions, picks or scoring. The combined team-name migration is transactional and safe to rerun.

The profile save updates only its own UI and player data, preserving unsaved draft selections and captain choices. Conversely, saving picks restores unfinished team-name edits using `EditTracker`. `tests/team-names.database.mjs` covers ownership, optional episode 1 participation, defaults, late arrivals and upgrade preservation; it runs as part of the normal database suite.
