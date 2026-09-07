/* ============================================================
   Crafty Central — hand someone the owner seat

     npm run db:owner -- taso@example.com

   The owner role holds every permission. There is normally one
   owner; this script does not demote anyone else, it only
   promotes the email you give it. The person must already be in
   the directory (add them there first, or have them sign up).

   The same thing can be done from the app: an owner can set any
   role from the Directory, and while no owner exists yet an admin
   may promote one person to owner from there too. This script is
   for the console, when nobody is signed in.
   ============================================================ */

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
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run db:owner -- <email>");
    process.exit(1);
  }

  const db = await mysql.createConnection(config());
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    "SELECT id, name, role FROM people WHERE LOWER(email) = ?",
    [email],
  );
  if (!rows.length) {
    console.error(`Nobody in the directory has the email ${email}. Add them there first.`);
    await db.end();
    process.exit(1);
  }

  const person = rows[0];
  if (person.role === "owner") {
    console.log(`${person.name} is already the owner.`);
  } else {
    await db.execute("UPDATE people SET role = 'owner' WHERE id = ?", [person.id]);
    console.log(`${person.name} is now the owner (was ${person.role}).`);
  }

  const [owners] = await db.query<mysql.RowDataPacket[]>(
    "SELECT name, email FROM people WHERE role = 'owner' ORDER BY name",
  );
  if (owners.length > 1) {
    console.log(`\nNote: there are now ${owners.length} owners:`);
    for (const o of owners) console.log(`  ${o.name} <${o.email}>`);
    console.log("Demote the others from the Directory if that is not intended.");
  }
  await db.end();
}

main().catch((err) => {
  console.error("\nCould not set the owner.\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
