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

/** SELECT returning rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const [rows] = await pool().query(sql, params);
  return rows as T[];
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
  const [result] = await pool().execute(sql, params);
  return result as mysql.ResultSetHeader;
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
    throw err;
  } finally {
    conn.release();
  }
}

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
