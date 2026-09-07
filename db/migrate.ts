/* ============================================================
   Crafty Central — schema migration

   Creates the database if it is not there, applies db/schema.sql,
   then brings an older database up to date with the patches
   below. Every step is idempotent — schema.sql is all CREATE TABLE
   IF NOT EXISTS, and each patch checks information_schema before
   it touches anything — so running this twice is harmless.

     npm run db:migrate

   Reads .env if present — see .env.example.

   Adding a column to an existing table? Put it in schema.sql (for
   fresh databases) AND add a patch here (for the ones already
   running). MySQL 8 has no ADD COLUMN IF NOT EXISTS, hence the
   explicit checks.
   ============================================================ */

import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

function config() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
    };
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "crafty_central",
  };
}

interface Patch {
  name: string;
  /** Resolves true when the patch has already been applied. */
  applied: (db: mysql.Connection, schema: string) => Promise<boolean>;
  apply: string;
}

async function columnExists(
  db: mysql.Connection,
  schema: string,
  table: string,
  column: string,
): Promise<boolean> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [schema, table, column],
  );
  return rows.length > 0;
}

async function columnTypeIncludes(
  db: mysql.Connection,
  schema: string,
  table: string,
  column: string,
  needle: string,
): Promise<boolean> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [schema, table, column],
  );
  return rows.length > 0 && String(rows[0].COLUMN_TYPE).includes(needle);
}

async function indexExists(
  db: mysql.Connection,
  schema: string,
  table: string,
  index: string,
): Promise<boolean> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [schema, table, index],
  );
  return rows.length > 0;
}

const addColumn = (table: string, column: string, ddl: string): Patch => ({
  name: `${table}.${column}`,
  applied: (db, s) => columnExists(db, s, table, column),
  apply: `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`,
});

/* ---- 1.2 ---- */
const PATCHES: Patch[] = [
  {
    name: "people.role includes owner",
    applied: (db, s) => columnTypeIncludes(db, s, "people", "role", "'owner'"),
    apply: `ALTER TABLE people MODIFY role ENUM('owner','admin','moderator','crew') NOT NULL DEFAULT 'crew'`,
  },
  addColumn("inquiries", "reminded_at", "DATETIME NULL"),
  addColumn("invoices", "notes", "VARCHAR(2000) NOT NULL DEFAULT ''"),
  addColumn("invoices", "sent_at", "DATETIME NULL"),
  addColumn("invoices", "paid_at", "DATETIME NULL"),
  addColumn("invoices", "bill_to_name", "VARCHAR(190) NOT NULL DEFAULT ''"),
  addColumn("invoices", "bill_to_address", "VARCHAR(500) NOT NULL DEFAULT ''"),
  addColumn("invoices", "bill_to_email", "VARCHAR(190) NOT NULL DEFAULT ''"),
  addColumn("invoices", "attn", "VARCHAR(255) NOT NULL DEFAULT ''"),
  {
    name: "invoices idx_invoices_status",
    applied: (db, s) => indexExists(db, s, "invoices", "idx_invoices_status"),
    apply: `ALTER TABLE invoices ADD KEY idx_invoices_status (status, due_on)`,
  },
  {
    // Invoices already marked sent/paid before the timestamps existed
    // get their issue date as the best available "sent" time, so the
    // tracking view has something honest to show.
    name: "invoices backfill sent_at/paid_at",
    applied: async (db) => {
      const [rows] = await db.query<mysql.RowDataPacket[]>(
        `SELECT 1 FROM invoices WHERE (status = 'sent' AND sent_at IS NULL)
            OR (status = 'paid' AND paid_at IS NULL) LIMIT 1`,
      );
      return rows.length === 0;
    },
    apply: `UPDATE invoices
               SET sent_at = COALESCE(sent_at, CAST(issued_on AS DATETIME)),
                   paid_at = CASE WHEN status = 'paid' THEN COALESCE(paid_at, CAST(issued_on AS DATETIME)) ELSE paid_at END
             WHERE status IN ('sent','paid')`,
  },
];

async function main() {
  const c = config();
  if (!c.database) throw new Error("No database name — set DB_NAME or DATABASE_URL.");

  const server = await mysql.createConnection({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    multipleStatements: true,
  });

  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${c.database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await server.changeUser({ database: c.database });

  const sql = await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await server.query(sql);

  let patched = 0;
  for (const p of PATCHES) {
    if (await p.applied(server, c.database)) continue;
    await server.query(p.apply);
    patched++;
    console.log(`  patched: ${p.name}`);
  }

  const [tables] = await server.query<mysql.RowDataPacket[]>("SHOW TABLES");
  await server.end();

  console.log(`Schema applied to ${c.database} on ${c.host}:${c.port}.`);
  console.log(`${tables.length} tables: ${tables.map((t) => Object.values(t)[0]).join(", ")}`);
  console.log(patched ? `${patched} patch${patched === 1 ? "" : "es"} applied.` : "Already up to date.");
  console.log("\nNext: npm run db:seed (fresh database) or npm run db:owner -- <email> (give someone the owner seat)");
}

main().catch((err) => {
  console.error("\nMigration failed.\n");
  console.error(err instanceof Error ? err.message : err);
  console.error("\nCheck the DB_* values in .env (see .env.example).");
  process.exit(1);
});
