# Padel Connect

A private, mobile-friendly padel availability planner for friend groups in Málaga. Hosted on GitHub Pages, with Supabase providing anonymous sessions, private-group membership, database storage and live updates.

## Access model

- Anyone can open the site, but cannot see group data without joining.
- A person joins using a private invite code and a display name.
- Each browser/device gets a Supabase anonymous-auth identity. No email/password registration is required.
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
3. In **Authentication → Providers → Anonymous Sign-Ins**, enable anonymous sign-ins. The exact menu wording may vary.
4. Open **SQL Editor**, create a new query, paste all of `supabase/schema.sql`, and run it.
5. Open **Database → Publications** (or the Realtime settings) and enable Realtime for:
   - `padel_availability`
   - `padel_members`
   - `padel_clubs`
6. Confirm the SQL ran successfully before publishing the site.

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
4. Friends open the link, enter their display name and join.
5. Add your group's preferred padel clubs in Málaga.
6. Each member selects days, time periods and clubs, then presses **Save my availability**.
7. The dashboard updates live when members add or change availability. Use **Share best slot on WhatsApp** to share the current highest-overlap slot.

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

- The browser uses Supabase anonymous authentication. Anonymous identity is stored by the browser; clearing site data or switching devices creates a new identity.
- The SQL enables RLS. Authenticated members can read only rows belonging to groups they joined; browser writes are restricted to narrowly scoped `SECURITY DEFINER` RPC functions that verify group membership.
- Invite codes are bearer credentials. Do not post them publicly. For a production community, consider adding rate limiting, invite rotation, group-admin controls, member removal and abuse reporting.
- Anonymous sign-ins can be abused if left unrestricted. Configure Supabase Auth rate limits / CAPTCHA as appropriate for your project.
- GitHub Pages is static hosting. Supabase is the backend.
- The first version lets group members add clubs themselves; it does not claim to provide a verified directory of Málaga venues.
- WhatsApp sharing opens a pre-filled message. The user still chooses the chat and presses Send.

## Troubleshooting

- **“Setup required”**: check `config.js` and ensure the URL and public anon key are correct.
- **Anonymous sign-in fails**: enable Anonymous Sign-Ins in Supabase Auth.
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
Players can add multiple start-time/duration combinations for each weekday. Start times are available every 15 minutes from 17:00 to 22:00, with 60- or 90-minute durations. For existing installations, run `supabase/migrate-flexible-time-slots.sql` once in the Supabase SQL Editor. This migration clears previous availability selections but keeps groups, members, and clubs.


### Availability preferences
Each preference is added as one row containing weekday, start time, duration (60 or 90 minutes), and location (a specific group club or Any location). Members can add multiple rows and remove individual preferences. This is a frontend-only usability update; the existing flexible-time database schema and RPC migration remain compatible, so no new database migration is required if you already applied the flexible-time migration.
