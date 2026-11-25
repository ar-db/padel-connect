# Padel Connect — verified profiles & match planner

Static GitHub Pages frontend, Supabase Auth and PostgreSQL backend. Designed for the existing deployment at https://ar-db.github.io/padel-connect/.

## Database setup or upgrade (one SQL file)

1. Back up your Supabase database. Open SQL Editor → New query, paste the entire `supabase/final-solution.sql`, and run it. This is the only SQL file required for a fresh installation or an upgrade from the previous Padel Connect releases. It is transactional and designed to be rerunnable. It preserves groups, memberships, verified profiles, clubs, matches, positions and legacy availability. Old availability formats remain stored; new legacy availability writes must use the final format. Existing empty matches are not automatically filled; the creator can click Join if desired.
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

The dashboard refreshes every 15 seconds while visible; use Refresh for immediate updates. No extra Realtime publication configuration is required. WhatsApp opens a prefilled message; the user chooses the chat and sends it.

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

No database or configuration migration is required. Replace `index.html`, `styles.css`, and `app.js` in your existing deployment. The included tests have been updated for the compact layout.

Local checks: `node --check app.js` and `node tests/auth-flow.test.cjs`. Optional responsive test: install Python Playwright and Chromium, then `python tests/mobile-layout.test.py`. The browser test uses mock Auth/RPC data, not the live Supabase project. It covers 320, 375, 390, 430, 600, 768, 1024 and 1440px viewport widths, login controls, minimum touch target sizes, compact card height, create/edit, and match options. Physical iOS/Android device testing is still recommended.
