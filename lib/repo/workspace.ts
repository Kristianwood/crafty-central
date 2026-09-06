/* ============================================================
   Crafty Central — the workspace payload

   One query per screenful was never how this app worked: the old
   client held everything and re-rendered from it. That is kept,
   with one difference that matters — the filtering now happens on
   the server. Crew get only the jobs they are booked on, and the
   money never leaves the building unless an admin asked for it.

   This is what the client polls.
   ============================================================ */

import { can } from "../domain";
import type { Person, Workspace } from "../types";
import { listJobs } from "./jobs";
import { myNotifications } from "./notifications";
import { unreadChannels } from "./chat";
import { listPeople } from "./people";
import {
  getSettings,
  listCompanies,
  listInquiries,
  listInvoices,
  listMenus,
  listSetCrew,
  listTimeOff,
} from "./misc";
import { visibleJobs } from "../domain";

export async function loadWorkspace(me: Person): Promise<Workspace> {
  const seesMoney = can(me.role, "finances");
  const seesEveryone = can(me.role, "seeAllJobs");

  const [
    people,
    allJobs,
    companies,
    menus,
    setCrew,
    inquiries,
    invoices,
    timeOff,
    notifications,
    settings,
    unread,
  ] = await Promise.all([
    listPeople(),
    listJobs(),
    seesMoney ? listCompanies() : Promise.resolve([]),
    listMenus(),
    listSetCrew(),
    seesEveryone ? listInquiries() : Promise.resolve([]),
    seesMoney ? listInvoices() : Promise.resolve([]),
    listTimeOff(),
    myNotifications(me.id, me.role),
    getSettings(),
    unreadChannels(me.id),
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
    // Crew see only their own requests; anyone who can approve sees all.
    timeOff: can(me.role, "approveTimeOff")
      ? timeOff
      : timeOff.filter((t) => t.personId === me.id),
    notifications,
    unreadChannels: unread,
    settings,
  };
}
