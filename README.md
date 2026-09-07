# The Round Table

A fantasy league for **UK Celebrity Traitors, series 2**. Players sign in by email, predict the original Traitors, draft teams and compete on a shared leaderboard. Organisers manage the cast, scores, deadlines and player access.

This guide takes you from the files in GitHub to a working league using **Supabase Free** and **Cloudflare Workers Free**. You can do the installation in your browser; no terminal or programming experience is required.

**Already have a running league?** Go to [Updating an existing installation](#updating-an-existing-installation). The database setup below is for a new, empty Supabase project.

Before inviting players, use the [scoring walkthrough and playtest checklist](docs/PLAYTEST.md), including a miniature episode with exact expected scores and regression checks for the corrected issues.

## What you need

- A private GitHub repository containing this project, with `main` as its default branch.
- A [Supabase account](https://supabase.com/dashboard) and a [Cloudflare account](https://dash.cloudflare.com/), using their Free plans.
- A Gmail account that allows app passwords, to send players their sign-in links. This can be different from the email you use to play or organise the league.
- The email address you want to use for your first organiser account.

If Gmail app passwords are unavailable, there is an [alternative email setup](#alternative-email-sender-resend) using a domain you already own.

| Service | What it does |
|---|---|
| GitHub | Stores the private source code and runs the automatic news refresh. |
| Cloudflare Workers | Hosts the website at a free `workers.dev` address. |
| Supabase | Stores players, picks and scores, and handles email sign-in. |
| Gmail or another SMTP provider | Delivers the sign-in emails requested through Supabase. |

The sign-in page is publicly reachable. League data requires a signed-in email that an organiser has added to the league. Players do not need GitHub, Cloudflare or Supabase dashboard accounts.

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

This loads **21 celebrities, 47 scoring rules and 9 episodes**. It does not create player accounts or import anyone's old picks. Celebrity roles start as **Unknown**; organisers enter them after the show's reveal.

To check the import, run this in a new query:

```sql
select
  jsonb_array_length(state->'characters') as celebrities,
  jsonb_array_length(state->'rules') as scoring_rules,
  jsonb_array_length(state->'episodes') as episodes
from public.league_config
where id = 1;
```

**Expected result:** one row containing `21`, `47` and `9`.

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

## 6. Set the sign-in return address

1. Return to Supabase and open **Authentication → URL Configuration**.
2. Set **Site URL** to your Cloudflare production URL, including the final `/`.
3. Save it.
4. Under **Redirect URLs**, add the same complete URL and save.
5. In Authentication's sign-in/provider settings, ensure **Email** and **Allow new users to sign up** are enabled. Keep email confirmation enabled.

The two URLs should match the site you actually open. These settings let the email link return players to the league after verifying their address. [Supabase redirect guide](https://supabase.com/docs/guides/auth/redirect-urls)

New players need to create their authentication account on their first sign-in. The app separately checks that their email appears in the league's player list, so enabling signups does not grant everyone league access.

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

In **Supabase → Authentication → Email**, open the templates and use these subjects and HTML files:

| Supabase template | Subject | Copy this HTML file |
|---|---|---|
| Magic Link | Your Round Table summons: sign in | [sign-in.html](emails/sign-in.html) |
| Confirm signup | Your Round Table summons: sign in | [sign-in.html](emails/sign-in.html) |
| Invite user | Your invitation to the Round Table | [invite-user.html](emails/invite-user.html) |
| Change email address | The Round Table: confirm your email change | [change-email-address.html](emails/change-email-address.html) |
| Reset password | The Round Table: reset your password | [reset-password.html](emails/reset-password.html) |
| Reauthentication | The Round Table: your verification code | [reauthentication.html](emails/reauthentication.html) |

For each template, replace the subject and the full HTML body, then **Save**. Keep placeholders such as `{{ .ConfirmationURL }}` and `{{ .Token }}` exactly as supplied. Supabase fills them with each person's link or code. Reauthentication uses a code rather than a button.

Set both **Magic Link** and **Confirm signup** so returning and first-time players receive the themed email. Changes apply to newly sent emails. A GitHub commit does not update these Supabase settings. [Supabase template guide](https://supabase.com/docs/guides/auth/auth-email-templates)

The extra templates are ready for future account features. The app currently uses email-link sign-in and has no password-reset, email-change or reauthentication screens. See [email template notes](emails/README.md) before enabling those flows.

## 9. Sign in and add your players

1. Open your Cloudflare production URL.
2. Enter the email you added as the first organiser in step 3.
3. Click **Send sign-in link**, open the email and follow its button.
4. Confirm that you return to the league with your name and an **Organiser** tab.
5. Open **Organiser → Players & organisers**.
6. Enter each player's name and email, then click **Add player**. Add as many players as you need before the season; there is no old 15-player limit.
7. Share the website address with them. They sign in using the exact email you added.

Adding a player grants league access but **does not send an invitation email**. Players request their own sign-in links from the website. The **Invite user** email template is used only if an invitation is sent through Supabase, and the recipient still needs a league player entry.

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
2. Add players and collect their three preseason Traitor predictions.
3. Lock preseason predictions before the first broadcast. This also freezes scoring values for the season.
4. After the reveal, record the original roles under **Season controls → Record starting roles after episode 1** and save.

### Each episode

1. In **Episode setup & scoring**, select episode 1, copy the starting roles into its roster and save. This provides the starting point for later episodes.
2. Before each later episode, copy the previous episode's roster, update roles and eliminations, and save. These describe who is active **before** that episode. A celebrity eliminated during episode 2 should become unavailable in episode 3's roster.
3. Check the draft slot counts. Defaults are 2 Traitors + 6 Faithful for episodes 2–6, then 1 + 3 for episodes 7–9. Adjust before players submit if the available cast requires it.
4. Players choose a fresh team and a captain. Celebrities can appear on multiple players' teams. The captain doubles positive and negative points.
5. Manually lock that episode's drafts before broadcast. Its roster and draft requirements then become fixed.
6. Record each celebrity's event counts and save. Counts remain editable for corrections. Players can use **Refresh scores** to retrieve the latest totals.

Before the finale, collect and lock final-side predictions. After the result, record **Faithful** or **Traitors** as the winner. A correct final prediction earns 25 points.

There are no automatic broadcast deadlines, fallback teams or catch-up points. Missing submissions score zero. Take a **Download league backup** after major updates and keep the JSON file private; restoring a backup currently requires a database operation.

## Updating an existing installation

Website changes committed to `main` deploy through Cloudflare. Database changes and email-template changes are separate:

| Change | What to do |
|---|---|
| Website code, styling or public connection settings | Commit to `main`, wait for Cloudflare to deploy, then refresh. |
| A database migration | Run the specified file in Supabase's SQL Editor. |
| Email subject or HTML | Copy it into the matching Supabase email template and save. |
| Scores, draft eligibility and player roles | Save through the Organiser controls. |

For organiser management on an older installation, run [migrations/20260907_organisers.sql](migrations/20260907_organisers.sql) in Supabase, then refresh the website. This migration can be rerun and preserves players, picks, scores and existing organiser roles. Fresh installs using the current `schema.sql` already include it.

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
| The email link opens `localhost` or the wrong website | Correct Site URL and Redirect URLs in step 6, then request a new email. |
| The link has expired or was already used | Request a fresh sign-in link and use the newest email. Each link is single-use. |
| **Your email is not on this league** | An organiser must add the exact email used to sign in. For the first organiser, check the insert in step 3. |
| No **Organiser** tab | Check the signed-in email is the organiser's email. If just promoted, refresh. |
| **Organiser permissions are not available yet** | Run `migrations/20260907_organisers.sql` on the existing project and refresh. |
| Emails still have default wording | Save both Magic Link and Confirm signup in Supabase, then request a new email. GitHub changes do not update hosted templates. |
| No celebrities available for a weekly draft | Set that episode's active roster, known roles and slot counts under Organiser, then save. |
| **The league changed in another window** | Refresh to load the latest data, then reapply your changes. |
| Headlines are stale | Check **Actions → Refresh season news** and Cloudflare's latest build. The site keeps cached headlines if a refresh fails. |

## Development and further reading

See [Development notes](docs/DEVELOPMENT.md) for local previews and automated checks. Installation through GitHub, Supabase and Cloudflare does not require those tools.

- [Scoring and drafting review](SCORING-REVIEW.md)
- [Workbook import notes](workbook-notes.md)
- [Email template instructions and supported account flows](emails/README.md)

This is an unofficial fantasy league and is not affiliated with the programme or broadcaster.
