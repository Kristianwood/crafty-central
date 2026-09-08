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

On a genuinely empty database the first person to sign up becomes the owner.

### Roles

| Role | What it can do |
|---|---|
| Owner | Everything, including passing the owner seat on. One person. |
| Admin | Everything but the owner seat: money, invoices, catalogue, roles. |
| Moderator | Jobs, crew, menus, the directory, time off. No money. |
| Crew | Their own schedule, the calendar, chat, the directory. |

To seat the owner on a database that already has people:

```bash
npm run db:owner -- taso@example.com
```

The same thing can be done from the Directory — while nobody holds the seat,
an admin can hand it to one person; after that only the owner can move it.

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
  styles/           dashboard.css, invoicing.css — the 1.2 screens
  globals.css       Tailwind + the palette mirrored into @theme
components/
  dashboard/        one file per dashboard widget
  finances/         the invoice document preview, kit and catalogue forms
  invoice-editor.tsx the invoice builder
  the shell, the job side panel, shared bits
lib/
  types.ts          the domain shapes
  domain.ts         the rules — permissions, per-day fallbacks, money
  pdf/              the invoice PDF
  db.ts             the MySQL pool
  repo/             everything that touches the database
  auth.ts session.ts
db/
  schema.sql migrate.ts seed.ts make-owner.ts
```

## Invoicing

An invoice carries its own **lines** — description, quantity, unit, rate —
rather than being re-priced from its job every time it is looked at. Build
one from the job sheet ("Create invoice") or from Finances, then add items
from the **catalogue** or drop in a whole **kit**: a named bundle like
"Golden-hour add-on" that expands into its lines in one click. Kits and
catalogue items are copied onto the invoice, so changing a price next season
never rewrites an invoice that already went out.

Marking an invoice **sent** renders the PDF and archives it. From then on
`/api/invoices/<id>/pdf` serves that exact copy — what the client actually
received — while a draft renders live from whatever is on screen. Add
`?download=1` to get it as a download instead of in the browser.

Tracking lives on the Finances → Invoices tab and on the dashboard: drafts,
sent, **overdue** (sent and past its due date), and paid, with the days
overdue counted for you.

Invoices written before 1.2 are given their lines by `npm run db:migrate`,
frozen at the value their job priced out to at that moment. Nothing changes
value on the day you upgrade, and nothing keeps re-pricing itself afterwards.

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

**Run `npm run db:migrate` on the server as part of any release that
changes the schema — 1.2 does.** A deploy does not run it, and the health
and version checks do not touch the database, so an un-migrated release
reports a successful deploy and then fails on every signed-in screen. When
that happens the app says so: signing in shows a page naming the command.
Running it takes a moment, loses nothing, and the app recovers without a
restart.

`db:migrate` only ever adds. It creates the tables and columns 1.2 needs
and fills in the ones existing rows were missing; it has no `DROP`, no
`TRUNCATE` and no `DELETE`, and running it twice is a no-op. On a database
that already holds real work, the only thing it changes about a row you
already had is storing a blank email as NULL rather than an empty string —
which the app still reads as blank.

`db:seed` is the destructive one. On a database that already has people in
it, it refuses; with `--force` it empties every table and reloads the demo
data. Never point it at the live database.

Roll back safely: the 1.2 schema does not disturb 1.0, but the **owner
role** does — 1.0 does not know it and grants it nothing, so that person
would find the app empty. Seat the owner only once 1.2 has settled, and
demote them to admin first if you ever go back.
