"use client";

/* ============================================================
   Crafty Central — Calendar (the central hub)
   Month grid; jobs land on their shoot days; click a job to
   open the side panel with missing-info dropdowns on top.
   ============================================================ */

import { useState } from "react";
import { crewFor, iso, menuFor, missing, todayISO } from "@/lib/domain";
import { firstName } from "@/lib/format";
import { Icon } from "@/components/icons";
import { JobForm } from "@/components/job-form";
import { useWorkspace } from "@/components/workspace-provider";

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Chips past this many are collapsed into a "+n more" button. */
const CAP = 3;

export default function CalendarView() {
  const { ws, can, person, panel, openJobPanel, openDayPanel, openModal } = useWorkspace();

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const first = new Date(cursor.y, cursor.m, 1);
  const label = first.toLocaleDateString("en-CA", { month: "long" });
  const T = todayISO();
  const jobs = ws.jobs;
  const timeOff = ws.timeOff.filter((t) => t.status === "approved");
  const canSeeTO = can("approveTimeOff");

  // grid: start Sunday
  const startOffset = first.getDay();
  const gridStart = new Date(cursor.y, cursor.m, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  // trim trailing empty week
  const lastWeekHasMonth = cells.slice(35).some((d) => d.getMonth() === cursor.m);
  const shown = lastWeekHasMonth ? cells : cells.slice(0, 35);

  const shift = (n: number) =>
    setCursor((c) => {
      let { y, m } = c;
      m += n;
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

  const today = () => {
    const now = new Date();
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
  };

  return (
    <div className="view-enter cal-shell">
      <div className="cal-head">
        <div className="cal-month">
          {label} <span className="yr">{cursor.y}</span>
        </div>
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <Icon name="chevLeft" />
          </button>
          <button className="btn sm" onClick={today}>
            Today
          </button>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <Icon name="chevRight" />
          </button>
          {can("createJob") && (
            <button
              className="btn primary"
              style={{ marginLeft: 8 }}
              onClick={() => openModal(<JobForm />)}
            >
              <Icon name="plus" /> New job
            </button>
          )}
        </div>
      </div>

      {/* The dow headers and the cells are flat siblings of .cal-grid —
          .cal-cell:nth-child(7n) counts on the seven headers coming first. */}
      <div className="cal-grid">
        {DOWS.map((d) => (
          <div className="cal-dow" key={d}>
            {d}
          </div>
        ))}
        {shown.map((d) => {
          const dISO = iso(d);
          const other = d.getMonth() !== cursor.m;
          const dayJobs = jobs.filter((j) => j.shootDays.includes(dISO));
          const dayTO = canSeeTO ? timeOff.filter((t) => dISO >= t.start && dISO <= t.end) : [];

          const jobChips = dayJobs.map((j) => {
            const dayNum = j.shootDays.indexOf(dISO) + 1;
            const multi = j.shootDays.length > 1;
            const dayNeeds =
              missing(j).some((m) => m !== "menu" && m !== "crew") ||
              !menuFor(j, dISO).length ||
              !crewFor(j, dISO).length;
            return (
              <button
                key={j.id}
                className={`cal-job ${j.status}${panel.jobId === j.id ? " selected" : ""}`}
                data-job={j.id}
                data-date={dISO}
                title={`${j.productionName}${multi ? ` — Day ${dayNum} of ${j.shootDays.length}` : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  openJobPanel(j.id, dISO);
                }}
              >
                {dayNeeds && <span className="cj-miss" />}
                {multi && (
                  <span className="cj-daynum">
                    {dayNum}/{j.shootDays.length}
                  </span>
                )}
                {j.productionName}
              </button>
            );
          });

          const toChips = dayTO.map((t) => {
            const p = person(t.personId);
            if (!p) return null;
            return (
              <span className="cal-job timeoff" key={t.id} title={`${p.name} — time off`}>
                {firstName(p.name)} off
              </span>
            );
          });

          const chips = [...jobChips, ...toChips].filter((c) => c !== null);
          const shownChips = chips.slice(0, CAP);
          const extra = chips.length - shownChips.length;

          return (
            <div
              className={`cal-cell ${other ? "other" : ""} ${dISO === T ? "today" : ""}`}
              data-day={dISO}
              key={dISO}
              onClick={() => openDayPanel(dISO)}
            >
              <span className="c-num">{d.getDate()}</span>
              {shownChips}
              {extra > 0 && (
                <button
                  className="cal-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDayPanel(dISO);
                  }}
                >
                  +{extra}<span className="cm-word"> more</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="lg-item">
          <span className="lg-swatch" style={{ background: "var(--accent)" }} />
          Confirmed
        </span>
        <span className="lg-item">
          <span className="lg-swatch" style={{ background: "var(--amber)" }} />
          Hold
        </span>
        <span className="lg-item">
          <span className="lg-swatch" style={{ background: "var(--blue)" }} />
          Wrapped
        </span>
        {canSeeTO && (
          <span className="lg-item">
            <span className="lg-swatch" style={{ background: "var(--ink-3)" }} />
            Approved time off
          </span>
        )}
        <span className="lg-item">
          <span className="cj-miss" style={{ position: "static", display: "inline-block" }} />
          Missing info
        </span>
      </div>
    </div>
  );
}
