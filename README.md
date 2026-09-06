# Crafty Central

The all-in-one hub for Crafty — jobs, calendar, crew, chat, and invoicing.

Next.js 16 (App Router) · TypeScript · Tailwind v4 · MySQL · npm.

```bash
npm install
cp .env.example .env           # fill in your MySQL details
npm run db:migrate             # create the schema
npm run db:seed                # optional demo data
npm run dev                    # http://localhost:3000
```

## First sign-in

`db:seed` deliberately creates people with **no passwords**. Claim the owner
account by signing up at `/login` with `marisol@craftyto.ca` — the role and
position already on file are kept, which is the same rule that applies to
anyone an admin adds to the Directory later.

On a genuinely empty database the first person to sign up becomes the admin.

For a throwaway development database you can skip the ceremony:

```bash
npm run db:seed -- --force --password=letmein
```

Never do that on anything reachable from the internet.

## Where things are

```
app/
  (app)/            the signed-in shell — auth is checked once, in its layout
    dashboard/ calendar/ schedule/ menus/ chat/ directory/ finances/
    brief/[jobId]/  the call sheet for one shoot day, now a real URL
  login/            sign in / sign up
  outreach/         the public enquiry form — the only page without a session
  api/              route handlers (see below)
  app.css           the stylesheet, carried over from the vanilla build
  globals.css       Tailwind + the palette mirrored into @theme
components/         the shell, the job side panel, shared bits
lib/
  types.ts          the domain shapes
  domain.ts         the rules — permissions, per-day fallbacks, money
  db.ts             the MySQL pool
  repo/             everything that touches the database
  auth.ts session.ts
db/
  schema.sql migrate.ts seed.ts
```

## Two endpoints not to touch

`app/api/health` and `app/api/version` are what the Forthway Command Center
uses to decide whether a deploy worked. `version` reads `build-info.json`
once at module load on purpose: if new files land without a restart it keeps
reporting the old version, and that is how a failed restart gets caught
instead of silently passing.

**Bump `version` in `package.json` for anything you want to see deployed** —
the Command Center shows `1.0.0 → 1.1.0` before it commits and uses the
number to confirm the restart took.

## How the data works

The database is normalised, but the app still handles a job as one object,
the way it always did. Two things carried over that are worth knowing:

- **Per-day overrides.** A job's crew and menu can differ per shoot day.
  Rows with a `NULL` shoot_date are the job default; rows with a date belong
  to that day. Because an override can legitimately be *empty*, `job_days`
  carries explicit `has_crew_override` / `has_menu_override` flags rather
  than inferring from row count. Editing one day never bleeds into another.
- **Quiet hours.** A message sent outside 07:00–21:00 is stored with a
  `deliver_at` in the morning. Nothing runs at 7am — every reader filters on
  the time, so it simply appears.

## What replaced Firebase

| Was | Now |
|---|---|
| Firebase Auth | email + bcrypt, session cookie, `sessions` table |
| Firestore documents | MySQL, assembled back into the same shapes |
| `onSnapshot` live sync | polling — 8s for the workspace, 3s in chat |
| Firestore security rules | permission checks in the API routes |
| client-side writes | API routes; the public form is validated and rate-limited |

## Deploy settings

| Setting | Value |
|---|---|
| Install | `npm install --no-audit --no-fund` |
| Build | `npm run build` |
| Must exist after a build | `.next/BUILD_ID` |
| Restart | pm2 — first start command `npm start` |
| Port | whatever you assign the site |

`.env` lives on the server and survives every deploy and rollback.
Run `npm run db:migrate` there once before the first deploy.
