# What this project is

Crafty Central — the working hub for a Toronto craft-service company: shoot
jobs, a calendar, crew assignment, menus, chat, a crew directory, invoicing,
and a public enquiry form.

It began as a vanilla-JS single-page app on Firebase and was converted to
Next.js with MySQL. That history explains most of what looks unusual here,
so read the two sections marked **why** before changing anything structural.

## Stack

- **Next.js 16**, App Router, TypeScript in strict mode.
- **MySQL** via `mysql2`. No ORM.
- **Tailwind v4** is installed and its tokens work, but almost nothing uses
  it — see the styling rule below.
- **npm**. Keep `package-lock.json` in sync and commit it.

## Layout

```
app/
  (app)/            signed-in shell; its layout is where auth is checked
    dashboard/ calendar/ schedule/ menus/ chat/ directory/ finances/
    brief/[jobId]/
  login/  outreach/  api/
  app.css           the stylesheet the whole app is built on
  globals.css       Tailwind + the palette mirrored into @theme
components/
  dashboard/        one file per dashboard widget, plus the registry
  finances/         invoice document preview, kit + catalogue forms
  invoice-editor.tsx, job-panel.tsx, job-form.tsx, shell, primitives
lib/
  types.ts domain.ts format.ts db.ts auth.ts session.ts api.ts nav.ts
  invoice-input.ts  parsing invoice bodies off the wire
  pdf/              the invoice PDF renderer
  repo/             the only code that touches the database
db/                 schema.sql, migrate.ts, seed.ts, make-owner.ts
```

## House rules

**Styling comes from `app/app.css`, not Tailwind.** That file is the hand-
written stylesheet from the original build, carried over unchanged, and the
components are written to emit the class names it expects. Change a colour
in the `:root` block at the top of it (and mirror it in the `@theme` block in
`globals.css`). Do not restyle a component by sprinkling Tailwind utilities
over markup that app.css already styles — you will get both and neither.
Tailwind is there for genuinely new one-off layout.

**The database is only touched from `lib/repo/`.** Route handlers validate
input and check permissions; repos do the SQL. Nothing else opens a
connection.

**Permissions are checked on the server, every time.** `requireUser()` and
`requirePermission()` in `lib/auth.ts`; the permission map itself is
`can()` in `lib/domain.ts`. Roles run owner → admin → moderator → crew.
The nav hiding a link is a courtesy, not a
boundary — `lib/nav.ts` also gates the routes, and the API gates itself.
`loadWorkspace()` filters what a person is even sent: crew get only the jobs
they are booked on, and money never leaves the server for a non-admin.

**Rules live in `lib/domain.ts` and are shared by both sides.** Anything that
derives a value from data — per-day fallbacks, missing-info checks, job
pricing, quiet hours — is a pure function there, imported by the server and
the client alike, so a rule cannot drift between what the API enforces and
what the screen shows. Add new rules there, not in a component.

**why: per-day overrides.** A job's crew and menu can be overridden per
shoot day, copy-on-write from the job default. In the database, rows with a
`NULL` shoot_date are the job default and rows with a date belong to that
day; because an override can legitimately be *empty*, `job_days` carries
explicit `has_crew_override` / `has_menu_override` flags rather than
inferring from row count. `lib/repo/job-edits.ts` owns the copy-on-write.
Get this wrong and editing Tuesday silently changes Wednesday — which is
the bug the whole design is there to prevent.

**why: the owner seat.** `owner` is the business owner's role and holds
every permission, including the one an admin must not have: moving the seat
itself. `mayAssignRole()` in `lib/domain.ts` is the whole rule and both the
API and the Directory's role picker read it. The one deliberate exception —
while *nobody* is owner yet, an admin may seat one person — is what lets an
existing database get an owner from the Directory instead of a console.
`npm run db:owner -- <email>` does the same thing from the command line.

**why: invoices hold their own lines.** An invoice used to be priced from
its job every time it was rendered, so editing a wrapped job silently
changed an invoice that had already gone out. Now an invoice carries its own
lines and a snapshot of the billing address, and the PDF is archived in
`invoice_documents` the moment it is marked sent. From then on "the invoice
we sent" means those bytes. Lines are frozen once an invoice leaves draft;
reopening a sent invoice discards the archived PDF, and a paid one cannot be
reopened at all. `markInvoice()` claims the transition with the status the
caller read, and the PDF is archived from the row that actually committed,
so a concurrent save cannot leave an archive describing something else.

The migration backfills the lines of every invoice written before 1.2, at
the value its job priced out to on the day of the upgrade, so nothing stays
live-priced afterwards. The total can land a cent above what 1.0 *displayed*
on an invoice whose subtotal ended in half a cent: 1.0 multiplied the tax in
one go and rounded at the very end, and 1.2 rounds each line and the tax, so
the lines shown always add up to the total shown. `invoiceLines()` still
falls back to the job for an invoice with no lines, which is now only a
belt-and-braces path.

**Deleting.** A job whose invoice has already gone out is not deletable:
the foreign keys cascade, and that invoice is the only record of what the
client was charged. Drafts go with the job. Nobody deletes a person of
higher rank, and the owner is not deletable at all.

**why: kits are copied, not referenced.** A kit is a named bundle of
catalogue items. Dropping one onto an invoice copies its lines
(`kitLines()`), the same rule menus already follow, so re-pricing a kit next
season never rewrites last season's invoice. That is why
`invoice_lines.catalog_item_id` and `kit_id` are plain columns rather than
foreign keys.

**why: the dashboard is per person.** `dashboard_layouts` holds one JSON
layout per account — which widgets, in what order, at what width, which stat
tiles, and a private scratchpad. It is run through `normalizeDashboard()`
against the reader's role on every read and every write, so a widget a role
may not see cannot be pinned into a layout, and a layout that ends up empty
falls back to the default rather than rendering a blank page.

**Nothing runs on a timer.** Quiet-hours chat was already like this; the
unanswered-request reminder is too. `remindStaleRequests()` is called from
the workspace load for anyone who can see requests, and the `UPDATE` on
`reminded_at` is what stops two simultaneous pollers both sending it.

**Timestamps.** Every `DATETIME` is written server-local through
`mysqlDateTime()` in `lib/db.ts`, because they are compared against `NOW()`.
They cross to the browser as ISO 8601 (`isoDateTime()`), and are shown with
`fmtStamp()`, which reads the *local* date. Slicing the first ten characters
of an ISO string is the UTC date, and prints tomorrow for anything done
after about 8pm — do not do it.

**Schema changes go in two places.** `db/schema.sql` describes a fresh
database; the patch list in `db/migrate.ts` brings an existing one up to
date. MySQL 8 has no `ADD COLUMN IF NOT EXISTS`, so each patch checks
`information_schema` first. Adding a column to only one of the two is the
mistake to avoid — the deployed database is the one that has been running.

**why: no live sync.** Firestore used to push changes. Now the client polls:
`components/workspace-provider.tsx` re-fetches the whole workspace every 8s
(paused while the tab is hidden) and after every mutation; chat polls its
own feed every 3s. Mutations go through `mutate()` from `useWorkspace()`,
which POSTs and then refreshes — so nothing needs to update local state by
hand. If you add a mutation, use `mutate`, not `fetch`.

**Chat quiet hours.** A message sent outside 07:00–21:00 is stored with a
`deliver_at` in the morning and every reader filters on it. Nothing runs at
7am; do not add a job that "delivers" them. The client asks the server for
its clock (`now` in the chat feed) rather than reading its own, which also
keeps the render pure.

**Keep the two API routes as they are.** `app/api/health` and
`app/api/version` are what the Command Center uses to decide whether a
deploy worked. `version` reads `build-info.json` once at module load on
purpose: if new files land without a restart it keeps reporting the old
version, and that is how a failed restart gets caught instead of silently
passing. Do not make it re-read per request, and do not make `health` touch
the database — a blip would trigger a pointless rollback.

**Bump `version` in `package.json` for anything you want deployed.**

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # what the server runs on deploy
npm start
npm run typecheck    # tsc --noEmit
npm run lint
npm run db:migrate   # apply db/schema.sql + patches (idempotent)
npm run db:seed      # demo data; -- --force to wipe and reload
npm run db:owner -- taso@example.com   # hand someone the owner seat
```

Run `npm run typecheck`, `npm run lint` and `npm run build` before calling
work finished. A build that fails on the server is a deploy that never
happens.

If `typecheck` ever complains about duplicate identifiers in files named
like `routes.d 3.ts`, that is a stale `.next` — the folder is synced, and
the sync made copies. `rm -rf .next` and run it again.

## Deployment

By the Forthway Command Center: it unpacks the release beside the app, runs
`npm install` and `npm run build` in staging, swaps the result into place,
restarts, and waits for `/api/health` then `/api/version`, restoring the
previous build if either fails.

Two consequences:

- **`.env` files, `public/uploads` and `logs/` are never touched by a
  deploy.** The database credentials and `SESSION_SECRET` live on the server
  and survive every deploy and rollback. Do not commit them.
- **Anything written at runtime into a source directory is wiped** by the
  next deploy, because that directory is replaced from the archive.

`build-info.json` and `.forthway/` appear in the app directory on a deployed
server. Both belong to the Command Center, are gitignored, and nothing in
the app should write to them.

Run `npm run db:migrate` on the server once before the first deploy. It is
idempotent, so running it again after a schema change is safe.
