/* ============================================================
   Crafty Central — domain rules

   The pure half of the old store.js: everything that derives a
   value from data without touching persistence. Shared by the
   server (API routes, validation) and the client (rendering),
   so a rule is written once and cannot drift between the two.
   ============================================================ */

import {
  DEFAULT_SETTINGS,
  type CrewSlot,
  type DayInfo,
  type Invoice,
  type Job,
  type Person,
  type Role,
  type Settings,
  type TimeOff,
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

/* ---------- permissions ---------- */

export type Permission =
  | "finances"
  | "createJob"
  | "editJob"
  | "assignCrew"
  | "approveTimeOff"
  | "editDirectory"
  | "seeAllJobs";

const PERMISSIONS: Record<Permission, Role[]> = {
  finances: ["admin"],
  createJob: ["admin", "moderator"],
  editJob: ["admin", "moderator"],
  assignCrew: ["admin", "moderator"],
  approveTimeOff: ["admin", "moderator"],
  editDirectory: ["admin", "moderator"],
  seeAllJobs: ["admin", "moderator"],
};

export const can = (role: Role, perm: Permission): boolean =>
  PERMISSIONS[perm].includes(role);

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

export function jobSubtotal(j: Job, settings: Settings = DEFAULT_SETTINGS): number {
  const days = j.shootDays.length || 1;
  const perHead = j.rates?.perHead ?? settings.perHeadDefault;
  const truckDay = j.rates?.truckDay ?? settings.truckDayDefault;
  return totalCovers(j) * perHead + truckDay * days;
}

export function invoiceTotal(
  inv: Invoice,
  job: Job | undefined,
  settings: Settings = DEFAULT_SETTINGS,
): number {
  if (!job) return 0;
  return jobSubtotal(job, settings) * (1 + (inv.taxRate ?? 0.13));
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

export const notificationIsMine = (
  audience: string,
  role: Role,
  myId: string,
): boolean =>
  audience === "all" ||
  audience === role ||
  (audience === "moderator" && role === "admin") ||
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
