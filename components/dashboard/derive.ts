/* ============================================================
   Dashboard selections.

   Which jobs a widget is looking at — slices of the visible job
   list by date. These are selections, not rules: anything that
   derives a value from a job (missing info, covers, money) still
   comes from lib/domain, so the dashboard cannot disagree with
   the calendar or the finances page about what a job is worth.
   ============================================================ */

import { addDays, dayVal, todayISO } from "@/lib/domain";
import type { Job } from "@/lib/types";

/** Jobs whose last shoot day is today or later, soonest first. */
export const upcomingJobs = (jobs: Job[], today: string = todayISO()): Job[] =>
  jobs
    .filter((j) => j.shootDays.length > 0 && j.shootDays[j.shootDays.length - 1] >= today)
    .sort((a, b) => a.shootDays[0].localeCompare(b.shootDays[0]));

/** Jobs with at least one shoot day in the next seven days. */
export function jobsThisWeek(jobs: Job[], today: string = todayISO()): Job[] {
  const end = addDays(today, 6);
  return jobs.filter((j) => j.shootDays.some((d) => d >= today && d <= end));
}

/**
 * Headcount summed over every shoot day in the next seven days,
 * honouring per-day overrides the same way totalCovers does.
 */
export function coversThisWeek(
  jobs: Job[],
  today: string = todayISO(),
): { covers: number; days: number } {
  const end = addDays(today, 6);
  let covers = 0;
  let days = 0;
  for (const j of jobs) {
    for (const d of j.shootDays) {
      if (d < today || d > end) continue;
      days += 1;
      covers += Number(dayVal(j, d, "headcount")) || 0;
    }
  }
  return { covers, days };
}

/** The first shoot day after today across every job, or null. */
export function nextShootDay(jobs: Job[], today: string = todayISO()): string | null {
  let next: string | null = null;
  for (const j of jobs) {
    for (const d of j.shootDays) {
      if (d > today && (next === null || d < next)) next = d;
    }
  }
  return next;
}
