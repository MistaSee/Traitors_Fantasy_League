# Sign-in email

Subject: **Your Round Table summons: sign in**

Body: copy all of `sign-in.html`, including the `{{ .ConfirmationURL }}` placeholder.

## Apply in Supabase

1. Open the project's **Authentication → Email → Templates** settings.
2. Open **Magic Link** (sometimes labelled **Magic link or OTP**), replace its subject with the subject above and its HTML body with `sign-in.html`, then save.
3. Apply the same subject and body to **Confirm signup**. The app's email sign-in also creates an account for a new player, so first-time users need the matching confirmation template.
4. Request a new sign-in email from the league and check the copy and button. Previously delivered emails retain their old content.

The button must keep `{{ .ConfirmationURL }}`: Supabase generates the single-use verification link and returns the player to the app. A plain website URL will not sign anyone in. The template contains no real login token, player details, email credentials, external images or tracking links.

The email uses inline styles, system fonts and presentation tables, with a fluid width and an Outlook width fallback. A browser preview checks the layout; appearance in individual email clients can vary.

These files are a saved copy of the template. Pushing them to GitHub or deploying Cloudflare does **not** update Supabase's hosted email templates. Save the changes in Supabase to apply them.

Source: [Supabase email templates and confirmation URL](https://supabase.com/docs/guides/auth/auth-email-templates).
