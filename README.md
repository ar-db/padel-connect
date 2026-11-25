# Padel Connect — verified profiles & match planner

Static GitHub Pages frontend, Supabase Auth and PostgreSQL backend. Designed for the existing deployment at https://ar-db.github.io/padel-connect/.

## Base database setup (v3 schema)

**For v4, also follow the notification migration and activation section below.**

1. Back up your Supabase database. Open SQL Editor → New query, paste the entire `supabase/final-solution.sql`, and run it. This is the base SQL file; v4 additionally requires the notification migration below. It is transactional and designed to be rerunnable. It preserves groups, memberships, verified profiles, clubs, matches, positions and legacy availability. Old availability formats remain stored; new legacy availability writes must use the final format. Existing empty matches are not automatically filled; the creator can click Join if desired.
2. Keep your existing configured `config.js` (the archive contains a placeholder). For a new installation set the project URL and anon/publishable key, never a service-role or secret key. Publish the frontend files at the root of the GitHub Pages publishing branch; keep `.nojekyll`.
3. Authentication → URL Configuration: Site URL and allowed redirect URL must be exactly `https://ar-db.github.io/padel-connect/` (including the trailing slash). If your deployment URL differs, also change `APP_URL` in `app.js`.
4. Authentication → Email Templates: use clickable `{{ .ConfirmationURL }}` in Magic Link, Confirm Signup and Change Email Address (for anonymous account upgrades). Enable the Email provider and email confirmation. Configure SMTP for delivery to friends; Supabase's built-in email service has testing restrictions.
5. Reload the deployed page and verify with two accounts. Publish the updated frontend and the SQL together: the new registration RPC is required.

The current schema defines the group creator as its only admin. Under **Your crew → Group admin → Delete group**, the creator can confirm permanent deletion of that group and its related records. User profiles, authentication accounts and other groups are retained. Test with a disposable group first.

## Login and profile behavior

- First visit: enter email, click the magic link, then choose a display name once. A server-side RPC reads the verified email from `auth.users` and links the profile to the stable Auth UUID. The profile table is private; members see display names, not other people's email addresses.
- Returning browser: an existing valid Supabase session persists and refreshes. No repeat email link while it remains valid.
- New device/browser, cleared local session, or signed out: enter email and click a fresh magic link. The saved name loads from the database; no name prompt. A single existing group opens automatically; multiple groups open a group selector unless a valid remembered group or matching invite is present. An account with no groups can join/create a group.
- Existing registered profiles are preserved. A verified account with no saved profile must explicitly register its name once, even if it has older group memberships. Registration synchronizes the name in its own existing memberships without changing group ownership or player positions. The first saved name for an email wins; repeated registration cannot change it. A UUID/email mismatch fails closed instead of moving the previous profile to a new email.
- Legacy anonymous users: verify the email using the original browser with the original anonymous session. The user must explicitly confirm the link. This upgrades that identity rather than creating a second one. To register another person, sign out of the anonymous session first. If an email already belongs to another account or the anonymous session is lost, the app does not silently merge identities or transfer admin rights; a database administrator must review those cases. Keep legacy anonymous sign-in support until upgrades are completed.
- Invite links are preserved locally during email login in the same browser. If the magic link is opened on another device before joining a new group, reopen the original group invitation there.

## Troubleshooting an incorrect existing name

The new code prevents future profile inheritance and reassignment. It intentionally does not guess which names already in the database are incorrect. Sign out, open the correct magic link, and check the private “Signed in as” label. Test the second account in a private browser window.

In the Supabase SQL Editor, the database owner can inspect the exact Auth/profile mapping (keep these private results out of shared screenshots):

```sql
select u.id as auth_user_id, u.email as auth_email, u.email_confirmed_at,
       p.email as registered_email, p.display_name as registered_name
from auth.users u
left join public.padel_profiles p on p.user_id = u.id
where u.email is not null
order by u.email;
```

If two distinct verified accounts already have the same saved name by mistake, an administrator must confirm the intended name with the account holder and correct only that exact email's profile and membership names. Do not delete Auth users, merge accounts, or change group owner IDs. If a profile's email and its Auth email disagree, investigate that identity mismatch before making any changes. Different people can legitimately share the same display name; email is unique, not the name.

## Match planner

Any group member can create a match: date, start time (17:00–22:00, every 30 minutes), duration (60/90 minutes), location. The location can be entered or chosen from group club suggestions, including **Any** (club to be decided). All times are interpreted in Europe/Madrid. The database blocks an exact duplicate group/date/start time/location, ignoring case and repeated whitespace. Different start times or locations are allowed; overlapping times are not prohibited. This does not book courts.

The creator automatically occupies Team A / Player 1 when the match is created. Other members join one of the three remaining slots. They can leave or move to an empty position. Match creators and group admins can edit details, close/reopen registration, remove/move players, or cancel matches. A full match displays 4/4; no skill level is collected. Removing a group member also removes their match slots through database foreign keys. Old weekly availability remains in the database but is not used by the new UI.

The dashboard refreshes every 15 seconds while visible and when the browser tab becomes visible or focused; use Refresh for immediate updates. Matches automatically disappear from the upcoming board at their scheduled start time in Europe/Madrid, whether empty, partly filled, full or closed. The browser also removes expired cached matches on its visible refresh cycle even if the network is unavailable. Expired records are retained in the database (not permanently deleted), and existing Supabase match-list filtering already excludes them. No SQL upgrade is necessary for this frontend expiry change. No extra Realtime publication configuration is required. WhatsApp opens a prefilled message; the user chooses the chat and sends it.

## Verify before sharing

1. Existing user: sign in on original browser and confirm profile name, group membership and admin access remain intact.
2. Private browser: sign in with the same email, confirm name setup does not reappear, and confirm the existing group is visible. Refresh: no new email request.
3. New email: verify link, save name, join with invite. On a second browser, verify the same email and check name is reused.
4. Create a future match and verify the creator occupies slot 1 with three remaining slots; attempt a second match with identical date/time/location (also with different capitalization or duration): database must reject it.
5. Join from two accounts, choose team positions, try claiming the same slot, leave and move. Verify a player cannot join twice. Fill all four slots if four test accounts are available.
6. Test creator/admin edit, remove, close, reopen, and cancel. Confirm ordinary members cannot manage another person's match or access a different group's match IDs.
7. Sign out locally, then sign back in. Verify the profile survives. Test WhatsApp sharing and group switch.

## Notes

The single final SQL script supersedes all historical migrations. Do not run the old time-slot migrations: they cleared availability. The final script performs no automatic empty-match repair. No live Supabase database or production Auth/SMTP tests were performed. If an RPC is missing after installation, reload the PostgREST schema cache (`notify pgrst, 'reload schema';`).

## Compact, mobile-first match board

The signed-in dashboard puts upcoming matches first and hides the decorative hero at every viewport width. Four player positions are short, rectangular rows, arranged in two team columns. Open positions remain one-tap buttons with a minimum 44px height. Occupied positions show player names and identify your own slot. Match options expand only when needed for leaving, moving, editing, closing or reopening registration, and cancelling a match; WhatsApp sharing remains visible. The create/edit form starts collapsed on all screen sizes and opens automatically for editing. Long player and club names wrap rather than being truncated. Identical polling responses do not rebuild the match list, so open controls retain their state and focus.

For the original compact UI alone no database migration was required; v4 requires the notification migration below. The included tests have been updated for the compact layout.

Local checks: `node --check app.js` and `node tests/auth-flow.test.cjs`. Optional responsive test: install Python Playwright and Chromium, then `python tests/mobile-layout.test.py`. The browser test uses mock Auth/RPC data, not the live Supabase project. It covers 320, 375, 390, 430, 600, 768, 1024 and 1440px viewport widths, login controls, minimum touch target sizes, compact card height, create/edit, and match options. Physical iOS/Android device testing is still recommended.

## v4 — Court confirmation and automatic email notifications

**Upgrade:** Unlike v3, v4 needs a database migration and a server-side email worker. For an existing v3 deployment, back up the database and run `supabase/notifications.sql` in Supabase SQL Editor. For a new install, first run `supabase/final-solution.sql`, then `supabase/notifications.sql`. If you ever rerun the base SQL, rerun the notification migration immediately afterward because the base file restores the earlier match-list RPC. The migration preserves existing matches and adds `court_booked` (false by default). Publish the updated `index.html`, `app.js` and `styles.css` only after the database and email service have been configured. Keep your existing `config.js`.

### Behavior

- The club row includes a compact round-check **Mark booked / Booked!** toggle (44px touch target). The match creator or group admin can change it after an explicit confirmation. Other players see a read-only status. A specific club is required; `Any` shows `Club pending`. This records a manual confirmation; it does not reserve or cancel a real court with the club.
- The player occupancy and court reservation are independent. A match can have 4/4 players without a booked court, or a booked court with fewer players. Changing location, date, start time or duration clears the court confirmation and invalidates queued messages about the old schedule.
- Every registered player with a verified Auth email is eligible by default for the reminder two hours before start, the fourth-player (full) event, and the court-confirmed event. Emails are sent individually, not in a shared To/CC list. A late joiner to an already-confirmed match receives the court confirmation, and a late joiner within the two-hour window receives one reminder if the match has not started. A new transition from fewer than four to four players sends a new full notification; a deliberate uncheck/recheck sends a new court confirmation. Repeated identical requests and polling do not create duplicate events. Existing full matches are not retroactively announced on migration; future reminders still apply. Legacy members without verified email cannot receive messages.
- The database writes full/court events to a private outbox transactionally. A one-minute Cron job calls the worker; normally delivery is initiated within about a minute plus queue/provider latency. Reminders use `Europe/Madrid`, including DST, and are queued once per recipient/schedule. No open browser is required. The worker verifies the current roster, verified email, event state and schedule before each claim; canceled, expired or outdated events are skipped. It uses leases, capped backoff and Resend idempotency keys to avoid duplicate sends on retries. Changes just after a claim may still race with a send already in flight; an email already accepted cannot be recalled. The outbox stores private recipient and delivery data, and removes it 30 days after match start. Historical match records remain intact.

### One-time activation

1. Create a Resend account, verify a sending domain, create a sending API key, and choose a From address on that domain. For production use a domain you control. Do not place credentials in `config.js`, browser JS, GitHub Pages, chat or committed files. Resend's testing sender can only deliver to allowed test recipients.
2. In Supabase Dashboard → Edge Functions → Secrets, add `RESEND_API_KEY`, `PADEL_EMAIL_FROM` (for example `Padel Connect <matches@YOUR-VERIFIED-DOMAIN>`), and `PADEL_CRON_SECRET` (a long random secret, at least 32 characters; e.g. generate locally using `openssl rand -hex 32`). The worker uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server. Never share the service role key. Do not change the existing authentication SMTP settings; match emails use Resend separately.
3. From the extracted project folder with the Supabase CLI installed and authenticated, run:

   ```sh
   supabase functions deploy padel-notifications --project-ref pkyiwwolgtdqvekgndyt --no-verify-jwt
   ```

   `verify_jwt=false` is intentional for this server-to-server job: the worker rejects requests unless their `x-padel-cron-secret` matches its secret. Only the worker's service-role RPCs can claim or finish email jobs. Do not expose this secret to clients. If you deploy to a different Supabase project, replace the project reference.
4. In Database → Extensions, enable `pg_cron` and `pg_net`. In Supabase Vault, create secrets named `padel_cron_secret` (exactly the same value as `PADEL_CRON_SECRET`) and `padel_project_url` (the project URL without a trailing slash). Use the Vault UI rather than putting actual secret values in SQL files or screenshots.
5. Run `supabase/enable-notification-cron.sql` in SQL Editor. It schedules the job every minute, replacing the existing named job if rerun. In Cron, verify the job is active, and inspect Edge Function logs and Resend delivery activity. A successful Cron execution alone only means the HTTP request was queued, not that an email arrived. To stop delivery temporarily, run `select cron.unschedule('padel-notifications');`.
6. Deploy the frontend files. Test with consenting registered players using a disposable group and real, verified recipient addresses. Create a match, mark the court, join the remaining positions, and create a match within two hours of its start (during permitted match hours). Verify all three emails and the absence of duplicates after refresh. Verify non-admin permissions and reset on edit. Use `supabase/test-notifications.sql` on a **staging project with Cron disabled** to exercise core SQL behavior without sending messages; the test rolls back. It has not been executed in the development container because PostgreSQL/Supabase is unavailable there.

### Diagnostics

In SQL Editor, as an administrator, inspect counts without exposing addresses:

```sql
select kind,status,count(*) from public.padel_email_outbox group by kind,status order by kind,status;
```

`sent` means Resend accepted the message; inbox delivery can still fail or be delayed. Use Resend logs for bounces and delivery status. `failed` indicates permanent delivery error or exhausted retries. `skipped` indicates an expired or invalidated event. If configuration is wrong, fix it before testing again with a new event. Do not blindly reset sent/failed rows, because that can cause duplicate emails after the provider's idempotency window. The queue automatically retries transient errors within a bounded window.

Local verification: `node --check app.js`, `node tests/auth-flow.test.cjs`, `node --experimental-strip-types tests/email-template.test.mjs` (Node 22), and `python tests/mobile-layout.test.py` (Playwright + Chromium). These cover mocked browser RPCs and template rendering, not actual PostgreSQL or live email delivery. Supabase's scheduling and Vault documentation: https://supabase.com/docs/guides/functions/schedule-functions ; Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys .
