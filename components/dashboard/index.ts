/* ============================================================
   The widget registry: WidgetId → what renders it.

   Labels, hints, permissions and default sizes live with the
   rule in lib/domain (WIDGETS); this is only the client-side half
   — the component, and the count for the card header. Badge
   counts use the same domain helpers as the widgets themselves so
   the number on the header and the rows beneath it always agree.
   ============================================================ */

import { invoiceState, jobsOn, todayISO, unansweredRequests } from "@/lib/domain";
import type { WidgetId } from "@/lib/types";
import { upcomingJobs } from "./derive";
import { InvoicesWidget } from "./invoices-widget";
import { NotesWidget } from "./notes-widget";
import { RequestsWidget } from "./requests-widget";
import { StatsWidget } from "./stats-widget";
import { TimeOffWidget } from "./timeoff-widget";
import { TodayWidget } from "./today-widget";
import { UpcomingWidget } from "./upcoming-widget";
import { WorkloadWidget } from "./workload-widget";
import type { WidgetEntry } from "./widget";

export type { WidgetBadge, WidgetEntry, WidgetProps } from "./widget";

export const WIDGET_REGISTRY: Record<WidgetId, WidgetEntry> = {
  stats: { Body: StatsWidget },
  requests: {
    Body: RequestsWidget,
    badge: (ws) => ({ count: unansweredRequests(ws.inquiries).length, tone: "alert" }),
  },
  today: {
    Body: TodayWidget,
    badge: (ws) => ({ count: jobsOn(ws.jobs, todayISO()).length, tone: "neutral" }),
  },
  upcoming: {
    Body: UpcomingWidget,
    badge: (ws) => ({ count: upcomingJobs(ws.jobs).length, tone: "neutral" }),
  },
  invoices: {
    Body: InvoicesWidget,
    badge: (ws) => {
      const T = todayISO();
      const late = ws.invoices.filter((inv) => invoiceState(inv, T) === "overdue").length;
      return late ? { count: late, tone: "alert" } : null;
    },
  },
  timeoff: {
    Body: TimeOffWidget,
    badge: (ws) => ({
      count: ws.timeOff.filter((t) => t.status === "pending").length,
      tone: "neutral",
    }),
  },
  workload: { Body: WorkloadWidget },
  notes: { Body: NotesWidget },
};
