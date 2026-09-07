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
  {
    /* An email is NULL when there isn't one, never ''. The column is
       unique, and MySQL counts every NULL as distinct — but two empty
       strings are a collision, which savePerson's upsert would settle
       by overwriting whoever got there first. Adding a second crew
       member with no email address used to erase the first. */
    name: "people.email nullable for the unnamed",
    applied: async (db, schema) => {
      const [rows] = await db.query<mysql.RowDataPacket[]>(
        `SELECT IS_NULLABLE FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'people' AND COLUMN_NAME = 'email'`,
        [schema],
      );
      return rows.length > 0 && rows[0].IS_NULLABLE === "YES";
    },
    apply: "ALTER TABLE people MODIFY email VARCHAR(190) NULL DEFAULT NULL",
  },
  {
    name: "people.email '' becomes NULL",
    applied: async (db) => {
      const [rows] = await db.query<mysql.RowDataPacket[]>(
        "SELECT 1 FROM people WHERE email = '' LIMIT 1",
      );
      return rows.length === 0;
    },
    apply: "UPDATE people SET email = NULL WHERE email = ''",
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
    /* Invoice numbers are minted by reading the ones already taken,
       which two requests can do at the same moment. The index is what
       actually stops a duplicate; nextInvoiceNumber() then retries.
       It is added only when the table is already clean — a database
       that somehow has duplicates should be looked at by a person
       rather than have the migration fail in front of them. */
    name: "invoices uq_invoices_number",
    applied: async (db, schema) => {
      if (await indexExists(db, schema, "invoices", "uq_invoices_number")) return true;
      const [dupes] = await db.query<mysql.RowDataPacket[]>(
        "SELECT number, COUNT(*) n FROM invoices GROUP BY number HAVING n > 1",
      );
      if (dupes.length) {
        console.log(
          `  skipped: invoices.number is not unique yet (${dupes
            .map((d) => d.number)
            .join(", ")}). Renumber those, then run this again.`,
        );
        return true;
      }
      return false;
    },
    apply: "ALTER TABLE invoices ADD UNIQUE KEY uq_invoices_number (number)",
  },
  {
    /* Freeze what pre-1.2 invoices charge.

       Before 1.2 an invoice had no lines: it was priced from its job
       every time anyone looked at it, so editing a wrapped job changed
       an invoice that had already gone out. The domain still falls
       back to that for an invoice with no lines, which keeps the value
       identical on the day of the upgrade — but leaving it there would
       leave every old invoice live-priced forever. So each one is
       given the two lines its job priced out to at this moment, and
       from here on it says what it said when it was sent.

       The maths is defaultInvoiceLines() in SQL: covers are summed per
       shoot day honouring the per-day headcount override, a job with
       no days counts as one day, and a NULL rate falls back to the
       settings row. */
    name: "invoice_lines backfill for pre-1.2 invoices",
    applied: async (db) => {
      const [rows] = await db.query<mysql.RowDataPacket[]>(
        `SELECT 1 FROM invoices i
          WHERE NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)
          LIMIT 1`,
      );
      return rows.length === 0;
    },
    apply: `INSERT INTO invoice_lines (invoice_id, position, description, qty, unit, unit_price)
            SELECT p.id, n.position,
                   CASE n.position
                     WHEN 0 THEN CONCAT('Full craft service — ', p.production_name)
                     ELSE 'Truck & crew day rate'
                   END,
                   CASE n.position WHEN 0 THEN p.covers ELSE p.days END,
                   CASE n.position WHEN 0 THEN 'covers' ELSE 'days' END,
                   CASE n.position WHEN 0 THEN p.per_head ELSE p.truck_day END
              FROM (
                SELECT i.id, j.production_name,
                       COALESCE((SELECT SUM(COALESCE(d.headcount, j.headcount))
                                   FROM job_days d WHERE d.job_id = j.id), 0) AS covers,
                       GREATEST((SELECT COUNT(*) FROM job_days d WHERE d.job_id = j.id), 1) AS days,
                       COALESCE(j.rate_per_head, s.per_head_default) AS per_head,
                       COALESCE(j.rate_truck_day, s.truck_day_default) AS truck_day
                  FROM invoices i
                  JOIN jobs j ON j.id = i.job_id
                  CROSS JOIN (SELECT per_head_default, truck_day_default FROM settings WHERE id = 1) s
                 WHERE NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)
              ) p
              CROSS JOIN (SELECT 0 AS position UNION ALL SELECT 1) n`,
  },
  {
    /* And the bill-to block, from the production company on file.
       Jobs name their company as free text, so it is matched the same
       trimmed, case-insensitive way findCompanyByName() does. An
       invoice whose company is not in the book keeps the job's name
       and an empty address, which is what the screen showed before. */
    name: "invoices bill-to snapshot backfill",
    applied: async (db) => {
      const [rows] = await db.query<mysql.RowDataPacket[]>(
        "SELECT 1 FROM invoices WHERE bill_to_name = '' LIMIT 1",
      );
      return rows.length === 0;
    },
    apply: `UPDATE invoices i
              JOIN jobs j ON j.id = i.job_id
              LEFT JOIN companies c
                ON LOWER(TRIM(c.name)) = LOWER(TRIM(j.production_company))
               SET i.bill_to_name = COALESCE(NULLIF(c.name, ''), j.production_company),
                   i.bill_to_address = COALESCE(c.billing_address, ''),
                   i.bill_to_email = COALESCE(c.email, ''),
                   i.attn = TRIM(BOTH ' · ' FROM CONCAT_WS(' · ',
                              NULLIF(CONCAT(j.pm, CASE WHEN j.pm <> '' THEN ' (PM)' ELSE '' END), ''),
                              NULLIF(j.producers, '')))
             WHERE i.bill_to_name = ''`,
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
    // The backfill writes an em dash into a description; say so.
    charset: "utf8mb4",
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
