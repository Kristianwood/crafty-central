/* ============================================================
   Crafty Central — demo data

     npm run db:seed              # only if the database is empty
     npm run db:seed -- --force   # wipe and reload
     npm run db:seed -- --password=letmein
         also give every seeded person that password, for poking
         around in development. Without it nobody has a password
         and each person claims their account by signing up with
         the email address below — which is how it works in real
         life, and keeps a seeded database from shipping with a
         known login.
   ============================================================ */

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

/* ---------- dates, relative to the day you seed ---------- */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const T = iso(new Date());
const addDays = (isoStr: string, n: number) => {
  const d = new Date(isoStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
};
const now = Date.now();
const hrs = (n: number) => now - n * 3600 * 1000;
const dt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/* ---------- the crew ---------- */

const people = [
  ["p-mar", "Marisol Quintero", "owner", "Owner / Operator", ["Key"], "+1 (416) 508-2247", "marisol@craftyto.ca", []],
  ["p-dar", "Dario Pellegrini", "admin", "Operations Lead", ["Key", "Driver"], "+1 (647) 331-9084", "dario@craftyto.ca", ["Lactose intolerant"]],
  ["p-kei", "Keisha Alleyne", "moderator", "Truck Captain", ["Key", "Chef"], "+1 (416) 772-4415", "keisha@craftyto.ca", []],
  ["p-tam", "Tam Nguyen-Brooks", "crew", "Craft Service", ["Assist"], "+1 (647) 906-1152", "tam@craftyto.ca", ["Vegetarian"]],
  ["p-roc", "Rocco Fiorito", "crew", "Grill / Prep", ["Chef"], "+1 (416) 285-7730", "rocco@craftyto.ca", []],
  ["p-pri", "Priya Ramanathan", "crew", "Craft Service", ["Assist"], "+1 (905) 467-3318", "priya@craftyto.ca", ["Vegan"]],
  ["p-jun", "Junie St-Amour", "crew", "Barista / FOH", ["Assist", "Chef"], "+1 (438) 224-6907", "junie@craftyto.ca", ["Gluten-free"]],
  ["p-ola", "Oladele Akintola", "crew", "Driver / Setup", ["Driver"], "+1 (647) 553-2189", "ola@craftyto.ca", ["Halal"]],
  ["p-sas", "Saskia Vandermeer", "crew", "Prep Cook", ["Chef", "Assist"], "+1 (416) 940-8823", "saskia@craftyto.ca", ["Shellfish allergy (severe)"]],
] as const;

/* ---------- jobs ----------
   crew/menu given per day where the job overrides them; `null`
   for a day means "use the job default". */

interface SeedDay {
  date: string;
  callTime?: string;
  wrapTime?: string;
  headcount?: number;
  location?: string;
  notes?: string;
  crew?: { role: string; personId: string }[];
  menu?: string[];
}

interface SeedJob {
  id: string;
  productionName: string;
  productionCompany: string;
  agency: string;
  pm: string;
  producers: string;
  headcount: number;
  location: string;
  callTime: string;
  wrapTime: string;
  status: "estimate" | "confirmed" | "wrapped" | "invoiced";
  crew: { role: string; personId: string }[];
  menu: string[];
  perHead: number;
  truckDay: number;
  notes: string;
  createdAt: string;
  days: SeedDay[];
}

const jobs: SeedJob[] = [
  {
    id: "j-1",
    productionName: 'Maple & Rye "First Pour"',
    productionCompany: "Bellwoods Motion Co.",
    agency: "Open Kitchen Creative",
    pm: "Noor El-Amin",
    producers: "Catie Brankovic",
    headcount: 62,
    location: "Cherry Beach Studios, 33 Villiers St",
    callTime: "06:30",
    wrapTime: "19:00",
    status: "confirmed",
    crew: [
      { role: "Key", personId: "p-kei" },
      { role: "Chef", personId: "p-roc" },
      { role: "Assist", personId: "p-pri" },
    ],
    menu: ["Breakfast burritos", "Espresso bar", "Harvest bowls", "Afternoon snack table"],
    perHead: 34,
    truckDay: 850,
    notes:
      "Client is nut-free across the board. Talent trailer needs a separate tray at 07:00.",
    createdAt: addDays(T, -12),
    days: [
      { date: addDays(T, 1) },
      {
        date: addDays(T, 2),
        callTime: "08:30",
        headcount: 48,
        notes: "Company move to Studio B — smaller unit.",
        menu: [
          "Egg + cheddar sandwiches",
          "Espresso bar",
          "Studio B hot lunch",
          "Afternoon snack table",
        ],
        crew: [
          { role: "Key", personId: "p-kei" },
          { role: "Chef", personId: "p-sas" },
          { role: "Assist", personId: "p-pri" },
        ],
      },
    ],
  },
  {
    id: "j-2",
    productionName: "Northbound Athletics FW26",
    productionCompany: "Gooseneck Productions",
    agency: "",
    pm: "Theo Vandenberg",
    producers: "Marisa Okafor, Jules Petit",
    headcount: 38,
    location: "R.L. Hearn Generating Station, Unwin Ave",
    callTime: "05:45",
    wrapTime: "20:30",
    status: "confirmed",
    crew: [],
    menu: [],
    perHead: 31,
    truckDay: 850,
    notes: "Overnight pre-rig the day before. Power drop confirmed by locations.",
    createdAt: addDays(T, -6),
    days: [{ date: addDays(T, 5) }],
  },
  {
    id: "j-3",
    productionName: 'Caisse Populaire "Kitchen Table"',
    productionCompany: "Harbourlight Pictures",
    agency: "Fjord & Field",
    pm: "",
    producers: "Hannah Liu-Beaumont",
    headcount: 45,
    location: "Private residence, 128 Indian Rd, Roncesvalles",
    callTime: "07:00",
    wrapTime: "18:00",
    status: "estimate",
    crew: [],
    menu: [],
    perHead: 33,
    truckDay: 850,
    notes: "Residential street — quiet load-in before 07:00, no generators on the lawn.",
    createdAt: addDays(T, -3),
    days: [{ date: addDays(T, 8) }, { date: addDays(T, 9) }, { date: addDays(T, 10) }],
  },
  {
    id: "j-4",
    productionName: 'Streetcar Chocolate "Winter Batch"',
    productionCompany: "Bellwoods Motion Co.",
    agency: "",
    pm: "",
    producers: "",
    headcount: 27,
    location: "Revival 629, 629 Eastern Ave",
    callTime: "08:00",
    wrapTime: "17:30",
    status: "wrapped",
    crew: [
      { role: "Assist", personId: "p-tam" },
      { role: "Chef", personId: "p-jun" },
    ],
    menu: ["Soup + sandwich service", "Hot chocolate bar"],
    perHead: 29,
    truckDay: 850,
    notes: "",
    createdAt: addDays(T, -21),
    days: [{ date: addDays(T, -7) }],
  },
  {
    id: "j-5",
    productionName: 'Ontario Tourism "Shoulder Season"',
    productionCompany: "Copperline Films",
    agency: "Fjord & Field",
    pm: "Dmitri Kovalenko",
    producers: "Fern Whitely",
    headcount: 84,
    location: "Scarborough Bluffs + company move to Kew Beach",
    callTime: "05:30",
    wrapTime: "21:00",
    status: "invoiced",
    crew: [
      { role: "Key", personId: "p-kei" },
      { role: "Chef", personId: "p-roc" },
      { role: "Assist", personId: "p-pri" },
      { role: "Driver", personId: "p-ola" },
      { role: "Chef", personId: "p-sas" },
    ],
    menu: ["Full breakfast", "BBQ lunch", "Substantials x2", "Coffee truck all day"],
    perHead: 36,
    truckDay: 950,
    notes: "Two-truck day. Company move at 13:00.",
    createdAt: addDays(T, -30),
    days: [{ date: addDays(T, -16) }, { date: addDays(T, -15) }],
  },
];

const companies = [
  ["co-bel", "Bellwoods Motion Co.", "214 Ossington Ave, 2nd Floor\nToronto ON M6J 2Z9", "Renata Iannucci", "ap@bellwoodsmotion.ca", "+1 (416) 604-2218"],
  ["co-goo", "Gooseneck Productions", "388 Carlaw Ave, Studio 210\nToronto ON M4M 2T4", "Wes Obuya", "accounting@gooseneck.tv", "+1 (647) 490-1163"],
  ["co-har", "Harbourlight Pictures", "67 Mowat Ave, Suite 431\nToronto ON M6K 3E3", "Solène Marchetti", "ap@harbourlight.ca", "+1 (416) 538-9902"],
  ["co-cop", "Copperline Films", "1235 Bay St, Suite 700\nToronto ON M5R 3K4", "Grover Lindqvist", "billing@copperlinefilms.com", "+1 (416) 921-4407"],
] as const;

const menus = [
  ["m-std", "Standard Shoot Day", ["Breakfast burritos", "Fresh fruit + yogurt bar", "Espresso + drip station", "Hot lunch — protein + two sides", "Afternoon substantials", "Snack table restock"]],
  ["m-early", "Early Call Breakfast", ["Egg + cheddar sandwiches", "Overnight oats", "Smoothie bar", "Espresso + drip station", "Late-morning pastry drop"]],
  ["m-wrap", "Wrap Party", ["Souvlaki + pita station", "Greek salad bowls", "Loukoumades", "Sparkling lemonade + iced coffee"]],
] as const;

const setCrew = [
  ["sc-1", "Wren Kalogeropoulos", "1st AD", ["Vegetarian"], "Prefers oat milk for coffee."],
  ["sc-2", "Bo Lindqvist-Osei", "Gaffer", ["Nut allergy"], "Severe — keep his plate clear of the snack table."],
  ["sc-3", "Camille Iwu", "Director", ["Gluten-free", "Dairy-free"], ""],
] as const;

/* ---------- catalogue & kits ----------
   The legend of products and services an invoice is built from,
   and one kit that bundles three of them. */

const catalog = [
  ["ci-espresso", "Espresso bar service", "service", "day", 275, "Barista, machine, milks and syrups for the day."],
  ["ci-smoothie", "Smoothie run", "service", "run", 180, "Mid-afternoon fresh smoothies for the whole crew."],
  ["ci-substantial", "Extra substantial", "product", "cover", 6.5, "One additional hot substantial per head."],
  ["ci-dinner", "Late-wrap dinner", "product", "cover", 19, "Hot dinner service when wrap runs past 8 PM."],
  ["ci-truck2", "Second truck", "service", "day", 650, "A second unit for company moves or split units."],
  ["ci-water", "Bottled water case", "product", "case", 14, "24 × 500 ml, delivered chilled."],
] as const;

const kits = [
  ["kit-golden", "Golden-hour add-on", "Espresso bar plus a smoothie run and an extra substantial for everyone.",
    [["ci-espresso", 1], ["ci-smoothie", 1], ["ci-substantial", 30]]],
  ["kit-latewrap", "Late-wrap package", "Dinner for the unit and a second truck for the move.",
    [["ci-dinner", 40], ["ci-truck2", 1], ["ci-water", 4]]],
] as const;

const fmtShort = (isoStr: string) =>
  new Date(isoStr + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const fmtRange = (a: string, b: string) =>
  a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`;

const timeOff = [
  ["to-1", "p-jun", addDays(T, 9), addDays(T, 11), "Family wedding in Gatineau", "pending", T],
  ["to-2", "p-roc", addDays(T, -2), addDays(T, -1), "Moving apartments", "approved", addDays(T, -9)],
] as const;

const messages = [
  ["msg-1", "company", "p-mar", "Big week ahead — Maple & Rye is now two days at Cherry Beach. Job sheet is on the calendar.", hrs(30)],
  ["msg-2", "company", "p-dar", "Truck B is back from the shop. Fridge compressor replaced, keep an eye on temps this week anyway.", hrs(7)],
  ["msg-3", "company", "p-kei", "Costco run tomorrow at 3 if anyone needs anything added to the list.", hrs(4)],
  ["msg-4", "dm:p-dar:p-tam", "p-tam", "Hey Dario, could I swap off the Friday job? Have a callback that morning.", hrs(5)],
  ["msg-5", "dm:p-dar:p-tam", "p-dar", "Should be fine — I will move Saskia in. Confirming by tonight.", hrs(4.5)],
] as const;

const notifications = [
  ["n-1", "moderator", `Junie St-Amour requested time off (${fmtRange(addDays(T, 9), addDays(T, 11))}).`, "palm", hrs(6)],
  ["n-2", "all", `Northbound Athletics FW26 confirmed for ${fmtShort(addDays(T, 5))} — crew still unassigned.`, "alert", hrs(20)],
] as const;

/* ---------- write it ---------- */

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

async function main() {
  const force = process.argv.includes("--force");
  const passArg = process.argv.find((a) => a.startsWith("--password="));
  const devPassword = passArg ? passArg.slice("--password=".length) : null;

  const conn = await mysql.createConnection({ ...config(), dateStrings: true });

  const [existing] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM people",
  );
  if (Number(existing[0].n) > 0 && !force) {
    console.log("Database already has people in it. Re-run with --force to wipe and reload.");
    await conn.end();
    return;
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES) await conn.query(`TRUNCATE TABLE \`${t}\``);
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");

  const hash = devPassword ? await bcrypt.hash(devPassword, 10) : null;
  for (const [id, name, role, position, tags, phone, email, dietary] of people) {
    await conn.execute(
      `INSERT INTO people (id, name, role, position, phone, email, tags, dietary, password_hash)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, name, role, position, phone, email, JSON.stringify(tags), JSON.stringify(dietary), hash],
    );
  }

  for (const [id, name, addr, contact, email, phone] of companies) {
    await conn.execute(
      `INSERT INTO companies (id, name, billing_address, contact_name, email, phone)
       VALUES (?,?,?,?,?,?)`,
      [id, name, addr, contact, email, phone],
    );
  }

  for (const [id, name, items] of menus) {
    await conn.execute("INSERT INTO menus (id, name) VALUES (?,?)", [id, name]);
    for (const [i, item] of items.entries()) {
      await conn.execute("INSERT INTO menu_items (menu_id, position, item) VALUES (?,?,?)", [
        id,
        i,
        item,
      ]);
    }
  }

  for (const [id, name, position, dietary, notes] of setCrew) {
    await conn.execute(
      "INSERT INTO set_crew (id, name, position, dietary, notes) VALUES (?,?,?,?,?)",
      [id, name, position, JSON.stringify(dietary), notes],
    );
  }

  for (const [id, name, kind, unit, price, description] of catalog) {
    await conn.execute(
      `INSERT INTO catalog_items (id, name, kind, unit, unit_price, description, is_active, position)
       VALUES (?,?,?,?,?,?,1,0)`,
      [id, name, kind, unit, price, description],
    );
  }

  for (const [id, name, description, items] of kits) {
    await conn.execute("INSERT INTO kits (id, name, description) VALUES (?,?,?)", [id, name, description]);
    for (const [i, [itemId, qty]] of items.entries()) {
      await conn.execute(
        "INSERT INTO kit_items (kit_id, catalog_item_id, qty, position) VALUES (?,?,?,?)",
        [id, itemId, qty, i],
      );
    }
  }

  for (const j of jobs) {
    await conn.execute(
      `INSERT INTO jobs (id, production_name, production_company, agency, pm, producers,
         headcount, location, call_time, wrap_time, status, notes, rate_per_head,
         rate_truck_day, is_sample, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [j.id, j.productionName, j.productionCompany, j.agency, j.pm, j.producers, j.headcount,
        j.location, j.callTime, j.wrapTime, j.status, j.notes, j.perHead, j.truckDay, j.createdAt],
    );

    for (const [i, d] of j.days.entries()) {
      await conn.execute(
        `INSERT INTO job_days (job_id, shoot_date, position, call_time, wrap_time,
           headcount, location, notes, has_crew_override, has_menu_override)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [j.id, d.date, i, d.callTime ?? null, d.wrapTime ?? null, d.headcount ?? null,
          d.location ?? null, d.notes ?? null, d.crew ? 1 : 0, d.menu ? 1 : 0],
      );
      if (d.crew) {
        for (const [k, c] of d.crew.entries()) {
          await conn.execute(
            "INSERT INTO job_crew (job_id, shoot_date, person_id, role, position) VALUES (?,?,?,?,?)",
            [j.id, d.date, c.personId, c.role, k],
          );
        }
      }
      if (d.menu) {
        for (const [k, item] of d.menu.entries()) {
          await conn.execute(
            "INSERT INTO job_menu_items (job_id, shoot_date, position, item) VALUES (?,?,?,?)",
            [j.id, d.date, k, item],
          );
        }
      }
    }

    for (const [k, c] of j.crew.entries()) {
      await conn.execute(
        "INSERT INTO job_crew (job_id, shoot_date, person_id, role, position) VALUES (?,NULL,?,?,?)",
        [j.id, c.personId, c.role, k],
      );
    }
    for (const [k, item] of j.menu.entries()) {
      await conn.execute(
        "INSERT INTO job_menu_items (job_id, shoot_date, position, item) VALUES (?,NULL,?,?)",
        [j.id, k, item],
      );
    }
  }

  await conn.execute(
    `INSERT INTO inquiries (id, company, pm, email, phone, int_ext, day_night, headcount,
       notes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ["inq-1", "Parkdale Pictures", "Sana Whitfield", "sana@parkdalepictures.ca",
      "+1 (416) 555-0139", "INT + EXT", "Day", 45,
      "Two-day spot near High Park, tight turnaround.", "new", dt(now)],
  );
  for (const d of [addDays(T, 12), addDays(T, 13)]) {
    await conn.execute("INSERT INTO inquiry_days (inquiry_id, shoot_date) VALUES (?,?)", ["inq-1", d]);
  }

  /* Invoices carry their own lines (the job's pricing at the time,
     plus whatever kit went on) and a bill-to snapshot. inv-1 is out
     and unpaid; inv-2 has been paid; inv-3 is a draft still being
     built — three of the four tracking states. */
  const covers = (j: SeedJob) => j.days.reduce((s, d) => s + (d.headcount ?? j.headcount), 0);
  const jobLines = (j: SeedJob) => [
    [`Full craft service — ${j.productionName}`, covers(j), "covers", j.perHead, null, null],
    ["Truck & crew day rate", j.days.length, "days", j.truckDay, null, null],
  ] as const;
  const co = (id: string) => companies.find((c) => c[0] === id)!;

  const invoices = [
    {
      id: "inv-1", job: jobs[4], number: "CR-2026-041", issued: addDays(T, -12), due: addDays(T, 18),
      status: "sent", sentAt: dt(now - 12 * 86400_000), paidAt: null, company: co("co-cop"),
      attn: "Dmitri Kovalenko (PM) · Fern Whitely",
      notes: "Two-truck day with a company move at 13:00. Thanks for having us out on the bluffs.",
      lines: [
        ...jobLines(jobs[4]),
        ["Second truck", 2, "day", 650, "ci-truck2", "kit-latewrap"],
        ["Late-wrap dinner", 84, "cover", 19, "ci-dinner", "kit-latewrap"],
      ],
    },
    {
      id: "inv-2", job: jobs[3], number: "CR-2026-042", issued: addDays(T, -4), due: addDays(T, 26),
      status: "paid", sentAt: dt(now - 4 * 86400_000), paidAt: dt(now - 1 * 86400_000), company: co("co-bel"),
      attn: "", notes: "", lines: [...jobLines(jobs[3])],
    },
  ];

  for (const inv of invoices) {
    await conn.execute(
      `INSERT INTO invoices (id, job_id, number, issued_on, due_on, status, tax_rate, notes,
         sent_at, paid_at, bill_to_name, bill_to_address, bill_to_email, attn)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [inv.id, inv.job.id, inv.number, inv.issued, inv.due, inv.status, 0.13, inv.notes,
        inv.sentAt, inv.paidAt, inv.company[1], inv.company[2], inv.company[4], inv.attn],
    );
    for (const [i, [description, qty, unit, price, itemId, kitId]] of inv.lines.entries()) {
      await conn.execute(
        `INSERT INTO invoice_lines (invoice_id, position, description, qty, unit, unit_price,
           catalog_item_id, kit_id) VALUES (?,?,?,?,?,?,?,?)`,
        [inv.id, i, description, qty, unit, price, itemId, kitId],
      );
    }
  }

  for (const [id, personId, start, end, reason, status, createdAt] of timeOff) {
    await conn.execute(
      `INSERT INTO time_off (id, person_id, start_date, end_date, reason, status, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, personId, start, end, reason, status, createdAt],
    );
  }

  for (const [id, channel, fromId, text, at] of messages) {
    await conn.execute(
      "INSERT INTO messages (id, channel, from_id, text, sent_at, deliver_at) VALUES (?,?,?,?,?,?)",
      [id, channel, fromId, text, at, at],
    );
  }

  for (const [id, audience, text, icon, at] of notifications) {
    await conn.execute(
      "INSERT INTO notifications (id, audience, text, icon, at) VALUES (?,?,?,?,?)",
      [id, audience, text, icon, at],
    );
  }

  await conn.query("INSERT IGNORE INTO settings (id) VALUES (1)");
  await conn.end();

  console.log(
    `Seeded ${people.length} people, ${jobs.length} jobs, ${companies.length} companies, ` +
      `${catalog.length} catalogue items, ${kits.length} kits, ${invoices.length} invoices.`,
  );
  if (devPassword) {
    console.log(`\nEvery seeded person can sign in with the password: ${devPassword}`);
    console.log("Owner: marisol@craftyto.ca · Admin: dario@craftyto.ca");
    console.log("Do not do this on anything reachable from the internet.");
  } else {
    console.log("\nNobody has a password yet — that is deliberate.");
    console.log("Claim the owner account by signing up at /login with marisol@craftyto.ca;");
    console.log("the role and position already on file are kept.");
    console.log("For a throwaway dev database: npm run db:seed -- --force --password=letmein");
  }
}

main().catch((err) => {
  console.error("\nSeed failed.\n");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
