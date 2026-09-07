# The Round Table

A mobile-friendly fantasy league for UK Celebrity Traitors series 2, adapted from the supplied workbook. Private GitHub source; free static hosting plus Supabase email sign-in and database.

## Current status

Working browser demo and tested database schema. Hosting accounts and email delivery still need connecting. Blank `web/config.js` deliberately opens a clearly labelled local demo; it is not a shared league. No live player emails, passwords or private keys are committed.

Includes 21 celebrities, all 47 workbook scoring events, preseason predictions, fresh weekly teams, captain doubling, final-side predictions, leaderboard, organiser controls, adding players without the old 15-player limit, and JSON backup download.

Read `SCORING-REVIEW.md` for proposed rules changes. Existing scoring values remain the default. Read `workbook-notes.md` for source mapping and intentional formula corrections.

## Run locally

With Python 3 and Node 22+ installed:

```sh
python3 scripts/serve.py --port 8765
node --test tests/engine.test.mjs
```

Open http://localhost:8765. Demo data belongs to that browser only; Reset demo clears it. Real play uses the database and verified email identity.

## Automatic season news

The Castle Dispatch ticker reads a news snapshot from `web/news.json`. GitHub Actions runs `scripts/update_news.py` every six hours (00:17, 06:17, 12:17 and 18:17 UTC) and commits the updated snapshot to `main`. The connected Cloudflare Pages project redeploys on those commits. An open browser checks the snapshot every five minutes and whenever you return to its tab. The local preview server refreshes news in the background too, so the demo does not depend on pulling bot commits.

No paid news API, API key or extra service is needed. The job uses standard Linux runners and at most three minutes per run (a maximum of 372 minutes in a 31-day month), within GitHub Free's 2,000 included monthly minutes if the account's other workflows leave that allowance available. Do not enable paid Actions overages. GitHub schedules can run late; the ticker shows the successful check date and flags snapshots over 48 hours old. A failed or empty feed preserves the previous headlines and fails the workflow visibly. The initial file is an actual fetched snapshot, not sample stories.

Headlines come from Google News RSS, restricted to recent UK Celebrity Traitors series 2 coverage and selected publishers. They are ordered by publication time with a per-publisher limit and simple duplicate/topic filtering; this is a recent-news feed, not a popularity ranking. Links open the publisher story via Google News. Feed availability and its third-party format are not guaranteed. Edit the query or publisher allowlist in `scripts/update_news.py` for future seasons. You can trigger **Refresh season news → Run workflow** for an immediate check.

The ticker pauses on hover and keyboard focus, has an explicit pause button, and respects reduced-motion preferences. **Top season stories** opens a stationary list with all sources and dates.

Sources: [GitHub schedule behaviour](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [GitHub Actions included usage](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Free hosting with a private repository

### Cloudflare Workers setup screen

If Cloudflare opens **Set up your application → Worker project**, you can stay on that screen. The included `wrangler.json` deploys `web/` as static assets, without a Worker script or paid backend. Use the Free plan and these settings:

| Setting | Value |
|---|---|
| Worker name | `traitors-fantasy-league` |
| Production branch | `main` |
| Build command | Leave blank |
| Deploy command | `npx wrangler deploy` |
| Root directory | Repository root (leave default; do not set to `web`) |
| Non-production branch builds | Optional; off is sufficient for this league |
| API token | Keep Cloudflare's automatically generated deployment token option |
| Build variables and secrets | None required |

Click **Deploy**. The generated `workers.dev` URL serves the same app as Pages would. Use that exact address in Supabase's Site URL and redirect allowlist. The Supabase and email setup below is unchanged. Cloudflare Access is an optional additional login layer; the app is designed to use Supabase email sign-in for league membership.

The news workflow's commits also trigger the connected Workers build. Static asset requests and storage are free; builds use the account's included build allowance. Sources: [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [static asset pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

### Cloudflare Pages alternative

Use Cloudflare Pages Free for the static interface and a Supabase Free project for authentication and database. Cloudflare connects to the private GitHub repository and deploys `web/`; the source remains private. The website is reachable by URL, but live league information requires a rostered email sign-in. A private source repository does not make the website private by itself.

Cloudflare build settings: framework None; production branch `main`; build command `exit 0`; output directory `web`. Use its included `pages.dev` address; no domain purchase is necessary. GitHub Pages from a private repository is not included in GitHub Free, so no automatic GitHub Pages deployment is configured.

As checked 7 September 2026, Supabase Free includes a 500 MB database and 50,000 monthly active users, with free projects pausing after a week of inactivity. Resume the project before the season if necessary. Cloudflare Pages Free permits 500 builds per month. Stay on free plans; no paid custom domain, compute or upgrade is required for this small league.

Sources: [GitHub Pages plans](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Cloudflare deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/), [Cloudflare limits](https://developers.cloudflare.com/pages/platform/limits/), [Supabase pricing](https://supabase.com/pricing).

## Connect the live league

1. Create a Supabase project on its Free plan. Run `schema.sql` once in its SQL editor, then run `seed.sql`. This loads cast/rules only, with no fabricated player email addresses.
2. In the SQL editor, add the organiser, substituting your real email:

```sql
insert into public.league_players(email,name,is_admin)
values(lower('YOUR_EMAIL_HERE'),'Mark',true);
```

3. Set `url` and `publishableKey` in `web/config.js` to the public project URL and publishable key. These are intended for browser use. Never put an SMTP password or Supabase service-role/secret key in GitHub or `web/`.
4. Set Supabase Auth Site URL and allowed redirect URL to the exact deployed site address, including any trailing slash. Email authentication and signups must be enabled. Unrostered authenticated users still cannot access this league.
5. Configure custom SMTP for sign-in emails. Supabase’s built-in sender only delivers to project-team members, so it is insufficient for league players. A no-domain-cost option for a small personal league is an eligible Gmail account using `smtp.gmail.com`, port 587, the full Gmail address as username and sender, and a Google app password. Enter that secret directly in Supabase’s SMTP settings, never in this repository. Google requires 2-Step Verification for app passwords and some account types do not support them. Test delivery to a second address before inviting the league. Gmail’s published personal sending limit is 500 messages/day, but anti-abuse checks can limit delivery sooner. Brevo Free is another option if you already have an authenticated sender domain; it offers 300 emails/day, but do not buy a domain merely for this app without reconsidering the free requirement.
6. Sign in as organiser and use **Organiser → Add player** for Mark’s existing league members and any newcomers. If Mark is the organiser, he already has a player record. Adding a player does not send a message; share the site URL yourself.
7. Test two different player logins and an unlisted address before starting. Confirm a player cannot edit someone else’s picks or the league configuration, and that a locked episode rejects updates.

Sources: [Supabase email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Gmail SMTP](https://support.google.com/mail/answer/7104828), [Google app passwords](https://support.google.com/accounts/answer/185833), [Gmail limits](https://support.google.com/mail/answer/22839), [Brevo free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

## Sign-in email copy

`emails/sign-in.html` contains the dark castle-themed email, with the subject **Your Round Table summons: sign in**. Follow `emails/README.md` to apply it to Supabase's **Magic Link** and **Confirm signup** templates. These hosted settings must be saved in Supabase; a GitHub push alone does not change the emails.

## Organiser workflow

Before episode 1, agree scoring values, add players and collect three preseason picks. Lock preseason before broadcast; this also freezes point values for the season. Record the original roles after the reveal.

For episode 1, copy starting roles into its roster. Before each later episode, copy the previous roster, update recruitment and eliminations, and set draft slot counts. Save setup before players draft. Roles and statuses describe eligibility **before** that episode. Do not mark a celebrity eliminated in an episode’s pre-draft roster because they leave during that episode; update the next episode instead. The server rejects changes that invalidate submitted teams.

Lock each episode manually before broadcast. The roster and slot counts are then permanent, preventing later events from changing past team validity. Enter event counts per celebrity; positive and negative events, including captain penalties, flow into the leaderboard. Count eligibility is organiser-reviewed because roles can change mid-episode. Counts are editable for corrections. Final predictions have a separate lock and score only against the final winning side.

No automatic broadcast deadlines, reminders, fallback teams, scoring preset changes or catch-up points are implemented yet. Missing submissions score zero. Backups contain private league data; keep downloads private. Restore currently requires an organiser/database operation, not an in-app upload. Refresh scores to retrieve changes; the app does not poll continuously.

## Verification

Five engine tests cover workbook imports, draft validation, original-role predictions, captain penalties, historical isolation and final scoring. `tests/database.mjs` exercises the real SQL in PGlite/PostgreSQL, including permissions, roster membership, draft privacy, invalidation prevention, locks and stale-write conflicts. `tests/browser.mjs` covers preseason persistence, adding a player, episode roster setup, drafting and mobile width.

For optional tests install `playwright` and `@electric-sql/pglite@0.3.14` in your development environment, then run the corresponding scripts. Browser tests expect a local server on port 8765 and Chromium installed through Playwright (or set `CHROME_PATH`). Hosted authentication and real email delivery require the connected accounts and remain a deployment acceptance check.
