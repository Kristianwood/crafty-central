"use client";

/* ============================================================
   Dashboard — the admin/moderator home.

   Same four stat cells, the upcoming-jobs strip, the outreach
   inbox, the time-off queue and the crew workload list as the
   vanilla view had. The one piece that has moved out is the job
   form, which is now <JobForm /> rendered into the modal.

   The person-schedule modal keeps its list/calendar toggle as
   component state, which matches the old behaviour: the module
   -level `schedView` was reset to 'list' every time the modal
   was opened anyway.
   ============================================================ */

import { useState } from "react";
import { Avatar, AvatarStack } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { JobForm } from "@/components/job-form";
import { StatusPill } from "@/components/status-pill";
import { Empty } from "@/components/empty";
import { useWorkspace } from "@/components/workspace-provider";
import {
  addDays,
  allCrewIds,
  crewFor,
  iso,
  jobSubtotal,
  missing,
  personBookedDays,
  personJobs,
  personUpcomingDays,
  todayISO,
} from "@/lib/domain";
import { fmtMoney, fmtRange, fmtShort, fmtTime12 } from "@/lib/format";
import type { Inquiry, Job, Person, TimeOff } from "@/lib/types";

/* The stagger animation reads --i off each child. */
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default function DashboardView() {
  const { ws, can, mutate, toast, openModal, openJobPanel } = useWorkspace();

  const T = todayISO();
  const jobs = ws.jobs; // already filtered to what this person may see
  const weekEnd = addDays(T, 6);

  const upcoming = jobs
    .filter((j) => j.shootDays[j.shootDays.length - 1] >= T)
    .sort((a, b) => a.shootDays[0].localeCompare(b.shootDays[0]));
  const needsAttention = upcoming.filter((j) => missing(j).length);
  const next7 = jobs.filter((j) => j.shootDays.some((d) => d >= T && d <= weekEnd));
  const headcount7 = next7.reduce(
    (s, j) => s + j.headcount * j.shootDays.filter((d) => d >= T && d <= weekEnd).length,
    0,
  );
  const pendingTO = ws.timeOff.filter((t) => t.status === "pending");
  const pipeline = jobs
    .filter((j) => j.status === "estimate" || j.status === "confirmed")
    .reduce((s, j) => s + jobSubtotal(j, ws.settings), 0);
  const inquiries = ws.inquiries
    .filter((q) => q.status === "new")
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  async function loadSample() {
    await mutate("/api/sample-data");
    toast("Sample data loaded — check the calendar and finances", "check");
  }

  return (
    <div className="view-enter">
      <div className="stat-row stagger">
        <div className="stat-cell" style={stagger(0)}>
          <div className="stat-label">Jobs this week</div>
          <div className="stat-value">{next7.length}</div>
          <div className="stat-sub">{upcoming.length} upcoming total</div>
        </div>
        <div className="stat-cell tint-olive" style={stagger(1)}>
          <div className="stat-label">Meals to plan · 7 days</div>
          <div className="stat-value">
            {headcount7}
            <span className="unit">covers</span>
          </div>
          <div className="stat-sub">across confirmed shoot days</div>
        </div>
        <div
          className={`stat-cell ${needsAttention.length ? "tint-clay" : ""}`}
          style={stagger(2)}
        >
          <div className="stat-label">Needs attention</div>
          <div className="stat-value">{needsAttention.length}</div>
          <div className="stat-sub">jobs with missing info</div>
        </div>
        {can("finances") ? (
          <div className="stat-cell" style={stagger(3)}>
            <div className="stat-label">Open pipeline</div>
            <div className="stat-value">{fmtMoney(pipeline).replace(".00", "")}</div>
            <div className="stat-sub up">estimates + confirmed</div>
          </div>
        ) : (
          <div className="stat-cell" style={stagger(3)}>
            <div className="stat-label">Time-off requests</div>
            <div className="stat-value">{pendingTO.length}</div>
            <div className="stat-sub">awaiting review</div>
          </div>
        )}
      </div>

      <div className="section-head">
        <div>
          <div className="section-title">Upcoming jobs</div>
          <div className="section-hint">
            Click a job to open the full sheet — red dot means something is missing.
          </div>
        </div>
        {can("createJob") && (
          <button className="btn primary" onClick={() => openModal(<JobForm />)}>
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
          {can("createJob") && !ws.jobs.length && (
            <>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button className="btn primary" onClick={() => openModal(<JobForm />)}>
                  <Icon name="plus" /> New job
                </button>
                <button className="btn" onClick={() => void loadSample()}>
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

      {can("createJob") && inquiries.length > 0 && (
        <>
          <div className="section-head">
            <div>
              <div className="section-title">New inquiries</div>
              <div className="section-hint">
                From the outreach form — turn one into a hold or dismiss it.
              </div>
            </div>
          </div>
          <div className="timeoff-card">
            {inquiries.map((q) => (
              <InquiryRow key={q.id} inquiry={q} />
            ))}
          </div>
        </>
      )}

      {pendingTO.length > 0 && can("approveTimeOff") && (
        <>
          <div className="section-head">
            <div className="section-title">Time-off requests</div>
            <div className="section-hint">
              Approve or deny — the crew member is notified either way.
            </div>
          </div>
          <div className="timeoff-card">
            {pendingTO.map((t) => (
              <TimeOffRow key={t.id} request={t} />
            ))}
          </div>
        </>
      )}

      {can("assignCrew") && <CrewWorkload />}
    </div>
  );
}

/* ============ Upcoming job row ============ */

function JobRow({ job: j, i, onOpen }: { job: Job; i: number; onOpen: () => void }) {
  const { person } = useWorkspace();
  const d = new Date(j.shootDays[0] + "T00:00:00");
  const miss = missing(j);

  return (
    <div
      className={`job-row ${miss.length ? "has-miss" : ""}`}
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

/* ============ Outreach inquiries ============ */

function InquiryRow({ inquiry: q }: { inquiry: Inquiry }) {
  const { mutate, toast, openJobPanel } = useWorkspace();
  const days = q.shootDays.slice().sort();
  const contact = [q.email, q.phone].filter(Boolean).join(" · ");

  async function convert() {
    try {
      const out = await mutate<{ job: Job }>(
        `/api/inquiries/${q.id}`,
        { action: "convert" },
        "PATCH",
      );
      toast("Hold created — it is on the calendar", "check");
      openJobPanel(out.job.id);
    } catch {
      /* mutate has already toasted why the server refused. */
    }
  }

  return (
    <div className="inq-row">
      <div className="inq-main">
        <span className="inq-co">{q.company}</span>
        <span className="inq-meta">
          {days.length ? `${fmtRange(days[0], days[days.length - 1])} · ` : ""}
          {q.intExt || "?"} · {q.dayNight || "?"} · ~{q.headcount || "?"} on set
          {q.pm ? ` · PM: ${q.pm}` : ""}
        </span>
        <span className="inq-contact">
          {contact}
          {q.notes ? ` — “${q.notes}”` : ""}
        </span>
      </div>
      <div className="to-actions">
        <button className="btn sm" onClick={() => void convert()}>
          <Icon name="check" /> Create hold
        </button>
        <button
          className="btn sm danger"
          onClick={async () => {
            await mutate(`/api/inquiries/${q.id}`, { action: "dismiss" }, "PATCH");
            toast("Inquiry dismissed", "x");
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ============ Time-off queue ============ */

function TimeOffRow({ request: t }: { request: TimeOff }) {
  const { person, mutate, toast } = useWorkspace();
  const p = person(t.personId);
  if (!p) return null;

  async function resolve(status: "approved" | "denied") {
    await mutate(`/api/time-off/${t.id}`, { status }, "PATCH");
    toast(status === "approved" ? "Time off approved" : "Time off denied", status === "approved" ? "check" : "x");
  }

  return (
    <div className="to-item">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar person={p} size="sm" />
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="to-reason">{t.reason || "No reason given"}</div>
        </div>
      </div>
      <span className="to-dates">{fmtRange(t.start, t.end)}</span>
      <div className="to-actions">
        <button className="btn sm" onClick={() => void resolve("approved")}>
          <Icon name="check" /> Approve
        </button>
        <button className="btn sm danger" onClick={() => void resolve("denied")}>
          Deny
        </button>
      </div>
    </div>
  );
}

/* ============ Crew workload (moderators + admins) ============ */

function CrewWorkload() {
  const { ws, openModal } = useWorkspace();
  const T = todayISO();

  const people = ws.people
    .slice()
    .sort(
      (a, b) =>
        personUpcomingDays(ws.jobs, b.id) - personUpcomingDays(ws.jobs, a.id) ||
        a.name.localeCompare(b.name),
    );

  return (
    <>
      <div className="section-head">
        <div>
          <div className="section-title">Crew workload</div>
          <div className="section-hint">
            Booked days from today onward — click anyone to see their schedule.
          </div>
        </div>
      </div>
      <div className="workload-list">
        {people.map((p) => {
          const days = personUpcomingDays(ws.jobs, p.id);
          const nextDay =
            Object.keys(personBookedDays(ws.jobs, p.id))
              .sort()
              .find((d) => d >= T) || null;
          return (
            <div
              className="workload-row"
              key={p.id}
              onClick={() => openModal(<PersonSchedule person={p} />)}
            >
              <Avatar person={p} size="sm" />
              <div className="wl-main">
                <span className="wl-name">{p.name}</span>
                <span className="wl-tags">
                  {(p.tags || []).map((t) => (
                    <span className="crew-role-tag" key={t}>
                      {t}
                    </span>
                  ))}
                </span>
              </div>
              <div className={`wl-days ${days ? "" : "zero"}`}>
                <span className="wl-count">{days}</span>
                <span className="wl-unit">day{days === 1 ? "" : "s"}</span>
              </div>
              <span className="wl-next">{nextDay ? "next " + fmtShort(nextDay) : "nothing booked"}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============ Person schedule modal ============ */

function PersonSchedule({ person: p }: { person: Person }) {
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
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <div className="seg-toggle" role="tablist">
        <button className={`seg ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
          <Icon name="note" /> List
        </button>
        <button className={`seg ${view === "cal" ? "active" : ""}`} onClick={() => setView("cal")}>
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
            className="icon-btn"
            aria-label="Previous month"
            style={{ width: 28, height: 28 }}
            onClick={() => shift(-1)}
          >
            <Icon name="chevLeft" />
          </button>
          <button
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
