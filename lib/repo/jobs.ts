/* ============================================================
   Crafty Central — job repository

   Jobs are stored across four tables but handed to the rest of
   the app as the single Job object the views have always used.
   Assembly and disassembly both live here, so nothing else has
   to know the shape of the tables.
   ============================================================ */

import { execute, pool, query, transaction } from "../db";
import { reconcileDays, uid } from "../domain";
import type { CrewSlot, DayInfo, Job, JobStatus } from "../types";

interface JobRow {
  id: string;
  production_name: string;
  production_company: string;
  agency: string;
  pm: string;
  producers: string;
  headcount: number;
  location: string;
  call_time: string;
  wrap_time: string;
  status: JobStatus;
  notes: string;
  rate_per_head: string | null;
  rate_truck_day: string | null;
  is_sample: number;
  created_at: string;
}

interface DayRow {
  job_id: string;
  shoot_date: string;
  position: number;
  call_time: string | null;
  wrap_time: string | null;
  headcount: number | null;
  location: string | null;
  notes: string | null;
  has_crew_override: number;
  has_menu_override: number;
}

interface CrewRow {
  job_id: string;
  shoot_date: string | null;
  person_id: string;
  role: string;
  position: number;
}

interface MenuRow {
  job_id: string;
  shoot_date: string | null;
  position: number;
  item: string;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

/** Assemble the flat rows back into Job objects. */
function assemble(
  jobRows: JobRow[],
  dayRows: DayRow[],
  crewRows: CrewRow[],
  menuRows: MenuRow[],
): Job[] {
  const byId = new Map<string, Job>();

  for (const r of jobRows) {
    byId.set(r.id, {
      id: r.id,
      productionName: r.production_name,
      productionCompany: r.production_company,
      agency: r.agency,
      pm: r.pm,
      producers: r.producers,
      headcount: r.headcount,
      location: r.location,
      shootDays: [],
      callTime: r.call_time,
      wrapTime: r.wrap_time,
      status: r.status,
      crew: [],
      menu: [],
      rates: { perHead: num(r.rate_per_head), truckDay: num(r.rate_truck_day) },
      notes: r.notes,
      dayInfo: {},
      createdAt: r.created_at,
      ...(r.is_sample ? { sample: true } : {}),
    });
  }

  // Days, in order, plus their scalar overrides.
  for (const d of dayRows) {
    const j = byId.get(d.job_id);
    if (!j) continue;
    j.shootDays.push(d.shoot_date);
    const info: DayInfo = {};
    if (d.call_time !== null) info.callTime = d.call_time;
    if (d.wrap_time !== null) info.wrapTime = d.wrap_time;
    if (d.headcount !== null) info.headcount = d.headcount;
    if (d.location !== null) info.location = d.location;
    if (d.notes !== null) info.notes = d.notes;
    // An override can legitimately be empty, so the flag decides
    // whether the array exists — never the row count.
    if (d.has_crew_override) info.crew = [];
    if (d.has_menu_override) info.menu = [];
    if (Object.keys(info).length) j.dayInfo[d.shoot_date] = info;
  }

  for (const c of crewRows) {
    const j = byId.get(c.job_id);
    if (!j) continue;
    const slot: CrewSlot = { role: c.role, personId: c.person_id };
    if (c.shoot_date === null) j.crew.push(slot);
    else if (j.dayInfo[c.shoot_date]?.crew) j.dayInfo[c.shoot_date].crew!.push(slot);
  }

  for (const m of menuRows) {
    const j = byId.get(m.job_id);
    if (!j) continue;
    if (m.shoot_date === null) j.menu.push(m.item);
    else if (j.dayInfo[m.shoot_date]?.menu) j.dayInfo[m.shoot_date].menu!.push(m.item);
  }

  return [...byId.values()];
}

export async function listJobs(): Promise<Job[]> {
  const [jobRows, dayRows, crewRows, menuRows] = await Promise.all([
    query<JobRow>("SELECT * FROM jobs"),
    query<DayRow>("SELECT * FROM job_days ORDER BY job_id, position"),
    query<CrewRow>("SELECT * FROM job_crew ORDER BY job_id, position, id"),
    query<MenuRow>("SELECT * FROM job_menu_items ORDER BY job_id, position, id"),
  ]);
  return assemble(jobRows, dayRows, crewRows, menuRows);
}

export async function getJob(id: string): Promise<Job | null> {
  const [jobRows, dayRows, crewRows, menuRows] = await Promise.all([
    query<JobRow>("SELECT * FROM jobs WHERE id = ?", [id]),
    query<DayRow>("SELECT * FROM job_days WHERE job_id = ? ORDER BY position", [id]),
    query<CrewRow>("SELECT * FROM job_crew WHERE job_id = ? ORDER BY position, id", [id]),
    query<MenuRow>("SELECT * FROM job_menu_items WHERE job_id = ? ORDER BY position, id", [id]),
  ]);
  return assemble(jobRows, dayRows, crewRows, menuRows)[0] ?? null;
}

/**
 * Write a whole job. The child tables are replaced wholesale inside
 * one transaction — jobs are small and this keeps the write path a
 * single obvious thing rather than a diffing puzzle.
 */
export async function saveJob(input: Job): Promise<Job> {
  const j = reconcileDays({ ...input, dayInfo: { ...input.dayInfo } });

  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO jobs
         (id, production_name, production_company, agency, pm, producers, headcount,
          location, call_time, wrap_time, status, notes, rate_per_head, rate_truck_day,
          is_sample, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         production_name=VALUES(production_name),
         production_company=VALUES(production_company),
         agency=VALUES(agency), pm=VALUES(pm), producers=VALUES(producers),
         headcount=VALUES(headcount), location=VALUES(location),
         call_time=VALUES(call_time), wrap_time=VALUES(wrap_time),
         status=VALUES(status), notes=VALUES(notes),
         rate_per_head=VALUES(rate_per_head), rate_truck_day=VALUES(rate_truck_day)`,
      [
        j.id,
        j.productionName,
        j.productionCompany ?? "",
        j.agency ?? "",
        j.pm ?? "",
        j.producers ?? "",
        j.headcount || 0,
        j.location ?? "",
        j.callTime ?? "",
        j.wrapTime ?? "",
        j.status,
        j.notes ?? "",
        j.rates?.perHead ?? null,
        j.rates?.truckDay ?? null,
        j.sample ? 1 : 0,
        j.createdAt,
      ],
    );

    await conn.execute("DELETE FROM job_days WHERE job_id = ?", [j.id]);
    await conn.execute("DELETE FROM job_crew WHERE job_id = ?", [j.id]);
    await conn.execute("DELETE FROM job_menu_items WHERE job_id = ?", [j.id]);

    for (const [i, date] of j.shootDays.entries()) {
      const d: DayInfo = j.dayInfo[date] ?? {};
      await conn.execute(
        `INSERT INTO job_days
           (job_id, shoot_date, position, call_time, wrap_time, headcount,
            location, notes, has_crew_override, has_menu_override)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          j.id,
          date,
          i,
          d.callTime ?? null,
          d.wrapTime ?? null,
          d.headcount === "" || d.headcount === undefined ? null : d.headcount,
          d.location ?? null,
          d.notes ?? null,
          Array.isArray(d.crew) ? 1 : 0,
          Array.isArray(d.menu) ? 1 : 0,
        ],
      );
    }

    const crewRows: [string, string | null, string, string, number][] = [];
    j.crew.forEach((c, i) => crewRows.push([j.id, null, c.personId, c.role, i]));
    for (const date of j.shootDays) {
      const dayCrew = j.dayInfo[date]?.crew;
      if (Array.isArray(dayCrew)) {
        dayCrew.forEach((c, i) => crewRows.push([j.id, date, c.personId, c.role, i]));
      }
    }
    for (const row of crewRows) {
      await conn.execute(
        "INSERT INTO job_crew (job_id, shoot_date, person_id, role, position) VALUES (?,?,?,?,?)",
        row,
      );
    }

    const menuRows: [string, string | null, number, string][] = [];
    j.menu.forEach((item, i) => menuRows.push([j.id, null, i, item]));
    for (const date of j.shootDays) {
      const dayMenu = j.dayInfo[date]?.menu;
      if (Array.isArray(dayMenu)) {
        dayMenu.forEach((item, i) => menuRows.push([j.id, date, i, item]));
      }
    }
    for (const row of menuRows) {
      await conn.execute(
        "INSERT INTO job_menu_items (job_id, shoot_date, position, item) VALUES (?,?,?,?)",
        row,
      );
    }
  });

  return j;
}

export const newJobId = () => "j-" + uid();

/** Invoices go with the job — the foreign key cascades. */
export async function deleteJob(id: string): Promise<void> {
  await execute("DELETE FROM jobs WHERE id = ?", [id]);
}

export async function setJobStatus(id: string, status: JobStatus): Promise<void> {
  await execute("UPDATE jobs SET status = ? WHERE id = ?", [status, id]);
}

/** Jobs a given person is booked on, for cascade checks and the directory. */
export async function jobIdsForPerson(personId: string): Promise<string[]> {
  const rows = await query<{ job_id: string }>(
    "SELECT DISTINCT job_id FROM job_crew WHERE person_id = ?",
    [personId],
  );
  return rows.map((r) => r.job_id);
}

export async function jobsCount(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM jobs");
  return Number(rows[0]?.n ?? 0);
}

export { pool };
