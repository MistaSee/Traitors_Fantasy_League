# Round Table email templates

All templates use the same dark green, gold and burgundy design. Each HTML file is standalone and ready to paste into Supabase.

| Supabase template | Subject | HTML body |
|---|---|---|
| Magic Link / Magic link or OTP | Your Round Table summons: sign in | [sign-in.html](sign-in.html) |
| Confirm signup | Your Round Table summons: sign in | [sign-in.html](sign-in.html) |
| Invite user | Your invitation to the Round Table | [invite-user.html](invite-user.html) |
| Change email address | The Round Table: confirm your email change | [change-email-address.html](change-email-address.html) |
| Reset password | The Round Table: reset your password | [reset-password.html](reset-password.html) |
| Reauthentication | The Round Table: your verification code | [reauthentication.html](reauthentication.html) |

## Apply in Supabase

1. Open the project's **Authentication → Email → Templates** settings.
2. Open each template listed above. Replace its subject with the matching subject and its HTML body with the full contents of the matching file, then save. Copy the HTML source from a code editor, not the text of a rendered browser preview.
3. Use `sign-in.html` for both **Magic Link** and **Confirm signup**. The app's email sign-in also creates an account for a new player, so first-time users need the matching confirmation template.
4. Request a new sign-in email from the league and check the copy and button. Previously delivered emails retain their old content. Other templates are sent only when their corresponding authentication action is triggered.

Keep all placeholders exactly as written. Link templates use `{{ .ConfirmationURL }}` so Supabase can verify the intended action before redirecting to the app. A plain website URL cannot replace it. The email-change template also uses `{{ .Email }}` and `{{ .NewEmail }}` to identify the requested change, and allows for confirmation from both addresses when secure email change is enabled. Reauthentication uses `{{ .Token }}` as a visible verification code and has no action link. Its wording does not assume a particular code length or expiry setting.

The files contain no real login tokens, player details, email credentials, external images or tracking links.

The email uses inline styles, system fonts and presentation tables, with a fluid width and an Outlook width fallback. A browser preview checks the layout; appearance in individual email clients can vary.

These files are a saved copy of the template. Pushing them to GitHub or deploying Cloudflare does **not** update Supabase's hosted email templates. Save the changes in Supabase to apply them.

## Current app support

The app currently uses email-link sign-in. These templates prepare the other email types; they do not add new account screens or send invitations.

- **Invite user:** Supabase's invitation flow triggers this template. **Organiser → Add player** only adds the league roster entry and sends no email. After the self-registration upgrade, a verified recipient without a league entry can choose a league name and join as a player. Existing roster entries keep their name, picks and permissions.
- **Change email address:** the app has no self-service email-change screen. League membership is matched by email, so the organiser must also update the existing player's roster email as part of a supported change flow, preserving their player ID and picks.
- **Reset password:** the app has no password login or reset screen. Before offering password recovery, add a recovery destination where the authenticated user can choose and save a new password.
- **Reauthentication:** the app has no verification-code entry screen. Before using this flow, add the account action that requests the code and submits it to Supabase.

Sources: [Supabase email templates and variables](https://supabase.com/docs/guides/auth/auth-email-templates), [authentication template purposes](https://supabase.com/docs/guides/local-development/customizing-email-templates#available-authentication-email-templates).
