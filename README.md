# The Round Table

A fantasy league for **UK Celebrity Traitors, series 2**. Players sign in by email, predict the original Traitors, draft teams and compete on a shared leaderboard. Organisers manage the cast, scores, deadlines and player access.

This guide takes you from the files in GitHub to a working league using **Supabase Free** and **Cloudflare Workers Free**. You can do the installation in your browser; no terminal or programming experience is required.

**Already have a running league?** Go to [Updating an existing installation](#updating-an-existing-installation). The database setup below is for a new, empty Supabase project.

Before inviting players, use the [scoring walkthrough and playtest checklist](docs/PLAYTEST.md), including a miniature episode with exact expected scores and regression checks for the corrected issues.

## What you need

- A private GitHub repository containing this project, with `main` as its default branch.
- A [Supabase account](https://supabase.com/dashboard) and a [Cloudflare account](https://dash.cloudflare.com/), using their Free plans.
- A Gmail account that allows app passwords, to send players their sign-in codes. This can be different from the email you use to play or organise the league.
- The email address you want to use for your first organiser account.

If Gmail app passwords are unavailable, there is an [alternative email setup](#alternative-email-sender-resend) using a domain you already own.

| Service | What it does |
|---|---|
| GitHub | Stores the private source code and runs the automatic news refresh. |
| Cloudflare Workers | Hosts the website at a free `workers.dev` address. |
| Supabase | Stores players, picks and scores, and handles email sign-in. |
| Gmail or another SMTP provider | Delivers the sign-in emails requested through Supabase. |

The sign-in page is publicly reachable. Anyone who verifies their email can enter their name and join as an ordinary player. Existing players go straight to the league. Organiser access is granted separately; registration never makes someone an organiser. Players do not need GitHub, Cloudflare or Supabase dashboard accounts.

## 1. Check the files in GitHub

Open your repository and check that these are present:

| File or folder | Purpose |
|---|---|
| [web/](web/) | Website files. |
| [web/config.js](web/config.js) | Connection to your Supabase project. |
| [wrangler.json](wrangler.json) | Cloudflare deployment settings. |
| [schema.sql](schema.sql) | Creates the database tables and access rules. |
| [seed.sql](seed.sql) | Loads the celebrities, scoring rules and episodes. |
| [emails/](emails/) | Themed email templates. |
| [.github/workflows/](.github/workflows/) | Automated checks and news updates. |

Keep the repository **Private**. If you are setting up a separate league from a copy of this project, replace the existing Supabase connection values with your own in step 4.

When a step asks you to copy a file, open it in GitHub and use **Copy raw file** or **Raw** to copy its full contents. For HTML emails, copy the code rather than the text of a rendered preview.

## 2. Create your Supabase project

1. Open the [Supabase dashboard](https://supabase.com/dashboard).
2. Create or select an organisation on the **Free** plan.
3. Choose **New project** and give it a name, such as `Traitors Fantasy League`.
4. Create a database password and save it somewhere private. You will not put this password in the website.
5. Choose a region close to your players and create the project.
6. Wait for Supabase to finish setting it up.

Keep this project open in a browser tab for the next steps.

## 3. Create the database and your organiser account

### Create the tables

1. In Supabase, open **SQL Editor** and start a new query.
2. Copy all of [schema.sql](schema.sql) into the query.
3. Click **Run**.

**Expected result:** a success message, usually **Success. No rows returned**.

### Load the celebrities and rules

1. Start another new query.
2. Copy all of [seed.sql](seed.sql) into it.
3. Click **Run**.

This loads **21 celebrities, 47 scoring rules and 10 episodes**. It does not create player accounts or import anyone's old picks. Celebrity roles start as **Unknown**; organisers enter them after the show's reveal.

To check the import, run this in a new query:

```sql
select
  jsonb_array_length(state->'characters') as celebrities,
  jsonb_array_length(state->'rules') as scoring_rules,
  jsonb_array_length(state->'episodes') as episodes
from public.league_config
where id = 1;
```

**Expected result:** one row containing `21`, `46` and `10`.

### Add yourself as the first organiser

In another new query, paste the following. Replace the example email and name with your own, keeping the single quotes:

```sql
insert into public.league_players (email, name, is_admin)
values (lower(trim('you@example.com')), 'Your name', true);
```

Click **Run**. Use this exact email when you first sign in to the league. Your organiser is also a player and can submit picks.

Run the table creation, seed import and initial organiser insert **once on a fresh project**. If something already exists, use the [troubleshooting notes](#troubleshooting); do not delete the tables to retry setup.

## 4. Connect the website to Supabase

You need two public connection values: the **Project URL** and the **publishable key**.

1. In Supabase, open the project's **Connect** dialog and find the application/API connection details. The publishable key is also available under the project's **Settings → API Keys**.
2. Copy the Project URL. It looks like `https://YOUR_PROJECT_REF.supabase.co`. If you only have the project ID/reference, put it between `https://` and `.supabase.co`.
3. Copy the publishable key, which starts with `sb_publishable_`.
4. In GitHub, open [web/config.js](web/config.js) and click the pencil icon to edit it.
5. Replace the values with your own, keeping the surrounding JavaScript:

```javascript
window.LEAGUE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_YOUR_KEY'
};
```

6. Click **Commit changes** and save to `main`.

The publishable key is intended for browser use. Your database password, SMTP app password and Supabase secret/service-role keys belong outside this file and outside GitHub. [Supabase's API key guide](https://supabase.com/docs/guides/getting-started/api-keys)

## 5. Deploy the website on Cloudflare

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Go to **Workers & Pages → Create application**.
3. Choose **Import a repository** and connect your GitHub account.
4. Allow Cloudflare to access this private repository, then select it.
5. On **Set up your application**, enter these settings:

| Setting | What to enter |
|---|---|
| Worker/project name | `traitors-fantasy-league` |
| Production branch | `main` |
| Build command | Leave blank. |
| Deploy command | `npx wrangler deploy` |
| Root directory | Leave at the repository root. Do not change it to `web`. |
| Builds for non-production branches | Off is sufficient. |
| Protect with Cloudflare Access | Leave unchecked; players use the app's email sign-in. |
| API token | Use the automatically generated deployment token option. |
| Build variables / variable values / secrets | Leave blank. |

The Worker name must match `name` in [wrangler.json](wrangler.json). If you choose a different name, edit that file in GitHub to match. The same file already tells Cloudflare to publish the `web` folder.

Click **Deploy** and wait for the build to succeed. Open the resulting **production** URL, which will look like:

```text
https://traitors-fantasy-league.YOUR_SUBDOMAIN.workers.dev/
```

**Expected result:** the dark Round Table website with an **Enter the castle** email sign-in form. Keep the production URL handy. Finish the next two steps before requesting a sign-in email.

Cloudflare will deploy future commits to `main` automatically. [Cloudflare repository setup](https://developers.cloudflare.com/workers/ci-cd/builds/) · [Build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

## 6. Configure email authentication

1. Return to Supabase and open **Authentication → URL Configuration**.
2. Set **Site URL** to your Cloudflare production URL, including the final `/`.
3. Save it.
4. Under **Redirect URLs**, add the same complete URL and save.
5. In Authentication's sign-in/provider settings, ensure **Email** and **Allow new users to sign up** are enabled. Keep email confirmation enabled.

The two URLs should match the site you actually open. Players enter the emailed code on the page they already have open. The app retains `emailRedirectTo` so existing link emails still work during the transition; keep the canonical site and allowed redirect configured. [Supabase redirect guide](https://supabase.com/docs/guides/auth/redirect-urls)

New players create their authentication account on their first sign-in. After verifying their email, they enter their name and click **Join the league**. This creates their player entry with ordinary player permissions. Anyone with the site address can join; player email addresses and organiser controls remain restricted to organisers, and open drafts stay private.

## 7. Set up email delivery

Supabase's default email sender only delivers to members of your **Supabase project team**, with a very small sending allowance. Configure **Custom SMTP** for league players; adding people to the app's player list does not change the default sender's restriction. [Supabase email delivery guide](https://supabase.com/docs/guides/auth/auth-smtp)

### Use Gmail

1. Sign in to the Google account that will **send** the league's emails.
2. Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification) if it is not already enabled.
3. Open [App passwords](https://myaccount.google.com/apppasswords).
4. Create an app password named **Traitors League**.
5. In Supabase, open **Authentication → Email → SMTP Settings** and enable **Custom SMTP**.
6. Enter the following, replacing the example Gmail address with yours:

| Setting | Value |
|---|---|
| Sender email | `your-sender@gmail.com` |
| Sender name | `The Round Table` |
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `your-sender@gmail.com` |
| Password | The Google app password you just generated. |

Enter the app password directly into Supabase, then **Save**. Use the same Gmail address for Sender email and Username. Your organiser can sign in with a different email address.

If Google says **This setting is not available for your account**, check that 2-Step Verification is on and that you are signed into the intended Google account. Some managed accounts and security configurations do not allow app passwords. Try another eligible Gmail account or the alternative below. [Google app-password help](https://support.google.com/accounts/answer/185833) · [Google SMTP settings](https://support.google.com/mail/answer/7104828)

### Alternative email sender: Resend

Use this option if you already own a domain and can edit its DNS records. The Gmail route above does not require a domain purchase.

1. Create a [Resend](https://resend.com/) account on the **Free** plan.
2. Add your domain and follow Resend's instructions to verify its sending records in your DNS settings. Keep your existing mailbox's receiving/MX configuration intact; receiving email through Resend is optional.
3. Wait until Resend marks the domain verified.
4. Create an API key for sending emails, scoped to that domain where available.
5. In Supabase's **SMTP Settings**, use a sender at that verified domain, such as `league@your-domain.example`, with sender name **The Round Table**.
6. Set Host to `smtp.resend.com`, Port to `465`, Username to `resend`, and Password to your Resend API key. Save.

Resend Free currently includes **3,000 emails per month**, capped at **100 per day**. Stay on the Free plan. [Pricing](https://resend.com/pricing) · [Domain verification](https://resend.com/docs/dashboard/domains/introduction) · [Supabase SMTP setup](https://resend.com/docs/send-with-supabase-smtp)

## 8. Add the themed email templates

In **Supabase → Authentication → Emails**, open the templates and use these subjects and HTML files:

| Supabase template | Subject | Copy this HTML file |
|---|---|---|
| Magic Link | Your Round Table summons: sign in | [sign-in.html](emails/sign-in.html) |
| Confirm signup | Your Round Table summons: sign in | [sign-in.html](emails/sign-in.html) |
| Invite user | Your invitation to the Round Table | [invite-user.html](emails/invite-user.html) |
| Change email address | The Round Table: confirm your email change | [change-email-address.html](emails/change-email-address.html) |
| Reset password | The Round Table: reset your password | [reset-password.html](emails/reset-password.html) |
| Reauthentication | The Round Table: your verification code | [reauthentication.html](emails/reauthentication.html) |

**For an existing installation, deploy the website with code entry before changing these hosted templates.** Already-open login pages should be refreshed.

For the sign-in flow, replace the subject and full HTML body of both **Magic Link** and **Confirm signup** with [sign-in.html](emails/sign-in.html), then **Save**. That shared template displays `{{ .Token }}` and deliberately contains no `{{ .ConfirmationURL }}` or clickable authentication button. Returning and first-time players therefore receive the same themed OTP email without duplicating the HTML in this repository.

In the project's email authentication settings, set the OTP length to **8 digits**. The app accepts 6–10 digits for compatibility, while Supabase enforces the configured length. Keep the email resend interval at 60 seconds to match the website countdown. Changes apply only to newly sent emails. A GitHub commit does not update these Supabase settings. [Supabase template guide](https://supabase.com/docs/guides/auth/auth-email-templates)

The app uses numeric OTPs because corporate and university email security products can inspect or pre-fetch one-time links, consuming a magic link before the player uses it. The extra templates are ready for future account features; the app has no password-reset, email-change or reauthentication screens. See [email template notes](emails/README.md) before enabling those flows.

## 9. Sign in and add your players

1. Open your Cloudflare production URL.
2. Enter the email you added as the first organiser in step 3.
3. Click **Send sign-in code**, open the email and enter its eight-digit code on the website.
4. Confirm that the page reloads and opens the league with your name and an **Organiser** tab.
5. Open **Organiser → Players & organisers**.
6. Share the website address with players. They enter their email, enter the eight-digit code from the email, enter their name and click **Join the league**. There is no old 15-player limit.
7. You can also pre-add someone under **Organiser → Players & organisers → Add player**. Using that exact email then takes them straight into their existing player entry, with its name and picks preserved.

Adding a player grants league access but **does not send an invitation email**. Players request their own sign-in codes from the website. The **Invite user** email template is used only if an invitation is sent through Supabase; a verified recipient who has no player entry can now enter their name and join. New arrivals can submit only for rounds that remain open; registration does not reopen deadlines or award catch-up points.

To add another organiser, click **Make organiser** beside an existing player. Add new people as players first, then promote them. All organisers have the same controls, including scoring, locks, backups and organiser permissions. **Make player** removes those privileges while preserving picks and scores. The app prevents removing the last organiser. Newly promoted organisers should refresh the website.

**Check before sharing widely:** have a real player sign in from another browser or device, save preseason picks and refresh to confirm they persist. Their account should have no Organiser tab. Use a separate demo or test league to practise locking drafts, because live locks are permanent in the app.

## 10. Check the automatic news ticker

1. In GitHub, open the repository's **Actions** tab. Enable workflows if GitHub asks.
2. Select **Refresh season news**.
3. Click **Run workflow**, choose `main`, and start it.
4. Wait for the run to succeed and the resulting Cloudflare deployment to finish, then refresh the site.

**Expected result:** recent headlines in **Castle dispatch**, with a refreshed check date under **Top season stories**.

The included workflow runs every six hours at **00:17, 06:17, 12:17 and 18:17 UTC**. It fetches recent coverage from Google News RSS, filters publishers and duplicate stories, and commits the snapshot to GitHub. Cloudflare deploys that commit; open browsers check for news every five minutes. Schedules can be delayed. A failed refresh preserves the last successful headlines, with a stale notice after 48 hours. [GitHub schedule behaviour](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

No paid news API or API key is required. If the workflow cannot push a commit, check repository/organisation Actions policies and branch rules: [.github/workflows/news.yml](.github/workflows/news.yml) requests permission to write the news file to `main`.

## Populate and run the league

The celebrity list is already supplied in [seed.sql](seed.sql), adapted from the original workbook. [web/seed.json](web/seed.json) supplies the local demo. The live app reads its league state from Supabase; editing the demo seed alone will not update an existing league.

The news feed updates headlines only. **Organisers enter starting roles, recruitment, eliminations and scoring events manually.** Read [workbook-notes.md](workbook-notes.md) for the source mapping and [SCORING-REVIEW.md](SCORING-REVIEW.md) for suggested scoring improvements. The workbook's scoring values are the defaults; recommendations have not been applied automatically.

### Before the season

1. Agree scoring values under **Organiser → Scoring values**.
2. Add players and collect their three preseason Traitor predictions. Players choose **Make preseason picks** on Standings, or open **My picks**, which defaults to preseason while predictions are open. They select exactly three celebrities and click **Save picks**; no roles, roster setup or captain are required.
3. Collect a **separate episode 1 team** using **Pick episode 1 team** on Standings (or **My picks → Episode team → Episode 1**). The default is **any eight eligible celebrities plus a captain**, with no role quotas. Organisers can change **Episode 1 team size** before teams are submitted.
4. Preseason predictions and episode 1 teams close automatically at the first BBC broadcast deadline. The organiser can close either earlier. The preseason lock also freezes scoring values for the season.
5. After the reveal, record the original roles under **Season controls → Record the original roles after the full reveal** and save. Do not change episode 1’s frozen roster.

All episodes use the full scoring rules, including Faithful and Traitor events. Episodes 1 and 2 still allow any eight eligible celebrities and a captain, regardless of role. Award counts only for events that happened, using the celebrity’s role at the time; leave events that did not happen at zero. Captaincy doubles positive and negative points. Weekly team scores remain separate from preseason predictions, which settle once all three original Traitors are recorded.

### Each episode

1. For episodes 1 and 2, check the eligible cast before collecting picks. Players choose any eight eligible celebrities and a captain. Unknown roles are allowed when drafting; full scoring applies once events and roles are known.
2. Before episode 3, choose **Copy starting roles**, update anyone eliminated and save. For episodes 4–10, copy the previous episode's roster, update recruitment and eliminations, and save **before the deadline**. Rosters describe who is active before the episode. Leave unresolved roles as Unknown until the reveal.
3. Check the draft quotas. Defaults are 2 Traitors + 6 Faithful for episodes 3–6, then 1 + 3 for episodes 7–10. Adjust before teams are submitted if the remaining cast requires it.
4. Players can change their team and captain before each broadcast. Celebrities can appear on multiple teams. Captaincy doubles positive and negative points. If a player does nothing, their previous team carries over automatically.
5. Drafts close automatically at **20:00 UK time** on the published broadcast date. You can lock a round earlier. Its roster and requirements then become fixed; event counts remain editable.
6. Record each celebrity's event counts and save. Check **Entries to review** for late legacy submissions or carried teams with unfilled places. Players can use **Refresh scores** to retrieve the latest totals.

Before the finale, collect final-side predictions: these close automatically at the episode 10 deadline. After the result, record **Faithful** or **Traitors** as the winner. A correct final prediction earns 25 points.

### Automatic team carry-over

Only weekly teams carry forward. A player's own saved team for a round always takes priority. Otherwise, at the deadline the database creates a team from their previous round, including through several missed rounds. Players do not need to visit the site or sign in for this to happen. My picks shows a preview before the deadline.

- Retain active celebrities, within the new round's team size or role quotas.
- Keep earlier selections first, dropping later selections when a quota shrinks. Existing submissions store picks in the order they were selected, and new submissions also record explicit selection order. If that order is explicitly unknown or unusable, retain names in alphabetical order from A onwards, dropping names at the end. **Carry-over priority** on My picks shows the order; remove and reselect someone to move them to the end, then save.
- Keep the captain if retained; otherwise the first retained pick becomes captain.
- Do not invent replacements. Eliminations or role quotas may leave vacant places, which earn no points. Players can fill these and save a complete team before the deadline. Retained picks still score if the player takes no action.
- A player with no previous weekly team receives no automatic first team. Preseason and final predictions never carry over.

Existing entries are never rewritten or removed. Review flags do not disqualify entries or alter scores. A legacy entry's last-save time does not reveal what any previous version contained. Take a **Download league backup** after major updates and keep the JSON file private; restoring a backup requires a database operation.

### BBC One broadcast schedule

All deadlines are **20:00 Europe/London**, including the change from BST to GMT. The premiere on 1 October was one extended main episode; *Uncloaked* and *Traitor or Faithful? Claudia Decides* are extras and do not create fantasy rounds. [BBC announcement](https://www.bbc.co.uk/mediacentre/2026/the-celebrity-traitors-series-2-air-date-trailer), [BBC episode 1](https://www.bbc.co.uk/programmes/m0030pxt), [full schedule](https://www.radiotimes.com/tv/entertainment/reality-tv/celebrity-traitors-season-2-release-schedule/).

| Episode | Date (2026) | UK deadline |
|---|---|---|
| 1 | Thursday 1 October | 20:00 BST |
| 2 | Friday 2 October | 20:00 BST |
| 3 | Thursday 8 October | 20:00 BST |
| 4 | Friday 9 October | 20:00 BST |
| 5 | Thursday 15 October | 20:00 BST |
| 6 | Friday 16 October | 20:00 BST |
| 7 | Thursday 22 October | 20:00 BST |
| 8 | Friday 23 October | 20:00 BST |
| 9 | Thursday 29 October | 20:00 GMT |
| 10 | Friday 30 October | 20:00 GMT |

The database enforces deadlines using its own clock, even for stale browser pages. Locks and carried teams are materialised on the next league read or organiser save; no paid scheduler is needed. The roster must be prepared before the deadline even when nobody opens the site at broadcast time. If the BBC reschedules a broadcast, update the future deadline through a reviewed database change; closed rounds cannot be reopened from the app.

## Updating an existing installation

### Broadcast deadlines, episode 2 and carry-over (2 October 2026)

1. Deploy the latest website from `main` through Cloudflare.
2. In **Supabase → SQL Editor → New query**, run the whole [broadcast schedule upgrade](migrations/20261002_broadcast_schedule.sql), **after all older migrations**. It requires the existing ten-episode league.
3. Refresh the site. Check the next broadcast banner, episode 2's any-eight format and **Organiser → Entries to review**.

Existing sessions remain valid: nobody needs to sign out, register again or request another email. Players only need to refresh to see the new controls. Players who leave their teams untouched get automatic carry-over.

The transactional upgrade is safe to rerun. It preserves existing players, entries, event counts and manual locks, and flags late/incompatible historical entries without deleting them. New installations already include the functions and schedule in `schema.sql` and `seed.sql`. Do not reapply an older migration afterwards, because historical files replace some of the same functions.


Website changes committed to `main` deploy through Cloudflare. Database changes and email-template changes are separate:

| Change | What to do |
|---|---|
| Website code, styling or public connection settings | Commit to `main`, wait for Cloudflare to deploy, then refresh. |
| A database migration | Run the specified file in Supabase's SQL Editor. |
| Email subject or HTML | Copy it into the matching Supabase email template and save. |
| Scores, draft eligibility and player roles | Save through the Organiser controls. |

### Scoring cleanup (25 September 2026)

The shield cleanup left 46 scoring rules (47 with the recruitment bonus below). Receiving a shield earns **+8** and blocking an attempted murder earns **+10**. These can total **18 points**, or **36 for the captain**. There is no separate activation bonus.

The updated website applies this scoring to existing leagues immediately, including previously recorded events. To clean the stored Supabase rules and counts too:

1. Copy the whole [scoring cleanup migration](migrations/20260925_retire_shield_activation.sql).
2. Open your existing project in **Supabase → SQL Editor → New query**, paste it and click **Run**.
3. Refresh any open league tabs before saving further changes.

This removes only the retired rule and its counts. All other point values, events, players, picks, rosters and locks are preserved. It works after preseason locks, prevents old clients from restoring the retired event, and is safe to rerun. Any points previously awarded for that event no longer contribute to totals. Fresh installs already include the change; do not rerun the seed on an existing league.

### Organiser accounts on older installations

For organiser management on an older installation, run [migrations/20260907_organisers.sql](migrations/20260907_organisers.sql) in Supabase, then refresh the website. This migration can be rerun and preserves players, picks, scores and existing organiser roles. Fresh installs using the current `schema.sql` already include it.

### Extend the league to ten episodes

Series 2 has ten episodes. Fresh installations already include episode 10. For an existing nine-episode league:

1. Open [migrations/20260914_ten_episodes.sql](migrations/20260914_ten_episodes.sql) and copy the **whole file**.
2. In Supabase, open **SQL Editor → New query**, paste it, then select **Run**.
3. Wait for **Success**, then refresh the website. Player and organiser episode menus should include **10**, and the season counter should show **/ 10**.

The upgrade adds an open episode 10 with **1 Traitor + 3 Faithful**, a captain, and all the usual scoring rules. Its roster and event counts start empty: before collecting episode 10 teams, copy episode 9’s roster in **Organiser**, update eligibility and save. The organiser can adjust the quota before teams are submitted.

Saved final-side predictions move from round 9 to round 10 with their choices and timestamps preserved. Weekly episode 9 picks stay in episode 9. Existing scores, player/team names, organiser permissions and locks are preserved; no locked prediction is reopened. Correct final-side predictions still earn **25 points**.

This migration is transactional and safe to rerun. It updates two functions and the season data; it does not delete records or drop tables or triggers. Run it **after** any older episode 1 migration, since that historical file contains the old nine-episode checks. Website deployment alone does not update the Supabase season. No additional service or cost is needed.

### Optional team names

Players enter their own name when joining. In **My picks**, they can separately choose a **Team name (optional)** and select **Save team name**. The saved team name appears above their picks and on the league table, with their player name underneath on the table. Existing players can use the same form. Names may contain up to 80 characters and can be changed later.

**Naming a team never blocks joining or saving picks**, including an episode 1 squad. Unnamed players see a warning: if they have not chosen a name when the organiser locks **episode 1**, the league assigns one such as **Mark’s Secret Society**. Locking preseason predictions alone does not trigger this. Named teams keep their chosen names; late arrivals get a default if episode 1 is already locked. Players can rename an assigned team at any time. This uses the existing database and needs no scheduler or paid service.

For an existing installation, run the whole [migrations/20260914_team_names.sql](migrations/20260914_team_names.sql) file in **Supabase → SQL Editor → New query → Run**, then refresh the website. It also includes the earlier self-registration upgrade, so there is no need to run that separately. The migration preserves player identities, names, picks, scores, locks and organiser roles and is safe to rerun. Fresh installs already include this in `schema.sql`.

### Enable players to join themselves

This fixes the case where a player receives and follows a sign-in email, then sees **Your email is not on this league**.

1. Open [migrations/20260914_team_names.sql](migrations/20260914_team_names.sql) in GitHub and copy the **whole file**.
2. Open your existing project in [Supabase](https://supabase.com/dashboard), choose **SQL Editor → New query**, paste it and click **Run**.
3. Wait for **Success**, then refresh the league website. A verified email without a player entry will see **What shall we call you?** Enter your name and click **Join the league**.

Anyone who verifies their email can then join as an ordinary player. The combined migration enables registration and optional team names, and is safe to rerun. Existing player IDs, names, picks, organiser permissions, scores and locks are preserved. It also works for accounts that verified their email before the upgrade: refresh their existing signed-in page; a new email is needed only if they are no longer signed in. No email-template change or paid service is required.

The first organiser still needs the initial organiser insert from step 3. Registration deliberately never grants organiser access, even when there are no organisers yet. Website deployment alone cannot apply this database upgrade. Fresh installs using the current `schema.sql` already include it.

### Enable episode 1 teams on an existing league

1. Download a league backup from **Organiser**.
2. Open [migrations/20260907_episode_one.sql](migrations/20260907_episode_one.sql) in GitHub and copy the **whole file**.
3. Open your existing project in [Supabase](https://supabase.com/dashboard), choose **SQL Editor → New query**, paste the SQL and click **Run**.
4. Wait for **Success**, then refresh the website. Standings will show **Pick episode 1 team** if that episode is open. Under **Organiser → Episode 1**, the default team size is 8.

The migration updates two database functions and adds the episode 1 size. It preserves players, saved predictions, scores, cast history and locks, and is safe to rerun. If episode 1 is already locked, it stays locked; the migration does not reopen it. Later episodes keep their role quotas. No paid service or extra hosting is needed.

Until the episode 1 upgrade is run, the website keeps the existing draft flow starting at episode 2. If you also need the ten-episode upgrade above, run it after this older migration. Fresh installations using the current `schema.sql` and `seed.sql` already include episode 1.

Do not rerun `schema.sql` or `seed.sql` as a routine update. They are initial setup files, not migrations.

## Keeping hosting free

Plan details checked **7 September 2026**. This setup is designed for a small league within the providers' free allowances; account usage by other projects also counts.

- **Cloudflare:** use Workers Free and the included `workers.dev` address. This app serves static assets, whose requests and storage are free. Builds use the account's included allowance. [Static asset pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- **Supabase:** Free includes a 500 MB database and 50,000 monthly active users, with two active free projects. Free projects can pause after one week of inactivity; check the dashboard and resume your project before play if needed. [Supabase pricing](https://supabase.com/pricing)
- **GitHub Actions:** GitHub Free includes 2,000 monthly minutes for private repositories. Each scheduled news job has a three-minute timeout, allowing up to 372 minutes across a 31-day month, plus other checks and manual runs. Keep paid usage disabled and stay within the shared allowance. [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- **Email:** use your existing eligible Gmail account or Resend Free with an existing domain. Supabase initially limits custom SMTP to 30 emails per hour; review **Authentication → Rate Limits** if login traffic needs it, within your sender's allowance. [SMTP rate limits](https://supabase.com/docs/guides/auth/auth-smtp)

## Troubleshooting

| What you see | What to check |
|---|---|
| **LOCAL DEMO** on the hosted site | `web/config.js` has blank connection values. Complete step 4 and wait for Cloudflare to deploy. Demo changes stay in that browser. |
| Cloudflare build fails or reports a Worker name mismatch | Use the repository root, deploy command `npx wrangler deploy`, and a Worker name matching `wrangler.json`. Open the failed build log for the exact error. |
| Supabase says a table/relation **already exists** | The project has already had setup SQL run. Check what is installed and use migrations for updates; do not drop the league tables. |
| **Could not find the function read_league** | Confirm `schema.sql` ran successfully and `web/config.js` points to that same project. |
| **Email address not authorized** | Custom SMTP has not been successfully configured. Complete step 7; the default sender is restricted to the Supabase project team. |
| **Error sending confirmation email** | Check the SMTP host, port, username and app password. Use an app password rather than your normal Google password. Check Supabase's authentication logs for details. |
| Email sends are rate-limited | Wait before retrying and check Authentication's Rate Limits and your sender's limits. Repeated requests can make the delay worse. |
| The sign-in email contains a link or button instead of a code | Apply `emails/sign-in.html` to both Magic Link and Confirm signup under **Authentication → Emails**. Both must use `{{ .Token }}`, not `{{ .ConfirmationURL }}`. |
| The code is rejected or has expired | Confirm the Supabase OTP length is 8, request a fresh sign-in code and enter the newest code. Each code is single-use. |
| **Your email is not on this league**, or **joining is not enabled yet** | Apply the self-registration migration above and refresh the latest website. Verified new players can then choose a name and join. For the first organiser, also check the organiser insert in step 3. |
| No **Organiser** tab | Check the signed-in email is the organiser's email. If just promoted, refresh. |
| **Organiser permissions are not available yet** | Run `migrations/20260907_organisers.sql` on the existing project and refresh. |
| Emails still have default wording | Save both Magic Link and Confirm signup in Supabase, then request a new email. GitHub changes do not update hosted templates. |
| Episode 10 is missing, or an error says **Nine episodes required** | Run `migrations/20260914_ten_episodes.sql` after any older migrations, then refresh. |
| Episode 1 is missing from Episode team | Run `migrations/20260907_episode_one.sql` on the existing project and refresh. |
| No celebrities available for a weekly draft | Set that episode's active roster, known roles and slot counts under Organiser, then save. |
| **The league changed in another window** | Refresh to load the latest data, then reapply your changes. |
| Headlines are stale | Check **Actions → Refresh season news** and Cloudflare's latest build. The site keeps cached headlines if a refresh fails. |

## Development and further reading

See [Development notes](docs/DEVELOPMENT.md) for local previews and automated checks. Installation through GitHub, Supabase and Cloudflare does not require those tools.

- [Scoring and drafting review](SCORING-REVIEW.md)
- [Workbook import notes](workbook-notes.md)
- [Email template instructions and supported account flows](emails/README.md)

This is an unofficial fantasy league and is not affiliated with the programme or broadcaster.


### Recruitment scoring

For existing leagues, run the whole [recruitment upgrade](migrations/20261002_recruitment_scoring.sql) in Supabase SQL Editor, then refresh the website. It adds one rule and preserves all existing points values, counts, picks, names, rosters and locks. Rerunning it makes no further changes.

In **Organiser → Episode setup & scoring**, select the episode and recruited celebrity. Enter **1** for **Faithful accepts recruitment to the Traitors**, then **Save event counts**. This awards **+10** to the recruit (**+20** as captain), once per celebrity per season. An offer, refusal or original Traitor selection earns nothing. This event can score in any episode, including episodes 1–2.

Keep the recruitment episode’s frozen draft roster unchanged; set the celebrity to **Traitor** in the next episode’s roster. The organiser records recruitment explicitly: changing a role does not automatically award points.


### Full scoring in the opening episodes

Episodes 1 and 2 use full scoring. Refresh the website to load the update; no database migration or new sign-in is needed. Existing event counts are retained and now contribute to totals, including any previously entered role-specific counts. Review those counts before publishing episode scores. The `roleNeutral` flag describes draft eligibility only; it does not restrict scoring.
