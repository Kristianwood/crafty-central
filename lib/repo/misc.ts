/* ============================================================
   Crafty Central — companies, menu templates, on-set crew,
   inquiries, time off and settings.

   Small tables with no assembly to speak of, kept together
   rather than spread across seven near-empty files. Invoices
   grew lines and documents in 1.2 and moved to ./invoices.ts;
   the catalogue and kits live in ./catalog.ts.
   ============================================================ */

import { execute, isoDateTime, jsonArray, mysqlDateTime, query, queryOne, transaction } from "../db";
import { STALE_REQUEST_HOURS, parseDateTime, uid } from "../domain";
import { fmtAgo } from "../format";
import {
  DEFAULT_SETTINGS,
  type Company,
  type Inquiry,
  type MenuTemplate,
  type SetCrewMember,
  type Settings,
  type TimeOff,
  type TimeOffStatus,
} from "../types";
import { notify } from "./notifications";

/* ---------- companies ---------- */

interface CompanyRow {
  id: string;
  name: string;
  billing_address: string;
  contact_name: string;
  email: string;
  phone: string;
}

const toCompany = (r: CompanyRow): Company => ({
  id: r.id,
  name: r.name,
  billingAddress: r.billing_address,
  contactName: r.contact_name,
  email: r.email,
  phone: r.phone,
});

export async function listCompanies(): Promise<Company[]> {
  const rows = await query<CompanyRow>("SELECT * FROM companies ORDER BY name");
  return rows.map(toCompany);
}

/** Jobs store the company as free text; match it the way the views do. */
export async function findCompanyByName(name: string): Promise<Company | null> {
  const n = (name || "").trim();
  if (!n) return null;
  const r = await queryOne<CompanyRow>(
    "SELECT * FROM companies WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1",
    [n],
  );
  return r ? toCompany(r) : null;
}

export async function saveCompany(input: Partial<Company>): Promise<Company> {
  const c: Company = {
    id: input.id || "co-" + uid(),
    name: input.name || "",
    billingAddress: input.billingAddress || "",
    contactName: input.contactName || "",
    email: input.email || "",
    phone: input.phone || "",
  };
  await execute(
    `INSERT INTO companies (id, name, billing_address, contact_name, email, phone)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), billing_address=VALUES(billing_address),
       contact_name=VALUES(contact_name), email=VALUES(email), phone=VALUES(phone)`,
    [c.id, c.name, c.billingAddress, c.contactName, c.email, c.phone],
  );
  return c;
}

export async function deleteCompany(id: string): Promise<void> {
  await execute("DELETE FROM companies WHERE id = ?", [id]);
}

/* ---------- menu templates ---------- */

export async function listMenus(): Promise<MenuTemplate[]> {
  const [menus, items] = await Promise.all([
    query<{ id: string; name: string }>("SELECT * FROM menus ORDER BY name"),
    query<{ menu_id: string; item: string }>(
      "SELECT menu_id, item FROM menu_items ORDER BY menu_id, position, id",
    ),
  ]);
  const byId = new Map(menus.map((m) => [m.id, { ...m, items: [] as string[] }]));
  for (const it of items) byId.get(it.menu_id)?.items.push(it.item);
  return [...byId.values()];
}

export async function saveMenu(input: Partial<MenuTemplate>): Promise<MenuTemplate> {
  const m: MenuTemplate = {
    id: input.id || "m-" + uid(),
    name: input.name || "",
    items: input.items || [],
  };
  await transaction(async (conn) => {
    await conn.execute(
      "INSERT INTO menus (id, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
      [m.id, m.name],
    );
    await conn.execute("DELETE FROM menu_items WHERE menu_id = ?", [m.id]);
    for (const [i, item] of m.items.entries()) {
      await conn.execute("INSERT INTO menu_items (menu_id, position, item) VALUES (?,?,?)", [
        m.id,
        i,
        item,
      ]);
    }
  });
  return m;
}

export async function deleteMenu(id: string): Promise<void> {
  await execute("DELETE FROM menus WHERE id = ?", [id]);
}

/* ---------- on-set crew (production-side people we feed) ---------- */

interface SetCrewRow {
  id: string;
  name: string;
  position: string;
  dietary: unknown;
  notes: string;
}

export async function listSetCrew(): Promise<SetCrewMember[]> {
  const rows = await query<SetCrewRow>("SELECT * FROM set_crew ORDER BY name");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    dietary: jsonArray(r.dietary),
    notes: r.notes,
  }));
}

export async function saveSetCrew(input: Partial<SetCrewMember>): Promise<SetCrewMember> {
  const c: SetCrewMember = {
    id: input.id || "sc-" + uid(),
    name: input.name || "",
    position: input.position || "",
    dietary: input.dietary || [],
    notes: input.notes || "",
  };
  await execute(
    `INSERT INTO set_crew (id, name, position, dietary, notes) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), position=VALUES(position),
       dietary=VALUES(dietary), notes=VALUES(notes)`,
    [c.id, c.name, c.position, JSON.stringify(c.dietary), c.notes],
  );
  return c;
}

export async function deleteSetCrew(id: string): Promise<void> {
  await execute("DELETE FROM set_crew WHERE id = ?", [id]);
}

/* ---------- outreach inquiries (job requests) ---------- */

interface InquiryRow {
  id: string;
  company: string;
  pm: string;
  email: string;
  phone: string;
  int_ext: string;
  day_night: string;
  headcount: number;
  notes: string;
  status: Inquiry["status"];
  created_at: string;
}

export async function listInquiries(): Promise<Inquiry[]> {
  const [rows, days] = await Promise.all([
    query<InquiryRow>("SELECT * FROM inquiries ORDER BY created_at DESC"),
    query<{ inquiry_id: string; shoot_date: string }>(
      "SELECT * FROM inquiry_days ORDER BY shoot_date",
    ),
  ]);
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        company: r.company,
        pm: r.pm,
        email: r.email,
        phone: r.phone,
        intExt: r.int_ext,
        dayNight: r.day_night,
        headcount: r.headcount,
        shootDays: [] as string[],
        notes: r.notes,
        status: r.status,
        /* ISO, so the browser reads an instant rather than a
           wall-clock string it would have to assume was its own. */
        createdAt: isoDateTime(r.created_at) ?? r.created_at,
      } satisfies Inquiry,
    ]),
  );
  for (const d of days) byId.get(d.inquiry_id)?.shootDays.push(d.shoot_date);
  return [...byId.values()];
}

export async function saveInquiry(input: Partial<Inquiry>): Promise<Inquiry> {
  const q: Inquiry = {
    id: input.id || "inq-" + uid(),
    company: input.company || "",
    pm: input.pm || "",
    email: input.email || "",
    phone: input.phone || "",
    intExt: input.intExt || "",
    dayNight: input.dayNight || "",
    headcount: input.headcount || 0,
    shootDays: (input.shootDays || []).slice().sort(),
    notes: input.notes || "",
    status: input.status || "new",
    createdAt: input.createdAt || new Date().toISOString(),
  };
  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO inquiries
         (id, company, pm, email, phone, int_ext, day_night, headcount, notes, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         company=VALUES(company), pm=VALUES(pm), email=VALUES(email), phone=VALUES(phone),
         int_ext=VALUES(int_ext), day_night=VALUES(day_night), headcount=VALUES(headcount),
         notes=VALUES(notes), status=VALUES(status)`,
      [
        q.id,
        q.company,
        q.pm,
        q.email,
        q.phone,
        q.intExt,
        q.dayNight,
        q.headcount,
        q.notes,
        q.status,
        mysqlDateTime(new Date(q.createdAt)),
      ],
    );
    await conn.execute("DELETE FROM inquiry_days WHERE inquiry_id = ?", [q.id]);
    for (const d of q.shootDays) {
      await conn.execute("INSERT INTO inquiry_days (inquiry_id, shoot_date) VALUES (?,?)", [
        q.id,
        d,
      ]);
    }
  });
  return q;
}

export async function setInquiryStatus(id: string, status: Inquiry["status"]): Promise<void> {
  await execute("UPDATE inquiries SET status = ? WHERE id = ?", [status, id]);
}

/**
 * Nag the office about requests nobody has answered. Called from
 * the workspace load rather than a timer — the same "nothing runs
 * at 7am" rule as chat quiet hours. A request is reminded about
 * once it has sat unanswered for STALE_REQUEST_HOURS, and again
 * every STALE_REQUEST_HOURS after that until someone deals with it.
 *
 * The UPDATE is the lock: two people loading the dashboard at the
 * same moment both see the row, but only the one whose UPDATE
 * actually changes it sends the notification.
 */
export async function remindStaleRequests(): Promise<number> {
  const rows = await query<{ id: string; company: string; headcount: number; created_at: string }>(
    `SELECT id, company, headcount, created_at FROM inquiries
      WHERE status = 'new'
        AND created_at < NOW() - INTERVAL ? HOUR
        AND (reminded_at IS NULL OR reminded_at < NOW() - INTERVAL ? HOUR)`,
    [STALE_REQUEST_HOURS, STALE_REQUEST_HOURS],
  );
  let sent = 0;
  for (const r of rows) {
    const res = await execute(
      `UPDATE inquiries SET reminded_at = NOW()
        WHERE id = ? AND status = 'new'
          AND (reminded_at IS NULL OR reminded_at < NOW() - INTERVAL ? HOUR)`,
      [r.id, STALE_REQUEST_HOURS],
    );
    if (!res.affectedRows) continue;
    await notify(
      "moderator",
      `Still waiting: ${r.company}'s job request (${r.headcount} on set) came in ${fmtAgo(
        parseDateTime(r.created_at),
      )} and nobody has answered it yet.`,
      "alert",
    );
    sent++;
  }
  return sent;
}

/* ---------- time off ---------- */

interface TimeOffRow {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: TimeOffStatus;
  created_at: string;
}

const toTimeOff = (r: TimeOffRow): TimeOff => ({
  id: r.id,
  personId: r.person_id,
  start: r.start_date,
  end: r.end_date,
  reason: r.reason,
  status: r.status,
  createdAt: r.created_at,
});

export async function listTimeOff(): Promise<TimeOff[]> {
  const rows = await query<TimeOffRow>("SELECT * FROM time_off ORDER BY start_date");
  return rows.map(toTimeOff);
}

export async function saveTimeOff(t: TimeOff): Promise<TimeOff> {
  await execute(
    `INSERT INTO time_off (id, person_id, start_date, end_date, reason, status, created_at)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE start_date=VALUES(start_date), end_date=VALUES(end_date),
       reason=VALUES(reason), status=VALUES(status)`,
    [t.id, t.personId, t.start, t.end, t.reason, t.status, t.createdAt],
  );
  return t;
}

export async function getTimeOff(id: string): Promise<TimeOff | null> {
  const r = await queryOne<TimeOffRow>("SELECT * FROM time_off WHERE id = ?", [id]);
  return r ? toTimeOff(r) : null;
}

export async function setTimeOffStatus(id: string, status: TimeOffStatus): Promise<void> {
  await execute("UPDATE time_off SET status = ? WHERE id = ?", [status, id]);
}

/* ---------- settings ---------- */

interface SettingsRow {
  quiet_start: number;
  quiet_end: number;
  per_head_default: string;
  truck_day_default: string;
}

export async function getSettings(): Promise<Settings> {
  const r = await queryOne<SettingsRow>("SELECT * FROM settings WHERE id = 1");
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    quietStart: r.quiet_start,
    quietEnd: r.quiet_end,
    perHeadDefault: Number(r.per_head_default),
    truckDayDefault: Number(r.truck_day_default),
  };
}

export async function saveSettings(s: Settings): Promise<Settings> {
  await execute(
    `INSERT INTO settings (id, quiet_start, quiet_end, per_head_default, truck_day_default)
     VALUES (1,?,?,?,?)
     ON DUPLICATE KEY UPDATE quiet_start=VALUES(quiet_start), quiet_end=VALUES(quiet_end),
       per_head_default=VALUES(per_head_default), truck_day_default=VALUES(truck_day_default)`,
    [s.quietStart, s.quietEnd, s.perHeadDefault, s.truckDayDefault],
  );
  return s;
}
