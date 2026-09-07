/* ============================================================
   Crafty Central — per-person dashboard layouts

   One JSON row per person. It is validated against their role on
   every read (normalizeDashboard), so a widget they lose access to
   simply disappears, and a role that gains a widget sees it once
   they add it — never a blank or a forbidden dashboard.
   ============================================================ */

import { execute, queryOne } from "../db";
import { defaultDashboard, normalizeDashboard } from "../domain";
import type { DashboardLayout, Role } from "../types";

export async function getDashboard(personId: string, role: Role): Promise<DashboardLayout> {
  const r = await queryOne<{ layout: unknown }>(
    "SELECT layout FROM dashboard_layouts WHERE person_id = ?",
    [personId],
  );
  if (!r) return defaultDashboard(role);
  let raw: unknown = r.layout;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  return normalizeDashboard(raw, role);
}

export async function saveDashboard(
  personId: string,
  role: Role,
  layout: unknown,
): Promise<DashboardLayout> {
  const clean = normalizeDashboard(layout, role);
  await execute(
    `INSERT INTO dashboard_layouts (person_id, layout) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE layout = VALUES(layout)`,
    [personId, JSON.stringify(clean)],
  );
  return clean;
}

/**
 * Put the arrangement back to the default — the widgets, their order
 * and the stat tiles. The notes are not part of the arrangement and
 * are the one thing here nobody else can recover, so they survive:
 * "reset my dashboard" must never be the way someone loses them.
 */
export async function resetDashboard(personId: string, role: Role): Promise<DashboardLayout> {
  const current = await getDashboard(personId, role);
  const fresh: DashboardLayout = { ...defaultDashboard(role), notes: current.notes };
  if (!fresh.notes) {
    await execute("DELETE FROM dashboard_layouts WHERE person_id = ?", [personId]);
    return fresh;
  }
  return saveDashboard(personId, role, fresh);
}
