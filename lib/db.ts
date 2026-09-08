/* ============================================================
   Crafty Central — MySQL connection

   One pool per process, cached across dev hot-reloads so a
   morning of editing does not open a hundred connections.

   Credentials come from the environment. On a deployed server
   .env files are never touched by a deploy, so the secrets there
   survive every release and rollback — see .env.example.
   ============================================================ */

import mysql from "mysql2/promise";

declare global {
  var __craftyPool: mysql.Pool | undefined;
}

function poolConfig(): mysql.PoolOptions {
  const base: mysql.PoolOptions = {
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    charset: "utf8mb4",
    // DATE columns come back as 'yyyy-mm-dd' strings rather than
    // Date objects, which is what the whole app works in.
    dateStrings: true,
    timezone: "local",
    supportBigNumbers: true,
  };

  if (process.env.DATABASE_URL) {
    return { ...base, uri: process.env.DATABASE_URL };
  }

  return {
    ...base,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crafty_central",
  };
}

export function pool(): mysql.Pool {
  if (!global.__craftyPool) global.__craftyPool = mysql.createPool(poolConfig());
  return global.__craftyPool;
}

/**
 * The database is older than the code running against it.
 *
 * This is what a deploy that skipped `npm run db:migrate` looks like
 * from the inside: the build is fine, the app starts, /api/health and
 * /api/version both answer — and then every query that touches a new
 * table or column fails. Left as a raw MySQL error it surfaced as
 * "Something went wrong on our end." on every screen, which says
 * nothing about the one command that fixes it.
 */
export class SchemaOutOfDate extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(
      "The database is behind this build. Run `npm run db:migrate` on the server " +
        "to bring it up to date, then reload.",
    );
    this.name = "SchemaOutOfDate";
    this.detail = detail;
  }
}

/** MySQL's two ways of saying "that is not in this database". */
const MISSING_SCHEMA = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"]);

function rethrow(err: unknown): never {
  const code = (err as { code?: string } | null)?.code;
  if (code && MISSING_SCHEMA.has(code)) {
    throw new SchemaOutOfDate((err as { sqlMessage?: string }).sqlMessage ?? String(err));
  }
  throw err;
}

/** SELECT returning rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  try {
    const [rows] = await pool().query(sql, params);
    return rows as T[];
  } catch (err) {
    rethrow(err);
  }
}

/** SELECT returning at most one row. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** A value a prepared statement will accept. */
export type SqlValue = string | number | boolean | null | Date | Buffer;

/** INSERT / UPDATE / DELETE. */
export async function execute(sql: string, params: SqlValue[] = []) {
  try {
    const [result] = await pool().execute(sql, params);
    return result as mysql.ResultSetHeader;
  } catch (err) {
    rethrow(err);
  }
}

/**
 * Run several statements as one transaction. Anything that touches
 * more than one table — saving a job with its days, crew and menu —
 * goes through here so a half-written job is impossible.
 */
export async function transaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    rethrow(err);
  } finally {
    conn.release();
  }
}

/**
 * A JS Date as MySQL's DATETIME sees it — server-local, to match
 * NOW(). Deliberately not toISOString(): that is UTC, and a UTC
 * string written into a DATETIME then compared against NOW() is
 * wrong by the server's offset, which in Toronto is four or five
 * hours. Every DATETIME this app writes goes through here.
 */
export function mysqlDateTime(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** 'yyyy-mm-dd hh:mm:ss' back to ISO 8601, for the client. */
export const isoDateTime = (s: string | null): string | null =>
  s ? new Date(s.replace(" ", "T")).toISOString() : null;

/** JSON columns come back parsed by mysql2, but be forgiving. */
export function jsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
