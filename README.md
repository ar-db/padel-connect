# Padel Connect — verified profiles & match planner

Static GitHub Pages frontend, Supabase Auth and PostgreSQL backend. Designed for the existing deployment at https://ar-db.github.io/padel-connect/.

## Upgrade from the Any club release (delete group)

1. Back up your Supabase database. Run `supabase/migrate-delete-group.sql` in Supabase SQL Editor. It adds an owner-only RPC and does not delete existing groups when installed.
2. Replace `index.html`, `app.js`, `styles.css`, and `README.md`, add the new migration, and commit/push. Keep your configured `config.js`.
3. Open a group you created. Under **Your crew → Group admin**, select **Delete group** and confirm the warning. This permanently deletes that group, its invite code, members' memberships, clubs, matches, positions and old availability for everyone. User accounts, saved profiles and other groups remain intact. The dashboard returns to the group selector; other connected members return to their selector on the next refresh (normally within 15 seconds while visible).
4. Test on a disposable group: cancel the confirmation (nothing changes), then confirm deletion; verify a normal member cannot see the button or invoke the RPC successfully. Verify the deleted invite code fails and all users can still sign in with their saved names.

The current schema defines the group creator as its only admin; this release does not introduce delegated admins.

## Upgrade from the auto-join creator release (Any club option)

Replace `index.html`, `app.js`, and `styles.css` in GitHub and commit/push. Keep your existing `config.js`. No additional Supabase migration is needed if the auto-join creator migration is already installed. Choose **Any** beside the location field or from the suggestions to create a match without a fixed venue. The match card and WhatsApp message show “Any · Club to be decided”. The creator still joins Team A / Player 1 automatically. The creator or admin can edit the location later without losing existing players. The existing duplicate rule applies to Any as a location: another Any match for the same group/date/start is blocked, while matches at specific clubs remain separate. Any is a flexible venue label, not automatic cross-match merging or a court reservation.

## Upgrade from the verified profiles & match planner release

1. In Supabase SQL Editor, run **`supabase/migrate-auto-join-creator.sql`**. This replaces the existing save RPC without changing its signature. New matches insert the creator into Team A / Player 1 within the same database transaction. Edits do not register the creator again or alter any player positions.
2. To repair the existing empty match, open `supabase/repair-empty-matches.sql`. Review the SELECT separately, then run the INSERT only for matches you want to repair (optionally filter by match UUID). It never overwrites existing player positions. Alternatively, simply click Join in Team A / Player 1 on the existing match.
3. Replace `app.js` and `index.html` in GitHub (keep your configured `config.js`), add the new migration files, commit and push. Hard-refresh the page.
4. Create a new match: it must display 1/4 and 3 spots left, your name in Team A / Player 1. Another member can claim any remaining slot; verify that editing a match preserves its players and that you can leave or move normally.

## Upgrade from older availability-based releases (recommended)

1. Back up your Supabase database. In SQL Editor run `supabase/migrate-group-admin.sql` and `supabase/migrate-email-auth.sql` if not already installed (both are additive and safe to rerun). Then run **`supabase/migrate-profiles-matches.sql`** in a new query, followed by `supabase/migrate-delete-group.sql`. Check that it commits successfully. This migration keeps the existing groups, members, club records and old availability rows. It backfills verified profiles from existing memberships and creates new match tables. Do not run older time-slot migrations: those may clear old availability.
2. Keep your current configured **`config.js`** from your existing GitHub repo. The archive's config is a placeholder, not your deployed credentials. Never overwrite your working config with the placeholder.
3. Replace `index.html`, `app.js`, `styles.css`, and `README.md`; add `supabase/migrate-profiles-matches.sql` to your repository. Commit and push to your GitHub Pages publishing branch. Keep `.nojekyll`.
4. Authentication → URL Configuration: Site URL and allowed redirect URL must be exactly `https://ar-db.github.io/padel-connect/` (including the trailing slash).
5. Authentication → Email Templates: use the clickable `{{ .ConfirmationURL }}` in Magic Link and Confirm Signup templates, and in Change Email Address for legacy anonymous account upgrades. Do not configure these as OTP-only templates. Enable the Email provider and confirm email verification. For delivery to your friends, configure SMTP; the built-in Supabase email service has testing restrictions.
6. Reload your deployed page (hard refresh if needed). Test with two accounts as described below before sharing widely.

## New installation

Run `supabase/schema.sql`, `supabase/migrate-profiles-matches.sql`, then `supabase/migrate-delete-group.sql`. Configure Auth and URLs as above. Set `config.js` with the project URL and anon/publishable key, never a service-role or secret key. Publish the frontend files at the root of the `main` branch via Settings → Pages. If your deployment URL differs, change `APP_URL` in `app.js` and the allowed Auth redirect URL accordingly.

## Login and profile behavior

- First visit: enter email, click the magic link, then choose a display name once. A server-side RPC reads the verified email from `auth.users` and links the profile to the stable Auth UUID. The profile table is private; members see display names, not other people's email addresses.
- Returning browser: an existing valid Supabase session persists and refreshes. No repeat email link while it remains valid.
- New device/browser, cleared local session, or signed out: enter email and click a fresh magic link. The saved name loads from the database; no name prompt. A single existing group opens automatically; multiple groups open a group selector unless a valid remembered group or matching invite is present. An account with no groups can join/create a group.
- Existing verified users with memberships: the migration uses the earliest membership's display name as the profile name, without rewriting existing membership names. New memberships use the saved profile name.
- Legacy anonymous users: verify the email using the original browser with the original anonymous session. This upgrades that identity rather than creating a second one. If an email already belongs to another account or the anonymous session is lost, the app does not silently merge identities or transfer admin rights; a database administrator must review those cases. Keep legacy anonymous sign-in support until upgrades are completed.
- Invite links are preserved locally during email login in the same browser. If the magic link is opened on another device before joining a new group, reopen the original group invitation there.

## Match planner

Any group member can create a match: date, start time (17:00–22:00, every 30 minutes), duration (60/90 minutes), location. The location can be entered or chosen from group club suggestions. All times are interpreted in Europe/Madrid. The database blocks an exact duplicate group/date/start time/location, ignoring case and repeated whitespace. Different start times or locations are allowed; overlapping times are not prohibited. This does not book courts.

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

The ZIP includes the old migration files for reference only. Run only the upgrade sequence above for an existing database. The new migration is transactional; if an error occurs, it rolls back. No remote database changes or production Auth/SMTP tests are performed by this archive. If a new RPC is missing after migration, reload the PostgREST schema cache (SQL: `notify pgrst, 'reload schema';`).
