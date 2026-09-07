/* ============================================================
   Crafty Central — the workspace payload

   One query per screenful was never how this app worked: the old
   client held everything and re-rendered from it. That is kept,
   with one difference that matters — the filtering now happens on
   the server. Crew get only the jobs they are booked on, and the
   money never leaves the building unless an admin asked for it.

   This is what the client polls.
   ============================================================ */

import { can, defaultDashboard, visibleJobs } from "../domain";
import type { Person, Workspace } from "../types";
import { listJobs } from "./jobs";
import { myNotifications } from "./notifications";
import { unreadChannels } from "./chat";
import { listPeople } from "./people";
import { listInvoices } from "./invoices";
import { listCatalog, listKits } from "./catalog";
import { getDashboard } from "./dashboard";
import {
  getSettings,
  listCompanies,
  listInquiries,
  listMenus,
  listSetCrew,
  listTimeOff,
  remindStaleRequests,
} from "./misc";

export async function loadWorkspace(me: Person): Promise<Workspace> {
  const seesMoney = can(me.role, "finances");
  const seesEveryone = can(me.role, "seeAllJobs");

  // The office is the audience for "still unanswered" reminders, so
  // their own poll is what sends them. Best-effort: a failure here
  // must never take the whole workspace down with it.
  if (seesEveryone) await remindStaleRequests().catch(() => 0);

  const [
    people,
    allJobs,
    companies,
    menus,
    setCrew,
    inquiries,
    invoices,
    catalog,
    kits,
    timeOff,
    notifications,
    settings,
    unread,
    dashboard,
  ] = await Promise.all([
    listPeople(),
    listJobs(),
    seesMoney ? listCompanies() : Promise.resolve([]),
    listMenus(),
    listSetCrew(),
    seesEveryone ? listInquiries() : Promise.resolve([]),
    seesMoney ? listInvoices() : Promise.resolve([]),
    seesMoney ? listCatalog() : Promise.resolve([]),
    seesMoney ? listKits() : Promise.resolve([]),
    listTimeOff(),
    myNotifications(me.id, me.role),
    getSettings(),
    unreadChannels(me.id),
    can(me.role, "customizeDashboard")
      ? getDashboard(me.id, me.role)
      : Promise.resolve(defaultDashboard(me.role)),
  ]);

  return {
    me,
    people,
    jobs: visibleJobs(allJobs, me),
    companies,
    menus,
    setCrew,
    inquiries,
    invoices,
    catalog,
    kits,
    // Crew see only their own requests; anyone who can approve sees all.
    timeOff: can(me.role, "approveTimeOff")
      ? timeOff
      : timeOff.filter((t) => t.personId === me.id),
    notifications,
    unreadChannels: unread,
    settings,
    dashboard,
    now: Date.now(),
  };
}
