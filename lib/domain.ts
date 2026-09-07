/* ============================================================
   Crafty Central — domain rules

   The pure half of the old store.js: everything that derives a
   value from data without touching persistence. Shared by the
   server (API routes, validation) and the client (rendering),
   so a rule is written once and cannot drift between the two.
   ============================================================ */

import {
  DEFAULT_SETTINGS,
  ROLES,
  type CatalogItem,
  type CrewSlot,
  type DashboardLayout,
  type DashboardWidget,
  type DayInfo,
  type Inquiry,
  type Invoice,
  type InvoiceLine,
  type Job,
  type Kit,
  type Person,
  type Role,
  type Settings,
  type StatId,
  type TimeOff,
  type WidgetId,
  type WidgetSize,
} from "./types";

/* ---------- ids ---------- */

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

/* ---------- dates ----------
   ISO yyyy-mm-dd strings throughout, compared as strings. Parsing
   appends T00:00:00 so a date is never pulled a day backwards by
   the local timezone. */

export function iso(d: Date | string): string {
  const x = d instanceof Date ? d : new Date(d + "T00:00:00");
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
    x.getDate(),
  ).padStart(2, "0")}`;
}

export const todayISO = () => iso(new Date());

export function addDays(isoStr: string, n: number): string {
  const d = new Date(isoStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}

/* ---------- roles & permissions ---------- */

/** Lower rank = more power. */
export const ROLE_RANK: Record<Role, number> = { owner: 0, admin: 1, moderator: 2, crew: 3 };

export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  crew: "Crew",
};

export type Permission =
  | "finances"
  | "createJob"
  | "editJob"
  | "assignCrew"
  | "approveTimeOff"
  | "editDirectory"
  | "seeAllJobs"
  | "manageRoles"
  | "grantOwner"
  | "manageCatalog"
  | "customizeDashboard";

const ADMIN_UP: Role[] = ["owner", "admin"];
const MODERATOR_UP: Role[] = ["owner", "admin", "moderator"];

const PERMISSIONS: Record<Permission, Role[]> = {
  finances: ADMIN_UP,
  createJob: MODERATOR_UP,
  editJob: MODERATOR_UP,
  assignCrew: MODERATOR_UP,
  approveTimeOff: MODERATOR_UP,
  editDirectory: MODERATOR_UP,
  seeAllJobs: MODERATOR_UP,
  /** Set someone's role (owner seat excluded — see grantOwner). */
  manageRoles: ADMIN_UP,
  /** Hand out or take back the owner seat. Owner only. */
  grantOwner: ["owner"],
  /** Products, services and kits. Priced, so it goes with finances. */
  manageCatalog: ADMIN_UP,
  /** Anyone who has a dashboard may arrange it. */
  customizeDashboard: MODERATOR_UP,
};

export const can = (role: Role, perm: Permission): boolean =>
  PERMISSIONS[perm].includes(role);

/**
 * May `actor` set `target` to `next`? Admins manage roles below
 * owner; only an owner grants or revokes the owner seat — except
 * that while nobody is owner yet, an admin may claim it for the
 * business owner (that is how Taso gets the seat on an existing
 * database without a console session).
 */
export function mayAssignRole(
  actor: Role,
  current: Role | null,
  next: Role,
  ownerExists: boolean,
): boolean {
  if (!can(actor, "manageRoles")) return false;
  const touchesOwner = next === "owner" || current === "owner";
  if (!touchesOwner) return true;
  if (can(actor, "grantOwner")) return true;
  return next === "owner" && !ownerExists;
}

/* ---------- crew-role tags ----------
   Inferred once from a person's position when a record has no tags
   at all, exactly as the old normalizer did. */

export function inferTags(position: string): string[] {
  const p = (position || "").toLowerCase();
  const tags: string[] = [];
  if (/driver|setup/.test(p)) tags.push("Driver");
  if (/chef|cook|grill|prep|barista/.test(p)) tags.push("Chef");
  if (/captain|lead|key|owner/.test(p)) tags.push("Key");
  if (!tags.length) tags.push("Assist");
  return tags;
}

/* ---------- per-day values ----------
   Each shoot day can override callTime / wrapTime / headcount /
   location / notes; anything unset falls back to the job level. */

type DayField = "callTime" | "wrapTime" | "headcount" | "location" | "notes";

export function dayVal(j: Job, date: string, field: DayField): string | number {
  const d = j.dayInfo?.[date];
  if (d) {
    const v = d[field];
    if (v !== undefined && v !== "" && v !== null) return v as string | number;
  }
  const jv = (j as unknown as Record<string, unknown>)[field];
  return (jv ?? "") as string | number;
}

/** Effective menu for a shoot day: the day's own, else the job default. */
export const menuFor = (j: Job, date: string): string[] =>
  Array.isArray(j.dayInfo?.[date]?.menu) ? j.dayInfo[date].menu! : j.menu;

/** Effective crew for a shoot day: the day's own, else the job default. */
export const crewFor = (j: Job, date: string): CrewSlot[] =>
  Array.isArray(j.dayInfo?.[date]?.crew) ? j.dayInfo[date].crew! : j.crew;

export const crewIds = (j: Job): string[] => j.crew.map((c) => c.personId);

/** Everyone booked on the job on at least one day. */
export function allCrewIds(j: Job): string[] {
  const days = j.shootDays || [];
  if (!days.length) return crewIds(j);
  const ids = new Set<string>();
  days.forEach((d) => crewFor(j, d).forEach((c) => ids.add(c.personId)));
  return [...ids];
}

export const personOnDay = (j: Job, personId: string, d: string): boolean =>
  crewFor(j, d).some((c) => c.personId === personId);

/** Total covers across all shoot days, honouring per-day headcounts. */
export const totalCovers = (j: Job): number =>
  j.shootDays.reduce((sum, d) => sum + (Number(dayVal(j, d, "headcount")) || 0), 0);

/**
 * What still needs filling in before this job is ready to run.
 * On a multi-day job, any single day missing crew or a menu counts.
 */
export function missing(j: Job): string[] {
  const out: string[] = [];
  const days = j.shootDays;
  if (days.length ? days.some((d) => !crewFor(j, d).length) : !j.crew.length) out.push("crew");
  if (days.length ? days.some((d) => !menuFor(j, d).length) : !j.menu.length) out.push("menu");
  if (!j.headcount) out.push("headcount");
  if (!j.location) out.push("location");
  if (!j.callTime) out.push("call time");
  return out;
}

/* ---------- visibility ---------- */

export function visibleJobs(jobs: Job[], me: Person): Job[] {
  if (can(me.role, "seeAllJobs")) return jobs.slice();
  return jobs.filter((j) => allCrewIds(j).includes(me.id));
}

export const jobsOn = (jobs: Job[], date: string): Job[] =>
  jobs.filter((j) => j.shootDays.includes(date));

/* ---------- crew workload ---------- */

export const personJobs = (jobs: Job[], personId: string): Job[] =>
  jobs
    .filter((j) => allCrewIds(j).includes(personId))
    .sort((a, b) => (a.shootDays[0] || "").localeCompare(b.shootDays[0] || ""));

/** Upcoming booked days (today onward) the person actually works. */
export function personUpcomingDays(jobs: Job[], personId: string): number {
  const T = todayISO();
  const days = new Set<string>();
  personJobs(jobs, personId).forEach((j) =>
    j.shootDays.forEach((d) => {
      if (d >= T && personOnDay(j, personId, d)) days.add(d);
    }),
  );
  return days.size;
}

/** date -> job map, for the mini calendar on a person's card. */
export function personBookedDays(jobs: Job[], personId: string): Record<string, Job> {
  const map: Record<string, Job> = {};
  personJobs(jobs, personId).forEach((j) =>
    j.shootDays.forEach((d) => {
      if (personOnDay(j, personId, d)) map[d] = j;
    }),
  );
  return map;
}

/** People tagged for a crew role and not already booked in this scope. */
export function candidatesFor(
  people: Person[],
  j: Job | undefined,
  roleTag: string,
  date: string | null,
): Person[] {
  const taken = !j ? [] : date ? crewFor(j, date).map((c) => c.personId) : allCrewIds(j);
  return people.filter((p) => (p.tags || []).includes(roleTag) && !taken.includes(p.id));
}

/** Does this person have time off overlapping any of these days? */
export const hasTimeOff = (timeOff: TimeOff[], personId: string, days: string[]): boolean =>
  timeOff.some(
    (t) =>
      t.personId === personId &&
      t.status !== "denied" &&
      days.some((d) => d >= t.start && d <= t.end),
  );

/* ---------- money ---------- */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function jobSubtotal(j: Job, settings: Settings = DEFAULT_SETTINGS): number {
  const days = j.shootDays.length || 1;
  const perHead = j.rates?.perHead ?? settings.perHeadDefault;
  const truckDay = j.rates?.truckDay ?? settings.truckDayDefault;
  return totalCovers(j) * perHead + truckDay * days;
}

/** Ontario HST; the rate every new invoice starts on. */
export const DEFAULT_TAX_RATE = 0.13;

/**
 * The two lines every job prices out to — covers × per-head, and
 * the truck by the day. New invoices start with these; invoices
 * drafted before lines existed are priced from them on the fly.
 */
export function defaultInvoiceLines(j: Job, settings: Settings = DEFAULT_SETTINGS): InvoiceLine[] {
  const days = j.shootDays.length || 1;
  const perHead = j.rates?.perHead ?? settings.perHeadDefault;
  const truckDay = j.rates?.truckDay ?? settings.truckDayDefault;
  return [
    {
      description: `Full craft service — ${j.productionName}`,
      qty: totalCovers(j),
      unit: "covers",
      unitPrice: perHead,
    },
    { description: "Truck & crew day rate", qty: days, unit: "days", unitPrice: truckDay },
  ];
}

export const lineAmount = (l: InvoiceLine): number => round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0));

/** The lines an invoice prices from: its own, or the job's if it has none. */
export function invoiceLines(
  inv: Invoice,
  job: Job | undefined,
  settings: Settings = DEFAULT_SETTINGS,
): InvoiceLine[] {
  if (inv.lines?.length) return inv.lines;
  return job ? defaultInvoiceLines(job, settings) : [];
}

export const invoiceSubtotal = (
  inv: Invoice,
  job: Job | undefined,
  settings: Settings = DEFAULT_SETTINGS,
): number => round2(invoiceLines(inv, job, settings).reduce((s, l) => s + lineAmount(l), 0));

export const invoiceTax = (
  inv: Invoice,
  job: Job | undefined,
  settings: Settings = DEFAULT_SETTINGS,
): number => round2(invoiceSubtotal(inv, job, settings) * (inv.taxRate ?? DEFAULT_TAX_RATE));

export function invoiceTotal(
  inv: Invoice,
  job: Job | undefined,
  settings: Settings = DEFAULT_SETTINGS,
): number {
  return round2(invoiceSubtotal(inv, job, settings) + invoiceTax(inv, job, settings));
}

/** Where an invoice is in its life: overdue is a sent one past its due date. */
export type InvoiceState = "draft" | "sent" | "overdue" | "paid";

export function invoiceState(inv: Invoice, today: string = todayISO()): InvoiceState {
  if (inv.status === "paid") return "paid";
  if (inv.status === "sent") return inv.dueOn < today ? "overdue" : "sent";
  return "draft";
}

/** Days past due (positive) or until due (negative) for a sent invoice. */
export function invoiceDaysOverdue(inv: Invoice, today: string = todayISO()): number {
  const a = new Date(inv.dueOn + "T00:00:00").getTime();
  const b = new Date(today + "T00:00:00").getTime();
  return Math.round((b - a) / 86400_000);
}

/** Lines are frozen once the invoice has gone out. */
export const invoiceEditable = (inv: Invoice): boolean => inv.status === "draft";

export const invoiceNumber = (year: string, n: number): string =>
  `CR-${year}-${String(n).padStart(3, "0")}`;

/** A kit expanded against the catalogue. Items since deleted are skipped. */
export function kitLines(kit: Kit, catalog: CatalogItem[]): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  for (const it of kit.items) {
    const item = catalog.find((c) => c.id === it.catalogItemId);
    if (!item) continue;
    out.push({
      description: item.name,
      qty: Number(it.qty) || 1,
      unit: item.unit,
      unitPrice: item.unitPrice,
      catalogItemId: item.id,
      kitId: kit.id,
    });
  }
  return out;
}

export const catalogLine = (item: CatalogItem, qty = 1): InvoiceLine => ({
  description: item.name,
  qty,
  unit: item.unit,
  unitPrice: item.unitPrice,
  catalogItemId: item.id,
  kitId: null,
});

/** What a kit adds up to, before tax. */
export const kitTotal = (kit: Kit, catalog: CatalogItem[]): number =>
  round2(kitLines(kit, catalog).reduce((s, l) => s + lineAmount(l), 0));

/* ---------- job requests (outreach enquiries) ---------- */

/** After this long unanswered, a request is nagged about. */
export const STALE_REQUEST_HOURS = 24;

/**
 * A stored timestamp → ms. Inquiries cross the wire as ISO 8601, so
 * this is normally just Date.parse; the space-separated MySQL shape is
 * still accepted for anything read straight off a row on the server.
 */
export const parseDateTime = (s: string): number =>
  new Date((s || "").replace(" ", "T")).getTime();

export const inquiryAgeHours = (q: Inquiry, now: number): number =>
  Math.max(0, (now - parseDateTime(q.createdAt)) / 3600_000);

/** Unanswered requests, oldest first — the ones still owed a reply. */
export const unansweredRequests = (inquiries: Inquiry[]): Inquiry[] =>
  inquiries
    .filter((q) => q.status === "new")
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

export const isStaleRequest = (q: Inquiry, now: number): boolean =>
  inquiryAgeHours(q, now) >= STALE_REQUEST_HOURS;

/* ---------- dashboard ---------- */

export interface WidgetDef {
  id: WidgetId;
  label: string;
  hint: string;
  /** Hidden from anyone without this permission. */
  needs?: Permission;
  defaultSize: WidgetSize;
}

export const WIDGETS: WidgetDef[] = [
  { id: "stats", label: "At a glance", hint: "The numbers that matter this week.", defaultSize: "full" },
  { id: "requests", label: "Job requests", hint: "Enquiries from the outreach form that nobody has answered.", needs: "createJob", defaultSize: "full" },
  { id: "today", label: "On the truck today", hint: "Today's shoot days — call times, crew and location.", defaultSize: "half" },
  { id: "invoices", label: "Invoice tracking", hint: "What is overdue, what is waiting on payment, what is still a draft.", needs: "finances", defaultSize: "half" },
  { id: "upcoming", label: "Upcoming jobs", hint: "Everything on the books from today onward.", defaultSize: "full" },
  { id: "timeoff", label: "Time-off requests", hint: "Approve or deny — the crew member is notified either way.", needs: "approveTimeOff", defaultSize: "half" },
  { id: "notes", label: "My notes", hint: "A scratchpad only you can see.", defaultSize: "half" },
  { id: "workload", label: "Crew workload", hint: "Booked days from today onward.", needs: "assignCrew", defaultSize: "full" },
];

export interface StatDef {
  id: StatId;
  label: string;
  needs?: Permission;
}

export const STAT_TILES: StatDef[] = [
  { id: "jobsWeek", label: "Jobs this week" },
  { id: "covers", label: "Meals to plan · 7 days" },
  { id: "attention", label: "Needs attention" },
  { id: "requests", label: "Unanswered requests", needs: "createJob" },
  { id: "timeoff", label: "Time-off requests", needs: "approveTimeOff" },
  { id: "pipeline", label: "Open pipeline", needs: "finances" },
  { id: "outstanding", label: "Outstanding invoices", needs: "finances" },
  { id: "overdue", label: "Overdue invoices", needs: "finances" },
];

/** How many tiles fit across the stat row before it stops reading. */
export const MAX_STAT_TILES = 6;

export const widgetDef = (id: WidgetId): WidgetDef | undefined => WIDGETS.find((w) => w.id === id);

export const widgetsFor = (role: Role): WidgetDef[] =>
  WIDGETS.filter((w) => !w.needs || can(role, w.needs));

export const statTilesFor = (role: Role): StatDef[] =>
  STAT_TILES.filter((s) => !s.needs || can(role, s.needs));

/** What a fresh account sees, by role. */
export function defaultDashboard(role: Role): DashboardLayout {
  const money = can(role, "finances");
  const widgets: DashboardWidget[] = widgetsFor(role).map((w) => ({ id: w.id, size: w.defaultSize }));
  const stats: StatId[] = money
    ? ["jobsWeek", "covers", "requests", "outstanding"]
    : ["jobsWeek", "covers", "attention", "requests"];
  return { widgets, stats: stats.filter((s) => statTilesFor(role).some((t) => t.id === s)), notes: "" };
}

/**
 * Validate a stored (or posted) layout against what this role may
 * see: unknown or forbidden widgets are dropped and duplicates
 * collapsed.
 *
 * An empty list is only replaced by the default when the layout did
 * not carry one at all — a missing or malformed field, which is the
 * case the fallback is for. Someone who deliberately unticks every
 * stat tile, or hides every widget, gets what they asked for and the
 * "add a widget" tray to change their mind with; saying "saved" and
 * quietly putting the defaults back would be a lie.
 */
export function normalizeDashboard(raw: unknown, role: Role): DashboardLayout {
  const base = defaultDashboard(role);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DashboardLayout>;
  const allowed = new Set(widgetsFor(role).map((w) => w.id));
  const allowedStats = new Set(statTilesFor(role).map((s) => s.id));

  /* "Empty because they emptied it" and "empty because their role no
     longer allows any of it" are different answers. Only the first is
     honoured; the second falls back to the default, because a
     demotion should not be how someone's dashboard goes blank. */
  const askedWidgets = Array.isArray(r.widgets) ? r.widgets.length : -1;
  const askedStats = Array.isArray(r.stats) ? r.stats.length : -1;

  const seen = new Set<WidgetId>();
  const widgets: DashboardWidget[] = [];
  for (const w of Array.isArray(r.widgets) ? r.widgets : []) {
    if (!w || typeof w !== "object") continue;
    const id = (w as DashboardWidget).id;
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    const size: WidgetSize = (w as DashboardWidget).size === "half" ? "half" : "full";
    widgets.push({ id, size });
  }

  const stats: StatId[] = [];
  for (const s of Array.isArray(r.stats) ? r.stats : []) {
    if (allowedStats.has(s as StatId) && !stats.includes(s as StatId)) stats.push(s as StatId);
  }

  const notes = typeof r.notes === "string" ? r.notes.slice(0, 4000) : "";

  return {
    widgets: widgets.length || askedWidgets === 0 ? widgets : base.widgets,
    stats: stats.length || askedStats === 0 ? stats.slice(0, MAX_STAT_TILES) : base.stats,
    notes,
  };
}

/* ---------- chat ---------- */

/** Messages sent outside these hours wait until the window opens. */
export const chatWindowOpen = (settings: Settings, d: Date = new Date()): boolean => {
  const h = d.getHours();
  return h >= settings.quietStart && h < settings.quietEnd;
};

export function nextWindowOpen(settings: Settings): Date {
  const d = new Date();
  const open = new Date(d);
  open.setHours(settings.quietStart, 0, 0, 0);
  if (d.getHours() >= settings.quietEnd) open.setDate(open.getDate() + 1);
  return open;
}

export const dmChannel = (a: string, b: string): string =>
  "dm:" + [a, b].sort().join(":");

export const isDM = (channel: string): boolean => channel.startsWith("dm:");

/** The other person in a DM channel, from my point of view. */
export function dmPartnerId(channel: string, myId: string): string | null {
  if (!isDM(channel)) return null;
  const ids = channel.slice(3).split(":");
  return ids.find((id) => id !== myId) ?? myId;
}

/* ---------- notifications ---------- */

/**
 * The role audiences a person receives. Anything addressed to the
 * office ("moderator") reaches admins and the owner too; anything
 * addressed to admins reaches the owner. Crew hear only "crew".
 */
export function notificationAudiences(role: Role): string[] {
  switch (role) {
    case "owner":
      return ["owner", "admin", "moderator"];
    case "admin":
      return ["admin", "moderator"];
    default:
      return [role];
  }
}

export const notificationIsMine = (
  audience: string,
  role: Role,
  myId: string,
): boolean =>
  audience === "all" ||
  notificationAudiences(role).includes(audience) ||
  audience === "person:" + myId;

/* ---------- day reconciliation ----------
   Keeps dayInfo consistent with shootDays: drop overrides for days
   that no longer exist and, when a job shrinks to a single day,
   fold that day's overrides back into the job-level fields so a
   one-day job has exactly one source of truth. */

export function reconcileDays(j: Job): Job {
  j.dayInfo = j.dayInfo || {};
  const days = j.shootDays || [];
  Object.keys(j.dayInfo).forEach((d) => {
    if (!days.includes(d)) delete j.dayInfo[d];
  });
  if (days.length === 1) {
    const d: DayInfo | undefined = j.dayInfo[days[0]];
    if (d) {
      (["callTime", "wrapTime", "headcount", "location"] as const).forEach((f) => {
        const v = d[f];
        if (v !== undefined && v !== "" && v !== null) {
          (j as unknown as Record<string, unknown>)[f] = v;
        }
      });
      if (Array.isArray(d.menu)) j.menu = d.menu;
      if (Array.isArray(d.crew)) j.crew = d.crew;
      if (d.notes) j.notes = j.notes ? j.notes + " — " + d.notes : d.notes;
      j.dayInfo = {};
    }
  }
  return j;
}
