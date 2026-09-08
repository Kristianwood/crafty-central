/* ============================================================
   Crafty Central — clear the demo data and start fresh

     npm run db:fresh -- --keep you@yourdomain.com
     npm run db:fresh -- --keep you@yourdomain.com --yes

   Without --yes it only reports: what is in the database, who it
   would keep, and what it would delete. Nothing is touched. Run it
   that way first — the second form cannot be undone.

   What it keeps:
     - the one person you name with --keep, promoted to owner, with
       their password intact if they already have one
     - the settings row: quiet hours and the default per-head and
       truck-day rates are your configuration, not example data

   What it deletes: everything else. All other people, every job,
   company, menu, invoice, kit, catalogue item, message,
   notification, time-off record, booking request and saved
   dashboard. This is the same table list `db:seed --force` empties
   before it reloads the demo — this script simply does not reload
   anything afterwards.

   Take a copy first if the database has anything you would miss:

     mysqldump -u USER -p DBNAME > crafty-backup.sql
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

/* Child rows first, parents last. Same order db/seed.ts uses, and
   `settings` is deliberately not in it. */
const TABLES = [
  "notification_reads",
  "chat_reads",
  "notifications",
  "messages",
  "time_off",
  "dashboard_layouts",
  "kit_items",
  "kits",
  "catalog_items",
  "invoice_documents",
  "invoice_lines",
  "invoices",
  "inquiry_days",
  "inquiries",
  "set_crew",
  "menu_items",
  "menus",
  "job_menu_items",
  "job_crew",
  "job_days",
  "jobs",
  "companies",
  "sessions",
  "people",
];

/* The rows worth naming in the summary — the rest are attachments to
   these, and counting them all would bury the numbers that matter. */
const HEADLINE = ["people", "jobs", "companies", "menus", "invoices", "kits", "catalog_items"];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : null;
}

interface PersonRow extends mysql.RowDataPacket {
  id: string;
  name: string;
  role: string;
  position: string;
  phone: string;
  email: string | null;
  tags: string | null;
  dietary: string | null;
  password_hash: string | null;
}

async function main() {
  const email = (arg("keep") || "").trim().toLowerCase();
  const go = process.argv.includes("--yes");

  if (!email || !email.includes("@")) {
    console.error("Usage: npm run db:fresh -- --keep <your email> [--name \"Your Name\"] [--yes]");
    console.error("\nThe email is the account that survives and becomes the owner.");
    console.error("Leave off --yes to see what would happen without changing anything.");
    process.exit(1);
  }

  const c = config();
  const db = await mysql.createConnection({ ...c, dateStrings: true });

  const counts: [string, number][] = [];
  for (const t of HEADLINE) {
    const [rows] = await db.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
    counts.push([t, Number(rows[0].n)]);
  }

  const [found] = await db.query<PersonRow[]>(
    "SELECT * FROM people WHERE LOWER(email) = ?",
    [email],
  );
  const keeper = found[0] ?? null;
  const keptName = keeper?.name || arg("name") || email.split("@")[0];

  console.log(`\nDatabase ${c.database} on ${c.host}:${c.port}\n`);
  for (const [t, n] of counts) console.log(`  ${String(n).padStart(5)}  ${t}`);

  console.log(
    keeper
      ? `\nKeeping: ${keeper.name} <${email}> — currently ${keeper.role}, becomes owner.` +
          (keeper.password_hash
            ? " Their password still works."
            : " They have no password yet; they claim the account by signing up at /login with that address.")
      : `\nNobody in the directory has ${email}, so one is created: ` +
          `${keptName}, owner, no password. Claim it by signing up at /login with that address.`,
  );

  if (!go) {
    console.log("\nNothing was changed. Add --yes to actually clear it:");
    console.log(`  npm run db:fresh -- --keep ${email} --yes`);
    console.log("\nTake a copy first if you would miss any of the above:");
    console.log(`  mysqldump -u ${c.user} -p ${c.database} > crafty-backup.sql`);
    await db.end();
    return;
  }

  console.log("\nClearing…");
  await db.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES) await db.query(`TRUNCATE TABLE \`${t}\``);
  await db.query("SET FOREIGN_KEY_CHECKS = 1");

  await db.execute(
    `INSERT INTO people (id, name, role, position, phone, email, tags, dietary, password_hash)
     VALUES (?,?, 'owner', ?,?,?,?,?,?)`,
    [
      keeper?.id || "p-owner",
      keptName,
      keeper?.position || "Owner / Operator",
      keeper?.phone || "",
      email,
      keeper?.tags ?? "[]",
      keeper?.dietary ?? "[]",
      keeper?.password_hash ?? null,
    ],
  );

  /* Truncating settings is not in the list, but a database that never
     had the row (an older manual setup) still needs it. */
  await db.query("INSERT IGNORE INTO settings (id) VALUES (1)");

  const [after] = await db.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM people");
  await db.end();

  console.log(`\nDone. ${Number(after[0].n)} person in the directory: ${keptName}, owner.`);
  console.log("Everything else is gone. Sign in and start adding your own people and jobs.");
  console.log(
    keeper?.password_hash
      ? "\nYou were signed out everywhere — sign in again with your usual password."
      : `\nGo to /login and sign up with ${email} to claim the owner account.`,
  );
}

main().catch((err) => {
  console.error("\nReset failed — nothing partial should remain, but check the counts above.\n");
  console.error(err instanceof Error ? err.message : err);
  console.error("\nCheck the DB_* values in .env (see .env.example).");
  process.exit(1);
});
