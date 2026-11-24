# Padel Connect

A private, mobile-friendly padel availability planner for friend groups in Málaga. Hosted on GitHub Pages, with Supabase providing email OTP authentication, private-group membership, database storage and live updates.

## Access model

- Anyone can open the site, but cannot see group data without joining.
- A person verifies an email address using a one-time code, then creates or joins a group using a private invite code and display name.
- Supabase Auth keeps the verified email identity persistent across browsers/devices. No password is required.
- Supabase enforces one Auth user per email address; group membership is unique per group/user ID.
- Only members of a group can read that group's dashboard or change their own availability.
- Keep invite codes private. Anyone who has a code can join that group.

## Project files

- `index.html` — page structure
- `styles.css` — responsive styling
- `app.js` — frontend logic
- `config.js` — Supabase URL and anon/public key
- `supabase/schema.sql` — database tables, access controls and RPC functions

## 1. Create Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** and copy the Project URL and `anon` / publishable public key.
3. In **Authentication → Sign In / Providers**, enable the **Email** provider. Email OTP is used; passwords are not required.
4. Configure a production SMTP provider under **Project Settings → Authentication → SMTP Settings** (menu labels may vary). Supabase's built-in email sender is restricted and intended for testing; do not rely on it for public users.
5. In **Authentication → Email Templates**, configure the sign-in/magic-link template to display the OTP token using `{{ .Token }}`. Also configure the **Change Email Address** template to display `{{ .Token }}`; this is used to upgrade existing anonymous users without changing their Supabase user ID.
6. Set the Supabase Auth **Site URL** to your GitHub Pages URL. Add your exact GitHub Pages URL (and custom domain, if used) to allowed redirect URLs if your project requires them.
7. Open **SQL Editor**, create a new query, paste all of `supabase/schema.sql`, and run it for a brand-new database. For an existing database, run `supabase/migrate-email-auth.sql` once instead.
8. Open **Database → Publications** (or the Realtime settings) and enable Realtime for:
   - `padel_availability`
   - `padel_members`
   - `padel_clubs`
9. Confirm the SQL ran successfully before publishing the site.

## 2. Configure the frontend

Edit `config.js`:

```js
window.PADEL_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_PUBLIC_KEY"
};
```

Use the public anon/publishable key only. **Never use a `service_role` or secret key in browser code or GitHub.**

## 3. Publish with GitHub Pages

1. Create a GitHub repository, for example `padel-connect`.
2. Upload `index.html`, `styles.css`, `app.js`, `config.js`, `README.md` and the `supabase` folder to the repository root (not inside another nested folder).
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then Save.
6. Wait for GitHub Pages to publish. Your site will be available at `https://YOUR-USERNAME.github.io/padel-connect/`.

If you use a custom domain, configure it in GitHub Pages and update your Supabase Auth URL configuration if needed.

## 4. First use

1. Open the published site.
2. Select **Create a group**, enter a group name and your name.
3. Copy the invite link/code and send it to your friends.
4. Friends open the link, verify their email, enter their display name and join.
5. On a different device, a returning player verifies the same email and can select from their existing groups. A single existing group opens automatically.
7. Add your group's preferred padel clubs in Málaga.
8. Each member selects days, time periods and clubs, then presses **Save my availability**.
9. The dashboard updates live when members add or change availability. Use the WhatsApp actions to share upcoming matches.

## 5. How the recommendation works

The current MVP ranks exact combinations of weekday + time period + club by the number of distinct group members who selected them. It recommends the combination with the most players. It does not yet check actual court booking availability or guarantee four players are free at the same venue. If there is a tie, the first combination returned by the database is used.

Time periods are:
- Morning: 08:00–11:00
- Midday: 11:00–14:00
- Afternoon: 14:00–18:00
- Evening: 18:00–21:00
- Night: 21:00–23:00

Weekdays are Monday through Sunday. Each member can select multiple combinations.

## 6. Security and operational notes

- Email OTP creates or signs in to a persistent Supabase Auth user. The same email returns to the same user ID on another device.
- Supabase Auth enforces email uniqueness, but this is one account per email address, not proof of one account per human (people can use multiple email addresses).
- Existing anonymous users are prompted to add and verify an email using Supabase's email-change flow. This preserves their current Auth user ID, group memberships, availability and creator/admin status. They must do this from the browser/device where their old anonymous session still exists.
- Do not disable Anonymous Sign-Ins until existing anonymous users have upgraded or the group admin has planned how to handle any unclaimed legacy memberships. The new frontend does not create new anonymous accounts.
- The SQL enables RLS. Authenticated members can read only rows belonging to groups they joined; browser writes are restricted to narrowly scoped `SECURITY DEFINER` RPC functions that verify group membership.
- Invite codes are bearer credentials. Do not post them publicly. For a production community, consider adding rate limiting, invite rotation, group-admin controls, member removal and abuse reporting.
- Anonymous sign-ins can be abused if left unrestricted. Configure Supabase Auth rate limits / CAPTCHA as appropriate for your project.
- GitHub Pages is static hosting. Supabase is the backend.
- The first version lets group members add clubs themselves; it does not claim to provide a verified directory of Málaga venues.
- WhatsApp sharing opens a pre-filled message. The user still chooses the chat and presses Send.

## Troubleshooting

- **“Setup required”**: check `config.js` and ensure the URL and public anon key are correct.
- **No OTP email arrives**: check custom SMTP configuration, sender-domain verification, spam folders, Supabase Auth rate limits, and that the email templates contain `{{ .Token }}` rather than only a confirmation URL.
- **Existing anonymous user cannot upgrade**: use the same browser/device that still has the old Supabase session. If the session was cleared, the old anonymous user cannot be recovered by email; the person must rejoin with their verified email, and an admin may need to remove the old membership.
- **Group list does not load after signing in on a second device**: run `supabase/migrate-email-auth.sql` once in Supabase SQL Editor.
- **RPC function not found**: rerun `supabase/schema.sql`, then refresh the app.
- **Realtime does not refresh**: enable the three listed tables in the `supabase_realtime` publication. Manual refresh/re-entry still reloads the dashboard.
- **Invite code not found**: copy the full code exactly; codes are case-insensitive.
- **Site is blank or styles missing**: confirm all frontend files are in the repository root and GitHub Pages is deploying the `main` branch root.

## Local preview

You can preview the static files using any local static server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Supabase must still be configured in `config.js`.


### Flexible availability slots
Players can add multiple start-time/duration combinations for each weekday. Start times are available every 30 minutes from 17:00 to 22:00, with 60- or 90-minute durations. For existing installations, run `supabase/migrate-flexible-time-slots.sql` once in the Supabase SQL Editor. This migration clears previous availability selections but keeps groups, members, and clubs.


### Availability preferences
Each preference is added as one row containing weekday, start time, duration (60 or 90 minutes), and location (a specific group club or Any location). Members can add multiple rows and remove individual preferences. This is a frontend-only usability update; the existing flexible-time database schema and RPC migration remain compatible, so no new database migration is required if you already applied the flexible-time migration.


### Upcoming Group Unlock sessions
The dashboard lists all upcoming weekly availability overlaps with at least four distinct members matching the exact weekday, start time, duration, and location. Each weekday preference is mapped to its next calendar occurrence; if today's matching start time has already passed, the next occurrence is shown the following week. Matches are ordered by upcoming date and start time. Each match has its own WhatsApp share action. This is based on recurring weekly preferences and does not check live court inventory or create a court booking.


### Group admin and member removal
The person who creates a group is its administrator. The admin sees an ADMIN label and Remove controls beside other members in the crew list. Removing a member deletes that membership and the member's saved availability for this group; it does not delete their Supabase anonymous-auth identity or affect their membership in other groups. The group creator cannot be removed through this control. Existing Supabase projects must run `supabase/migrate-group-admin.sql` once in the SQL Editor. The migration uses the existing `padel_groups.created_by` owner field and enforces the permission inside a SECURITY DEFINER RPC, so hiding the button in the browser is not the security boundary.


### Email OTP authentication and existing users
The app now uses Supabase email OTP instead of creating new anonymous sessions. The OTP form uses `signInWithOtp` and `verifyOtp`. Existing anonymous users are detected and offered an email-linking flow (`updateUser({ email })` followed by `verifyOtp` with `type: "email_change"`) so their existing Supabase user ID, group memberships and admin rights remain unchanged. Keep Anonymous Sign-Ins enabled temporarily while legacy users upgrade; the updated frontend does not create new anonymous users.

For users signing in on another device, `get_my_padel_groups()` lists groups attached to the verified Supabase user. This RPC is added by `supabase/migrate-email-auth.sql` for existing installations. The migration adds no tables and does not rewrite existing user IDs.

Email verification delivery is not automatically free: Supabase's built-in sender has strict testing limits. Configure your own SMTP provider in Supabase Auth. The SMTP provider may have a free allowance or may charge based on volume. The application code itself does not require a paid library or SMS service.
