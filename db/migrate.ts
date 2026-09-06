/* ============================================================
   Crafty Central — schema migration

   Creates the database if it is not there, then applies
   db/schema.sql. Every statement is CREATE TABLE IF NOT EXISTS,
   so running it twice is harmless.

     npm run db:migrate

   Reads .env.local if present — see .env.example.
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

  const [tables] = await server.query<mysql.RowDataPacket[]>("SHOW TABLES");
  await server.end();

  console.log(`Schema applied to ${c.database} on ${c.host}:${c.port}.`);
  console.log(`${tables.length} tables: ${tables.map((t) => Object.values(t)[0]).join(", ")}`);
  console.log("\nNext: npm run db:seed");
}

main().catch((err) => {
  console.error("\nMigration failed.\n");
  console.error(err instanceof Error ? err.message : err);
  console.error("\nCheck the DB_* values in .env.local (see .env.example).");
  process.exit(1);
});
