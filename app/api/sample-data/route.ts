/* ============================================================
   One-click sample data for a fresh workspace.

   Written through the same repository calls a real job uses, so
   what appears is indistinguishable from something typed in by
   hand — and deleting it is just deleting jobs. It shows off the
   parts of the app that are hard to notice on an empty screen: a
   fully-dressed confirmed job, an estimate with missing-info
   flags, and a wrapped job with an invoice behind it.
   ============================================================ */

import { bad, handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { addDays, todayISO, uid } from "@/lib/domain";
import { listJobs, newJobId, saveJob } from "@/lib/repo/jobs";
import { insertMessage } from "@/lib/repo/chat";
import { notify } from "@/lib/repo/notifications";
import {
  getSettings,
  invoiceCount,
  listCompanies,
  listMenus,
  saveCompany,
  saveInvoice,
  saveMenu,
} from "@/lib/repo/misc";
import { setJobStatus } from "@/lib/repo/jobs";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const me = await requirePermission("createJob");

    const existing = await listJobs();
    if (existing.some((j) => j.sample)) bad("The sample data is already here.", 409);

    const T = todayISO();
    const settings = await getSettings();

    if (!(await listMenus()).length) {
      await saveMenu({
        name: "Standard Shoot Day",
        items: [
          "Breakfast burritos",
          "Fresh fruit + yogurt bar",
          "Espresso + drip station",
          "Hot lunch — protein + two sides",
          "Afternoon substantials",
        ],
      });
    }

    const companies = await listCompanies();
    if (!companies.some((c) => c.name === "Bluewater Films")) {
      await saveCompany({
        name: "Bluewater Films",
        billingAddress: "55 Commissioners St, Unit 12\nToronto ON M5A 1A6",
        contactName: "Ines Delacroix-Ma",
        email: "ap@bluewaterfilms.ca",
        phone: "+1 (416) 555-0182",
      });
    }

    /* 1. A confirmed job with everything filled in — you are on it,
          and day two has its own menu, which is the per-day feature
          nobody finds on their own. */
    await saveJob({
      id: newJobId(),
      sample: true,
      productionName: 'Sunhaus Patio "Golden Hour"',
      productionCompany: "Bluewater Films",
      agency: "Wide Angle Creative",
      pm: "Petra Solberg",
      producers: "Malik Okonjo, Dree Vanterpool",
      headcount: 54,
      location: "Polson Pier, 11 Polson St",
      shootDays: [addDays(T, 1), addDays(T, 2)],
      callTime: "06:00",
      wrapTime: "19:30",
      status: "confirmed",
      crew: [{ role: "Key", personId: me.id }],
      menu: ["Breakfast burritos", "Espresso bar", "Taco lunch", "Afternoon snack table"],
      dayInfo: {
        [addDays(T, 2)]: {
          menu: [
            "Overnight oats + fruit",
            "Espresso bar",
            "Souvlaki lunch",
            "Wrap-day treat table",
          ],
          notes: "Day 2 menu is different — that is the per-day menus feature.",
        },
      },
      rates: { perHead: 34, truckDay: 850 },
      notes: "Sample job — delete anytime. Client is nut-free; smoothie run at 3 PM.",
      createdAt: T,
    });

    /* 2. An estimate with gaps, so the red missing-info flags and
          the auto-pricing have something to point at. */
    await saveJob({
      id: newJobId(),
      sample: true,
      productionName: 'Lakeshore Credit Union "First Home"',
      productionCompany: "Bluewater Films",
      agency: "",
      pm: "",
      producers: "Hannah Brightwater",
      headcount: 41,
      location: "Residential — Leslieville (TBC)",
      shootDays: [addDays(T, 7), addDays(T, 8)],
      callTime: "07:00",
      wrapTime: "18:00",
      status: "estimate",
      crew: [],
      menu: [],
      dayInfo: {},
      rates: { perHead: 33, truckDay: 850 },
      notes:
        "Sample estimate — open it on the calendar to see the missing-info dropdowns, " +
        "and check Finances for the auto-priced estimate.",
      createdAt: T,
    });

    /* 3. A wrapped job with an invoice, so Finances reads end to end. */
    const wrapped = await saveJob({
      id: newJobId(),
      sample: true,
      productionName: 'Aegean Yogurt "Blue Roofs"',
      productionCompany: "Bluewater Films",
      agency: "Wide Angle Creative",
      pm: "Petra Solberg",
      producers: "Malik Okonjo",
      headcount: 30,
      location: "Studio 7, 940 Lansdowne Ave",
      shootDays: [addDays(T, -6)],
      callTime: "08:00",
      wrapTime: "17:00",
      status: "wrapped",
      crew: [{ role: "Key", personId: me.id }],
      menu: ["Souvlaki lunch", "Iced coffee bar"],
      dayInfo: {},
      rates: { perHead: 31, truckDay: 850 },
      notes: "Sample wrapped job — its invoice is under Finances.",
      createdAt: T,
    });

    const n = (await invoiceCount()) + 41;
    await saveInvoice({
      id: "inv-" + uid(),
      jobId: wrapped.id,
      number: `CR-${T.slice(0, 4)}-0${n}`,
      issuedOn: T,
      dueOn: addDays(T, 30),
      status: "draft",
      taxRate: 0.13,
    });
    await setJobStatus(wrapped.id, "invoiced");

    const now = Date.now();
    await insertMessage({
      id: uid(),
      channel: "company",
      fromId: me.id,
      text:
        "Welcome to Crafty Central! This is the company-wide channel. Sample data is " +
        `loaded — poke around. Anything sent between ${settings.quietEnd % 12 || 12} PM and ` +
        `${settings.quietStart} AM waits until morning.`,
      sentAt: now,
      deliverAt: now,
    });

    await notify(
      "all",
      "Sample data loaded — three jobs, a company, and an invoice to explore.",
      "check",
    );

    return { ok: true };
  });
}
