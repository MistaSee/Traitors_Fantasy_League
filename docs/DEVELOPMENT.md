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

These are the checks run by [.github/workflows/test.yml](../.github/workflows/test.yml). The five engine cases cover workbook seed integrity, draft validation, preseason roles, captain doubling, historical eligibility and final predictions. Five additional edit-state cases cover unsaved changes, reverted changes, navigation scope and preservation of other sections after saving. News tests cover parsing, source/date filtering and deduplication.

For the optional database and browser checks, install their local dependencies:

```sh
npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14 playwright
npx playwright install chromium
node tests/database.mjs
```

The database suite runs the real SQL in an isolated PGlite database. It covers ordinary-player preseason submissions before any roles are revealed, preseason lock enforcement, access permissions, private drafts, validation, locked rounds, revision conflicts, adding players, organiser promotion/demotion, last-organiser protection and preservation of data when upgrading the old RPCs. It does not connect to your hosted Supabase project.

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
- League backups include player emails and submitted picks. Keep exported JSON, SMTP passwords and Supabase secret keys out of the repository.
