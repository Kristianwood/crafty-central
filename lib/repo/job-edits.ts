/* ============================================================
   Crafty Central — the fiddly job mutations

   Adding one person to one day of a three-day job is not a field
   update: it may need the day to grow its own crew list first,
   copied from the job default, so that editing Tuesday never
   quietly changes Wednesday. That copy-on-write rule lived in
   store.js and lives here now, on the server, where it is applied
   once for every client.
   ============================================================ */

import { ApiError } from "../api";
import { allCrewIds, crewFor, menuFor } from "../domain";
import { fmtRange, fmtShort } from "../format";
import type { CrewSlot, DayInfo, Job } from "../types";
import { getJob, saveJob } from "./jobs";
import { notify } from "./notifications";

async function load(jobId: string): Promise<Job> {
  const j = await getJob(jobId);
  if (!j) throw new ApiError("That job is gone.", 404);
  return j;
}

/** The crew array to write to for a date — copied from the job default first. */
function dayCrewTarget(j: Job, date: string | null): CrewSlot[] {
  if (!date) return j.crew;
  const d: DayInfo = (j.dayInfo[date] = j.dayInfo[date] || {});
  if (!Array.isArray(d.crew)) d.crew = j.crew.map((c) => ({ ...c }));
  return d.crew;
}

/** The menu array to write to for a date — same copy-on-write. */
function dayMenuTarget(j: Job, date: string | null): string[] {
  if (!date) return j.menu;
  const d: DayInfo = (j.dayInfo[date] = j.dayInfo[date] || {});
  if (!Array.isArray(d.menu)) d.menu = j.menu.slice();
  return d.menu;
}

/**
 * Book someone. With a date: that day only. Without: the job
 * default *and* every day that already has its own list, so
 * "all days" genuinely means all days.
 */
export async function addCrew(
  jobId: string,
  roleTag: string,
  personId: string,
  date: string | null,
): Promise<Job> {
  const j = await load(jobId);

  if (date) {
    const target = dayCrewTarget(j, date);
    if (target.some((c) => c.personId === personId)) return j;
    target.push({ role: roleTag, personId });
    await notify(
      "person:" + personId,
      `You were added to ${j.productionName} as ${roleTag} for ${fmtShort(date)}.`,
      "briefcase",
    );
  } else {
    if (!j.crew.some((c) => c.personId === personId)) {
      j.crew.push({ role: roleTag, personId });
    }
    for (const d of Object.values(j.dayInfo)) {
      if (Array.isArray(d.crew) && !d.crew.some((c) => c.personId === personId)) {
        d.crew.push({ role: roleTag, personId });
      }
    }
    const days = j.shootDays;
    const when = days.length ? ` (${fmtRange(days[0], days[days.length - 1])})` : "";
    await notify(
      "person:" + personId,
      `You were added to ${j.productionName} as ${roleTag}${when}.`,
      "briefcase",
    );
  }

  return saveJob(j);
}

export async function removeCrew(
  jobId: string,
  index: number,
  date: string | null,
): Promise<Job> {
  const j = await load(jobId);
  // Validate against the *current* list before any copy-on-write,
  // so a stale index cannot materialise an empty day override.
  const current = date ? crewFor(j, date) : j.crew;
  if (!current[index]) return j;
  dayCrewTarget(j, date).splice(index, 1);
  return saveJob(j);
}

export async function addMenuItem(
  jobId: string,
  item: string,
  date: string | null,
): Promise<Job> {
  const text = item.trim();
  if (!text) return load(jobId);
  const j = await load(jobId);
  dayMenuTarget(j, date).push(text);
  return saveJob(j);
}

export async function removeMenuItem(
  jobId: string,
  index: number,
  date: string | null,
): Promise<Job> {
  const j = await load(jobId);
  const current = date ? menuFor(j, date) : j.menu;
  if (current[index] === undefined) return j;
  dayMenuTarget(j, date).splice(index, 1);
  return saveJob(j);
}

/**
 * Replace a menu with a copy of the given items. With a date, only
 * that day changes. Without one, the job default is set and every
 * per-day override is cleared, putting all days back in sync.
 * Jobs always hold copies, so editing a template later never
 * rewrites a job that already ran.
 */
export async function setMenu(
  jobId: string,
  items: string[],
  date: string | null,
): Promise<Job> {
  const j = await load(jobId);
  if (date) {
    j.dayInfo[date] = { ...(j.dayInfo[date] || {}), menu: items.slice() };
  } else {
    j.menu = items.slice();
    for (const d of Object.values(j.dayInfo)) delete d.menu;
  }
  return saveJob(j);
}

export async function setDayInfo(
  jobId: string,
  date: string,
  patch: Partial<DayInfo>,
): Promise<Job> {
  const j = await load(jobId);
  if (!j.shootDays.includes(date)) throw new ApiError("That day is not on this job.", 400);
  j.dayInfo[date] = { ...(j.dayInfo[date] || {}), ...patch };
  return saveJob(j);
}

/** Everyone booked on the job, for notifying on a status change. */
export const bookedOn = (j: Job) => allCrewIds(j);
