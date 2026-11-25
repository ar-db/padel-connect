# Padel Connect — verified profiles & match planner

Static GitHub Pages frontend, Supabase Auth and PostgreSQL backend. Designed for the existing deployment at https://ar-db.github.io/padel-connect/.

## Database setup and SQL run order

1. Back up Supabase and enable `pg_cron` under **Database → Extensions**. On an existing project, review the [match cleanup preview](#database-capacity-and-retention) before installing.
2. Run the entire `supabase/1-setup-database.sql` in Supabase SQL Editor. This is the only production SQL file for fresh installs and upgrades. It installs the schema, notification outbox, scheduling limits, and cleanup jobs in one transaction. It is safe to rerun. To enable email delivery in the same run, complete the [email activation prerequisites](#email-delivery-activation) and set `padel.enable_notification_cron` to `'on'` near the top before running it.

### Frontend and Auth setup

1. Keep your existing configured `config.js` (the archive contains a placeholder). For a new installation set the project URL and anon/publishable key, never a service-role or secret key. Publish the frontend files at the root of the GitHub Pages publishing branch; keep `.nojekyll`.
2. Authentication → URL Configuration: Site URL and allowed redirect URL must be exactly `https://ar-db.github.io/padel-connect/` (including the trailing slash). If your deployment URL differs, also change `APP_URL` in `app.js`.
3. Authentication → Email Templates: use clickable `{{ .ConfirmationURL }}` in Magic Link, Confirm Signup and Change Email Address (for anonymous account upgrades). Enable the Email provider and email confirmation. Configure SMTP for delivery to friends; Supabase's built-in email service has testing restrictions.
4. Reload the deployed page and verify with two accounts. Publish the updated frontend after installing the database setup.

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

Deploy the database setup before publishing the updated frontend so the board RPC is available. Visible tabs poll the match list once per minute. Match actions, returning to the tab, and the Refresh button fetch matches immediately. The same request includes crew and clubs on entry, when their revision has changed, and on manual Refresh. Matches automatically disappear from the upcoming board at their scheduled start time in Europe/Madrid, whether empty, partly filled, full or closed. The browser also removes expired cached matches every 15 seconds while visible, even when offline. Database cleanup permanently deletes matches and their associated records on the first cleanup run at or after kickoff. No extra Realtime publication configuration is required. WhatsApp opens a prefilled message; the user chooses the chat and sends it.

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

Local checks: `node --check app.js` and `node tests/auth-flow.test.cjs`. Optional responsive test: install Python Playwright and Chromium, then `python tests/mobile-layout.test.py`. The browser test uses mock Auth/RPC data, not the live Supabase project. It covers 320, 375, 390, 430, 600, 768, 1024 and 1440px viewport widths, login controls, minimum touch target sizes, compact card height, create/edit, and match options. Physical iOS/Android device testing is still recommended.

## v4 — Court confirmation and automatic email notifications

The final database setup installs court confirmation and the notification outbox. Email delivery also requires the Edge Function and the activation steps below.

### Behavior

- The club row includes a compact round-check **Mark booked / Booked!** toggle (44px touch target). The match creator or group admin can change it after an explicit confirmation. Other players see a read-only status. A specific club is required; `Any` shows `Club pending`. This records a manual confirmation; it does not reserve or cancel a real court with the club.
- The player occupancy and court reservation are independent. A match can have 4/4 players without a booked court, or a booked court with fewer players. Changing location, date, start time or duration clears the court confirmation and invalidates queued messages about the old schedule.
- Every registered player with a verified Auth email is eligible by default for the reminder two hours before start, the fourth-player (full) event, and the court-confirmed event. Emails are sent individually, not in a shared To/CC list. A late joiner to an already-confirmed match receives the court confirmation, and a late joiner within the two-hour window receives one reminder if the match has not started. A new transition from fewer than four to four players sends a new full notification; a deliberate uncheck/recheck sends a new court confirmation. Repeated identical requests and polling do not create duplicate events. Existing full matches are not retroactively announced on migration; future reminders still apply. Legacy members without verified email cannot receive messages.
- The database writes full/court events to a private outbox transactionally. A one-minute Cron job calls the worker; normally delivery is initiated within about a minute plus queue/provider latency. Reminders use `Europe/Madrid`, including DST, and are queued once per recipient/schedule. No open browser is required. The worker verifies the current roster, verified email, event state and schedule before each claim; canceled, expired or outdated events are skipped. It uses leases, capped backoff and Resend idempotency keys to avoid duplicate sends on retries. Changes just after a claim may still race with a send already in flight; an email already accepted cannot be recalled. With the capacity migration installed, the match cleanup also deletes its outbox rows at kickoff, including private recipient and delivery data.

### Email delivery activation

1. Create a Resend account, verify a sending domain, create a sending API key, and choose a From address on that domain. For production use a domain you control. Do not place credentials in `config.js`, browser JS, GitHub Pages, chat or committed files. Resend's testing sender can only deliver to allowed test recipients.
2. In Supabase Dashboard → Edge Functions → Secrets, add `RESEND_API_KEY`, `PADEL_EMAIL_FROM` (for example `Padel Connect <matches@YOUR-VERIFIED-DOMAIN>`), and `PADEL_CRON_SECRET` (a long random secret, at least 32 characters; e.g. generate locally using `openssl rand -hex 32`). The worker uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server. Never share the service role key. Do not change the existing authentication SMTP settings; match emails use Resend separately.
3. From the extracted project folder with the Supabase CLI installed and authenticated, run:

   ```sh
   supabase functions deploy padel-notifications --project-ref pkyiwwolgtdqvekgndyt --no-verify-jwt
   ```

   `verify_jwt=false` is intentional for this server-to-server job: the worker rejects requests unless their `x-padel-cron-secret` matches its secret. Only the worker's service-role RPCs can claim or finish email jobs. Do not expose this secret to clients. If you deploy to a different Supabase project, replace the project reference.
4. In Database → Extensions, enable `pg_cron` and `pg_net`. In Supabase Vault, create secrets named `padel_cron_secret` (exactly the same value as `PADEL_CRON_SECRET`) and `padel_project_url` (the project URL without a trailing slash). Use the Vault UI rather than putting actual secret values in SQL files or screenshots.
5. Set `padel.enable_notification_cron` to `'on'` near the top of `supabase/1-setup-database.sql` and run the entire file, or rerun it if the database is already installed. It schedules `padel-notifications` every minute. The default `'off'` setting skips job setup and leaves an existing job active. In Cron, verify the job is active, then check Edge Function logs and Resend delivery activity. To stop delivery temporarily, run `select cron.unschedule('padel-notifications');`.
6. Deploy the frontend files. Test with consenting registered players using a disposable group and verified recipient addresses. Create a match, mark the court, join the remaining positions, and create a match within two hours of its start. Verify all three emails and the absence of duplicates after refresh. Verify non-admin permissions and reset on edit.

To test SQL behavior without sending mail, run `supabase/staging-test-notifications.sql` after the final setup on a staging project with notification delivery disabled. The test rolls back its fixture data.

### Diagnostics

In SQL Editor, as an administrator, inspect counts without exposing addresses:

```sql
select kind,status,count(*) from public.padel_email_outbox group by kind,status order by kind,status;
```

`sent` means Resend accepted the message; inbox delivery can still fail or be delayed. Use Resend logs for bounces and delivery status. `failed` indicates permanent delivery error or exhausted retries. `skipped` indicates an expired or invalidated event. If configuration is wrong, fix it before testing again with a new event. Do not blindly reset sent/failed rows, because that can cause duplicate emails after the provider's idempotency window. The queue automatically retries transient errors within a bounded window.

Local verification: `node --check app.js`, `node tests/auth-flow.test.cjs`, `node --experimental-strip-types tests/email-template.test.mjs` (Node 22), and `python tests/mobile-layout.test.py` (Playwright + Chromium). These cover mocked browser RPCs and template rendering, not actual PostgreSQL or live email delivery. Supabase's scheduling and Vault documentation: https://supabase.com/docs/guides/functions/schedule-functions ; Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys .

## Database capacity and retention

The upgrade preserves existing upcoming matches, their court booking status, rosters, and notification records. The minute job uses each match’s scheduled start in Europe/Madrid, regardless of when the match was created. To preview which bookings carry forward and how many matches are already due for cleanup, run this read-only query before upgrading.

```sql
select count(*) filter (where kickoff > now()) as upcoming_matches_preserved,
       count(*) filter (where kickoff <= now()) as matches_due_for_cleanup
from (
  select (match_date + start_time) at time zone 'Europe/Madrid' as kickoff
  from public.padel_matches
) schedule;
```

- The application allows at most 1,000 groups, 24 upcoming matches per group, and 10 upcoming matches created per account across groups. New or rescheduled kickoffs must be within 14 days in Europe/Madrid. Each group can create 24 matches in any rolling 336 hours. Cancellations still consume the rolling allowance. Existing groups and matches are counted without deleting them at installation. Cancellations from before installation are unavailable to the rolling counter.
- The minute job permanently deletes matches at or after their Europe/Madrid kickoff. The same transaction deletes all associated player slots and email outbox rows. Each run processes up to 1,000 unlocked matches. Later runs catch up if a match is locked or a backlog exists. During the rolling creation window, only the group ID and creation timestamp remain in the private quota log. Each active match can retain up to 16 outbox rows per notification type. After a type reaches its allowance, additional emails of that type are skipped.
- The budget is 1,000,000,000 bytes of PostgreSQL database size. Maintenance logs a warning at 700,000,000 bytes. At 850,000,000 bytes, database triggers pause new Auth users, profiles, groups, matches, memberships, clubs, and availability inserts. Cancellations and scheduled cleanup can continue. The admission check measures size before new writes and leaves room for ongoing writes and maintenance.
- Hourly maintenance removes up to 5,000 completed Cron runs older than seven days for this app’s jobs. The setup records their job IDs so retention continues if delivery is later unscheduled.
- Check the `padel-purge-started-matches` and `padel-capacity-maintenance` jobs in Supabase Cron and watch for capacity messages in PostgreSQL logs. Set up external alerts for missed runs and provider disk usage if you need active notifications. The database budget measures PostgreSQL tables and indexes. Provider disk usage also includes WAL and system files. Deletion allows PostgreSQL to reuse space over time, so a cleanup run may leave the measured size above the admission threshold.
