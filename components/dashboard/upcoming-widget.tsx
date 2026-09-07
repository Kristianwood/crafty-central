"use client";

/* ============================================================
   Upcoming jobs — the strip that used to be the whole dashboard.

   Same rows as before: a round date, the name with a "missing"
   chip when something is unfilled, the crew stack and the status.
   The empty state keeps its sample-data button: it is how a fresh
   install gets something to look at.
   ============================================================ */

import type { CSSProperties } from "react";
import { AvatarStack } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { JobForm } from "@/components/job-form";
import { StatusPill } from "@/components/status-pill";
import { useWorkspace } from "@/components/workspace-provider";
import { allCrewIds, missing, todayISO } from "@/lib/domain";
import type { Job } from "@/lib/types";
import { upcomingJobs } from "./derive";

/* The stagger animation reads --i off each child. */
const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

export function UpcomingWidget() {
  const { ws, can, mutate, toast, openModal, openJobPanel } = useWorkspace();
  const upcoming = upcomingJobs(ws.jobs, todayISO());

  /* Sample data seeds a company, a catalogue, a kit and an invoice
     as well as the jobs, so the route asks for the finances
     permission and the button follows it. */
  async function loadSample() {
    try {
      await mutate("/api/sample-data");
      toast("Sample data loaded — check the calendar and finances", "check");
    } catch {
      /* mutate has already toasted why. */
    }
  }

  return (
    <>
      <div className="dw-sub">
        <span className="section-hint">
          Click a job to open the full sheet — red dot means something is missing.
        </span>
        {can("createJob") && (
          <button type="button" className="btn sm primary" onClick={() => openModal(<JobForm />)}>
            <Icon name="plus" /> New job
          </button>
        )}
      </div>

      {upcoming.length ? (
        <div className="job-strip stagger">
          {upcoming.map((j, i) => (
            <JobRow key={j.id} job={j} i={i} onOpen={() => openJobPanel(j.id)} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="truck" />
          <div className="e-title">No upcoming jobs</div>
          <div className="e-sub">
            {can("createJob")
              ? "Create the first job to get it on the calendar."
              : "Nothing scheduled for you yet."}
          </div>
          {can("finances") && !ws.jobs.length && (
            <>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button type="button" className="btn primary" onClick={() => openModal(<JobForm />)}>
                  <Icon name="plus" /> New job
                </button>
                <button type="button" className="btn" onClick={() => void loadSample()}>
                  <Icon name="briefcase" /> Load sample data
                </button>
              </div>
              <div className="e-sub" style={{ marginTop: 10 }}>
                Sample data fills the calendar, finances, and chat with three demo jobs so you can
                try every feature — delete them anytime.
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ============ Upcoming job row ============ */

function JobRow({ job: j, i, onOpen }: { job: Job; i: number; onOpen: () => void }) {
  const { person } = useWorkspace();
  const d = new Date(j.shootDays[0] + "T00:00:00");
  const miss = missing(j);

  return (
    <div
      className={`job-row ${miss.length ? "has-miss" : ""}`.trim()}
      style={stagger(i)}
      onClick={onOpen}
    >
      <div className="job-date">
        <span className="d-mon">{d.toLocaleDateString("en-CA", { month: "short" })}</span>
        <span className="d-day">{d.getDate()}</span>
        <span className="d-wk">
          {d.toLocaleDateString("en-CA", { weekday: "short" })}
          {j.shootDays.length > 1 ? ` +${j.shootDays.length - 1}` : ""}
        </span>
      </div>
      <div className="job-main">
        <div className="job-name">
          {j.productionName}
          {miss.length > 0 && (
            <span className="missing-chip">
              <Icon name="alert" />
              {miss.length} missing
            </span>
          )}
        </div>
        <div className="job-meta">
          <span>
            <Icon name="briefcase" />
            {j.productionCompany}
          </span>
          <span>
            <Icon name="people" />
            {j.headcount} on set
          </span>
          <span>
            <Icon name="pin" />
            {(j.location || "—").split(",")[0]}
          </span>
        </div>
      </div>
      <div className="job-side">
        <AvatarStack people={allCrewIds(j).map(person)} />
        <StatusPill status={j.status} />
      </div>
    </div>
  );
}
