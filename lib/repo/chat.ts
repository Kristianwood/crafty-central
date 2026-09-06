/* ============================================================
   Crafty Central — chat repository

   Messages sent outside the quiet-hours window are stored with a
   deliver_at in the future; every reader filters on it, so a
   3 a.m. message simply appears at 7 a.m. for everyone without
   anything needing to run in between.

   Read state used to be per-device localStorage. Now that people
   have real accounts it is per-person, in chat_reads.
   ============================================================ */

import { execute, query } from "../db";
import type { Message } from "../types";

interface MessageRow {
  id: string;
  channel: string;
  from_id: string;
  text: string;
  sent_at: number | string;
  deliver_at: number | string;
}

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  channel: r.channel,
  fromId: r.from_id,
  text: r.text,
  sentAt: Number(r.sent_at),
  deliverAt: Number(r.deliver_at),
});

/**
 * Messages in a channel that this person may see: delivered ones,
 * plus their own still-queued messages so they can see what they
 * sent and when it will land.
 */
export async function channelMessages(channel: string, myId: string): Promise<Message[]> {
  const rows = await query<MessageRow>(
    `SELECT * FROM messages
      WHERE channel = ? AND (deliver_at <= ? OR from_id = ?)
      ORDER BY sent_at`,
    [channel, Date.now(), myId],
  );
  return rows.map(toMessage);
}

export async function insertMessage(m: Message): Promise<Message> {
  await execute(
    "INSERT INTO messages (id, channel, from_id, text, sent_at, deliver_at) VALUES (?,?,?,?,?,?)",
    [m.id, m.channel, m.fromId, m.text, m.sentAt, m.deliverAt],
  );
  return m;
}

/** Every DM channel this person is part of, plus the company channel. */
export async function myChannels(myId: string): Promise<{ company: string; dms: string[] }> {
  const rows = await query<{ channel: string }>(
    `SELECT DISTINCT channel FROM messages
      WHERE channel LIKE 'dm:%' AND channel LIKE ?`,
    [`%${myId}%`],
  );
  return { company: "company", dms: rows.map((r) => r.channel) };
}

export async function lastReads(myId: string): Promise<Record<string, number>> {
  const rows = await query<{ channel: string; last_read_at: number | string }>(
    "SELECT channel, last_read_at FROM chat_reads WHERE person_id = ?",
    [myId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.channel] = Number(r.last_read_at);
  return out;
}

export async function markChannelRead(myId: string, channel: string): Promise<void> {
  await execute(
    `INSERT INTO chat_reads (person_id, channel, last_read_at) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE last_read_at = VALUES(last_read_at)`,
    [myId, channel, Date.now()],
  );
}

/**
 * Which of my channels have something delivered since I last looked.
 * Done in SQL so the client never has to hold every message to
 * answer a question about badges.
 */
export async function unreadChannels(myId: string): Promise<string[]> {
  const rows = await query<{ channel: string }>(
    `SELECT DISTINCT m.channel
       FROM messages m
       LEFT JOIN chat_reads r ON r.channel = m.channel AND r.person_id = ?
      WHERE m.from_id <> ?
        AND m.deliver_at <= ?
        AND m.deliver_at > COALESCE(r.last_read_at, 0)
        AND (m.channel = 'company' OR m.channel LIKE ?)`,
    [myId, myId, Date.now(), `%${myId}%`],
  );
  return rows.map((r) => r.channel);
}
