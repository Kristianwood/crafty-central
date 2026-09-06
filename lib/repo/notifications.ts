/* ============================================================
   Crafty Central — notification repository

   Audience is one of: 'all', a role name, or 'person:<id>'.
   Admins also see anything addressed to moderators, which is the
   rule the old client applied and is now applied in SQL.
   ============================================================ */

import { execute, query } from "../db";
import { uid } from "../domain";
import type { AppNotification, Role } from "../types";

interface NotificationRow {
  id: string;
  audience: string;
  text: string;
  icon: string;
  at: number | string;
  read_flag: number | null;
}

export async function notify(
  audience: string,
  text: string,
  icon = "bell",
): Promise<AppNotification> {
  const n: AppNotification = {
    id: uid(),
    audience,
    text,
    icon,
    at: Date.now(),
    read: false,
  };
  await execute(
    "INSERT INTO notifications (id, audience, text, icon, at) VALUES (?,?,?,?,?)",
    [n.id, n.audience, n.text, n.icon, n.at],
  );
  return n;
}

export async function myNotifications(
  myId: string,
  role: Role,
  limit = 100,
): Promise<AppNotification[]> {
  const rows = await query<NotificationRow>(
    `SELECT n.*, r.person_id IS NOT NULL AS read_flag
       FROM notifications n
       LEFT JOIN notification_reads r
         ON r.notification_id = n.id AND r.person_id = ?
      WHERE n.audience = 'all'
         OR n.audience = ?
         OR (n.audience = 'moderator' AND ? = 'admin')
         OR n.audience = ?
      ORDER BY n.at DESC
      LIMIT ?`,
    [myId, role, role, "person:" + myId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    audience: r.audience,
    text: r.text,
    icon: r.icon,
    at: Number(r.at),
    read: !!r.read_flag,
  }));
}

export async function markAllRead(myId: string, role: Role): Promise<void> {
  await execute(
    `INSERT IGNORE INTO notification_reads (notification_id, person_id)
     SELECT n.id, ? FROM notifications n
      WHERE n.audience = 'all'
         OR n.audience = ?
         OR (n.audience = 'moderator' AND ? = 'admin')
         OR n.audience = ?`,
    [myId, role, role, "person:" + myId],
  );
}
