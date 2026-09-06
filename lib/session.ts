/* ============================================================
   Crafty Central — sessions

   Replaces Firebase Auth. A session is a random 32-byte token
   handed to the browser in an httpOnly cookie; what the database
   stores is an HMAC of that token, so a dump of the sessions
   table cannot be replayed as a login.
   ============================================================ */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { execute, queryOne } from "./db";

export const SESSION_COOKIE = "crafty_session";
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is missing or too short. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  // Development only: a fixed fallback so `npm run dev` works before
  // .env exists. Sessions reset whenever this changes.
  return "crafty-central-development-only-secret";
}

const tokenHash = (token: string): string =>
  createHmac("sha256", secret()).update(token).digest("hex");

const mysqlDate = (d: Date): string => d.toISOString().slice(0, 19).replace("T", " ");

/** Mint a session, store its hash, and set the cookie. */
export async function createSession(personId: string, userAgent = ""): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);

  await execute(
    "INSERT INTO sessions (id, person_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
    [tokenHash(token), personId, mysqlDate(now), mysqlDate(expires), userAgent.slice(0, 255)],
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  // Opportunistic cleanup — cheap, indexed, and keeps the table from
  // growing forever without needing a cron job.
  await execute("DELETE FROM sessions WHERE expires_at < NOW()").catch(() => {});
}

/** The person id behind the current cookie, or null. */
export async function sessionPersonId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{ person_id: string }>(
    "SELECT person_id FROM sessions WHERE id = ? AND expires_at > NOW()",
    [tokenHash(token)],
  );
  return row?.person_id ?? null;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await execute("DELETE FROM sessions WHERE id = ?", [tokenHash(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Constant-time compare, for anything that is not a password hash. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
