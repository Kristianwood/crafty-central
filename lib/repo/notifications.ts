/* ============================================================
   Crafty Central — notification repository

   Audience is one of: 'all', a role name, or 'person:<id>'.
   Which role audiences a person receives is decided once, by
   notificationAudiences() in lib/domain.ts, and used here in SQL
   and on the client alike: the office ("moderator") audience
   reaches admins and the owner, and "admin" reaches the owner.
   ============================================================ */

import { execute, query } from "../db";
import { notificationAudiences, uid } from "../domain";
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

/** The audiences this person receives, as a parameter list for IN (...). */
function audienceParams(myId: string, role: Role): { placeholders: string; values: string[] } {
  const values = ["all", ...notificationAudiences(role), "person:" + myId];
  return { placeholders: values.map(() => "?").join(","), values };
}

export async function myNotifications(
  myId: string,
  role: Role,
  limit = 100,
): Promise<AppNotification[]> {
  const { placeholders, values } = audienceParams(myId, role);
  const rows = await query<NotificationRow>(
    `SELECT n.*, r.person_id IS NOT NULL AS read_flag
       FROM notifications n
       LEFT JOIN notification_reads r
         ON r.notification_id = n.id AND r.person_id = ?
      WHERE n.audience IN (${placeholders})
      ORDER BY n.at DESC
      LIMIT ?`,
    [myId, ...values, limit],
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
  const { placeholders, values } = audienceParams(myId, role);
  await execute(
    `INSERT IGNORE INTO notification_reads (notification_id, person_id)
     SELECT n.id, ? FROM notifications n
      WHERE n.audience IN (${placeholders})`,
    [myId, ...values],
  );
}
