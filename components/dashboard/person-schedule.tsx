"use client";

/* ============================================================
   One person's schedule, in the modal — opened from the crew
   workload widget.

   The list/calendar toggle is component state, which matches the
   old behaviour: the module-level `schedView` was reset to 'list'
   every time the modal was opened anyway.
   ============================================================ */

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { useWorkspace } from "@/components/workspace-provider";
import { crewFor, iso, personBookedDays, personJobs, personUpcomingDays, todayISO } from "@/lib/domain";
import { fmtRange, fmtTime12 } from "@/lib/format";
import type { Job, Person } from "@/lib/types";

export function PersonSchedule({ person: p }: { person: Person }) {
  const { ws, closeModal } = useWorkspace();
  const [view, setView] = useState<"list" | "cal">("list");
  const days = personUpcomingDays(ws.jobs, p.id);

  return (
    <>
      <div className="modal-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar person={p} size="lg" />
          <div>
            <div className="modal-title">{p.name}</div>
            <div className="modal-sub">
              {p.position} · {(p.tags || []).join(", ")} ·{" "}
              <span style={{ fontFamily: "var(--mono)" }}>{days}</span> upcoming day
              {days === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <button type="button" className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <div className="seg-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "list"}
          className={`seg ${view === "list" ? "active" : ""}`.trim()}
          onClick={() => setView("list")}
        >
          <Icon name="note" /> List
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "cal"}
          className={`seg ${view === "cal" ? "active" : ""}`.trim()}
          onClick={() => setView("cal")}
        >
          <Icon name="calendar" /> Calendar
        </button>
      </div>

      <div>{view === "list" ? <SchedList person={p} /> : <SchedCalendar person={p} />}</div>
    </>
  );
}

function SchedList({ person: p }: { person: Person }) {
  const { ws, closeModal, openJobPanel } = useWorkspace();
  const T = todayISO();
  const jobs = personJobs(ws.jobs, p.id);

  /* Only the days this person is actually on — a job can run
     longer than their booking. */
  const pDays = (j: Job) => j.shootDays.filter((d) => crewFor(j, d).some((c) => c.personId === p.id));
  const roleOn = (j: Job) => {
    for (const d of j.shootDays) {
      const hit = crewFor(j, d).find((c) => c.personId === p.id);
      if (hit) return hit.role;
    }
    return j.crew.find((c) => c.personId === p.id)?.role ?? "";
  };
  const lastOwnDay = (j: Job) => {
    const d = pDays(j);
    return d.length ? d[d.length - 1] : "";
  };

  const upcoming = jobs.filter((j) => lastOwnDay(j) >= T);
  const past = jobs.filter((j) => lastOwnDay(j) < T).reverse();
  const offs = ws.timeOff.filter((t) => t.personId === p.id && t.status === "approved" && t.end >= T);

  const row = (j: Job) => {
    const d = pDays(j);
    return (
      <div
        className="sched-mini-row"
        key={j.id}
        onClick={() => {
          closeModal();
          openJobPanel(j.id);
        }}
      >
        <span className="smr-dates">
          {fmtRange(
            d[0] || j.shootDays[0],
            d[d.length - 1] || j.shootDays[j.shootDays.length - 1],
          )}
        </span>
        <div className="smr-main">
          <span className="smr-name">{j.productionName}</span>
          <span className="smr-sub">
            Call {fmtTime12(j.callTime)} · {(j.location || "—").split(",")[0]}
          </span>
        </div>
        <span className="crew-role-tag">{roleOn(j)}</span>
        <StatusPill status={j.status} />
      </div>
    );
  };

  if (!upcoming.length && !past.length && !offs.length) {
    return (
      <Empty
        icon="schedule"
        title="Nothing booked"
        sub="Assign them to a job from the calendar to fill this in."
        style={{ marginTop: 14 }}
      />
    );
  }

  return (
    <>
      {offs.length > 0 && (
        <div className="sched-off-note">
          <Icon name="palm" /> Time off: {offs.map((t) => fmtRange(t.start, t.end)).join(" · ")}
        </div>
      )}
      {upcoming.length ? (
        upcoming.map(row)
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "14px 2px 6px" }}>
          Nothing upcoming.
        </p>
      )}
      {past.length > 0 && (
        <>
          <div className="sched-past-label">Past</div>
          {past.slice(0, 5).map(row)}
        </>
      )}
    </>
  );
}

function SchedCalendar({ person: p }: { person: Person }) {
  const { ws } = useWorkspace();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const shift = (n: number) =>
    setCursor((c) => {
      let m = c.m + n;
      let y = c.y;
      if (m < 0) {
        m = 11;
        y--;
      }
      if (m > 11) {
        m = 0;
        y++;
      }
      return { y, m };
    });

  const T = todayISO();
  const booked = personBookedDays(ws.jobs, p.id);
  const offs = ws.timeOff.filter((t) => t.personId === p.id && t.status === "approved");
  const isOff = (d: string) => offs.some((t) => d >= t.start && d <= t.end);

  const first = new Date(cursor.y, cursor.m, 1);
  const label = first.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
  const gridStart = new Date(cursor.y, cursor.m, 1 - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  /* Drop the sixth week unless the month actually reaches into it. */
  const shown = cells.slice(35).some((d) => d.getMonth() === cursor.m) ? cells : cells.slice(0, 35);

  return (
    <>
      <div className="mini-cal-head">
        <span className="mini-cal-label">{label}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous month"
            style={{ width: 28, height: 28 }}
            onClick={() => shift(-1)}
          >
            <Icon name="chevLeft" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next month"
            style={{ width: 28, height: 28 }}
            onClick={() => shift(1)}
          >
            <Icon name="chevRight" />
          </button>
        </span>
      </div>
      <div className="mini-cal">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span className="mc-dow" key={i}>
            {d}
          </span>
        ))}
        {shown.map((d) => {
          const dISO = iso(d);
          const j = booked[dISO];
          const off = isOff(dISO);
          const cls = [
            "mc-day",
            d.getMonth() !== cursor.m ? "other" : "",
            dISO === T ? "today" : "",
            j ? "booked" : "",
            off ? "off" : "",
          ].join(" ");
          const title = j ? j.productionName : off ? "Time off" : "";
          return (
            <span className={cls} key={dISO} title={title || undefined}>
              {d.getDate()}
            </span>
          );
        })}
      </div>
      <div className="cal-legend" style={{ marginTop: 10 }}>
        <span className="lg-item">
          <span className="lg-swatch" style={{ background: "var(--accent)" }} />
          Booked
        </span>
        <span className="lg-item">
          <span className="lg-swatch" style={{ background: "var(--ink-3)" }} />
          Time off
        </span>
      </div>
    </>
  );
}
