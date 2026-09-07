"use client";

/* ============================================================
   At a glance — the tile row.

   Shows the tiles in layout.stats, in that order. Every number
   comes from lib/domain (missing info, pipeline, invoice state,
   stale requests) so the tile can never disagree with the page it
   summarises. While customising, a chip row underneath lets the
   person tick tiles in and out; the order is the order they were
   ticked, capped at six because that is all a row can carry.
   ============================================================ */

import type { CSSProperties } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  invoiceState,
  invoiceTotal,
  isStaleRequest,
  jobSubtotal,
  missing,
  STALE_REQUEST_HOURS,
  STAT_TILES,
  statTilesFor,
  todayISO,
  unansweredRequests,
  MAX_STAT_TILES,
} from "@/lib/domain";
import { fmtMoney, statSizeClass } from "@/lib/format";
import type { Job, StatId, Workspace } from "@/lib/types";
import { coversThisWeek, jobsThisWeek, upcomingJobs } from "./derive";
import type { WidgetProps } from "./widget";

/** The row cannot carry more than this; normalizeDashboard caps it too. */

/* The stagger animation reads --i off each child. */
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

interface Tile {
  label: string;
  value: string | number;
  unit?: string;
  sub: string;
  subClass?: string;
  tint?: "olive" | "clay";
}

/** Money on a tile reads better without the cents. */
const whole = (n: number) => fmtMoney(n).replace(/\.00$/, "");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function tileFor(id: StatId, ws: Workspace, jobOf: (id: string) => Job | undefined): Tile {
  const T = todayISO();
  const label = STAT_TILES.find((s) => s.id === id)?.label ?? id;

  switch (id) {
    case "jobsWeek": {
      const week = jobsThisWeek(ws.jobs, T).length;
      return { label, value: week, sub: `${upcomingJobs(ws.jobs, T).length} upcoming total` };
    }
    case "covers": {
      const { covers, days } = coversThisWeek(ws.jobs, T);
      return {
        label,
        value: covers,
        unit: "covers",
        sub: days ? `across ${plural(days, "shoot day")}` : "no shoot days this week",
        tint: "olive",
      };
    }
    case "attention": {
      const n = upcomingJobs(ws.jobs, T).filter((j) => missing(j).length > 0).length;
      return {
        label,
        value: n,
        sub: n ? "jobs with missing info" : "every upcoming job is ready",
        tint: n ? "clay" : undefined,
      };
    }
    case "requests": {
      const open = unansweredRequests(ws.inquiries);
      const stale = open.filter((q) => isStaleRequest(q, ws.now)).length;
      return {
        label,
        value: open.length,
        sub: stale
          ? `${stale} waiting over ${STALE_REQUEST_HOURS}h`
          : open.length
            ? `all under ${STALE_REQUEST_HOURS}h old`
            : "inbox zero",
        tint: stale ? "clay" : undefined,
      };
    }
    case "timeoff": {
      const n = ws.timeOff.filter((t) => t.status === "pending").length;
      return { label, value: n, sub: n ? "awaiting review" : "nothing waiting" };
    }
    case "pipeline": {
      const sum = ws.jobs
        .filter((j) => j.status === "estimate" || j.status === "confirmed")
        .reduce((s, j) => s + jobSubtotal(j, ws.settings), 0);
      return { label, value: whole(sum), sub: "estimates + confirmed", subClass: "up" };
    }
    case "outstanding": {
      const open = ws.invoices.filter((inv) => {
        const s = invoiceState(inv, T);
        return s === "sent" || s === "overdue";
      });
      const total = open.reduce((s, inv) => s + invoiceTotal(inv, jobOf(inv.jobId), ws.settings), 0);
      return { label, value: whole(total), sub: `${open.length} unpaid` };
    }
    case "overdue": {
      const late = ws.invoices.filter((inv) => invoiceState(inv, T) === "overdue");
      const total = late.reduce((s, inv) => s + invoiceTotal(inv, jobOf(inv.jobId), ws.settings), 0);
      return {
        label,
        value: late.length,
        sub: late.length ? `${fmtMoney(total)} past due` : "nothing past due",
        tint: late.length ? "clay" : undefined,
      };
    }
  }
}

export function StatsWidget({ layout, editing, onLayout }: WidgetProps) {
  const { ws, job } = useWorkspace();
  const allowed = statTilesFor(ws.me.role);
  const tiles = layout.stats.filter((id) => allowed.some((t) => t.id === id));

  /* A half-width row has room for two across, not six. */
  const size = layout.widgets.find((w) => w.id === "stats")?.size ?? "full";
  const cols = Math.max(1, size === "half" ? Math.min(tiles.length, 2) : tiles.length);

  function toggle(id: StatId) {
    if (!onLayout) return;
    const on = layout.stats.includes(id);
    const stats = on ? layout.stats.filter((s) => s !== id) : [...layout.stats, id];
    if (!on && stats.length > MAX_STAT_TILES) return;
    onLayout({ ...layout, stats });
  }

  return (
    <>
      {tiles.length ? (
        <div className="stat-row stagger dash-stat-row" style={{ "--n": cols } as CSSProperties}>
          {tiles.map((id, i) => {
            const t = tileFor(id, ws, job);
            return (
              <div
                key={id}
                className={`stat-cell ${t.tint ? `tint-${t.tint}` : ""}`.trim()}
                style={stagger(i)}
              >
                <div className="stat-label">{t.label}</div>
                <div className={`stat-value ${statSizeClass(t.value)}`.trim()}>
                  {t.value}
                  {t.unit && <span className="unit">{t.unit}</span>}
                </div>
                <div className={`stat-sub ${t.subClass ?? ""}`.trim()}>{t.sub}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="dash-muted">No tiles chosen — tick some below.</p>
      )}

      {editing && onLayout && (
        <div className="stat-pick dw-live">
          <div className="stat-pick-head">
            <span>Tiles</span>
            <span className="section-hint">
              Up to {MAX_STAT_TILES}, shown in the order you tick them · {layout.stats.length}/{MAX_STAT_TILES}
            </span>
          </div>
          <div className="tag-check-row">
            {allowed.map((t) => {
              const on = layout.stats.includes(t.id);
              const full = !on && layout.stats.length >= MAX_STAT_TILES;
              return (
                <label key={t.id} className={`tag-check ${full ? "is-off" : ""}`.trim()}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={full}
                    onChange={() => toggle(t.id)}
                    aria-label={`${on ? "Hide" : "Show"} ${t.label} tile`}
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
