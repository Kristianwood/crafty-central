"use client";

/* ============================================================
   Crafty Central — My Schedule
   The crew's own view: just their jobs, plus time-off requests
   that notify the moderators.
   ============================================================ */

import { useState } from "react";
import { crewFor, dayVal, personJobs, personOnDay, todayISO } from "@/lib/domain";
import { fmtRange, fmtTime12 } from "@/lib/format";
import type { Job } from "@/lib/types";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { useWorkspace } from "@/components/workspace-provider";

export default function ScheduleView() {
  const { ws } = useWorkspace();
  const T = todayISO();
  const meId = ws.me.id;

  /* The days I'm actually on, not just the jobs I'm attached to: a
     per-day crew override can drop me from one day of a job. */
  const myDays = (j: Job) => j.shootDays.filter((d) => personOnDay(j, meId, d));
  const lastMyDay = (j: Job) => {
    const d = myDays(j);
    return d[d.length - 1];
  };

  const mine = personJobs(ws.jobs, meId).filter((j) => myDays(j).length);
  const upcoming = mine.filter((j) => lastMyDay(j) >= T);
  const past = mine.filter((j) => lastMyDay(j) < T).reverse();
  const myTO = ws.timeOff.filter((t) => t.personId === meId).slice().reverse();

  return (
    <div className="view-enter sched-split">
      <div>
        <div className="section-head">
          <div>
            <div className="section-title">Your upcoming jobs</div>
            <div className="section-hint">
              Call times and locations for everything you&rsquo;re booked on.
            </div>
          </div>
        </div>

        {upcoming.length ? (
          <div className="job-strip stagger">
            {upcoming.map((j, i) => (
              <MyJobRow key={j.id} job={j} i={i} days={myDays(j)} />
            ))}
          </div>
        ) : (
          <Empty
            icon="schedule"
            title="Nothing booked yet"
            sub="When a moderator adds you to a job, it shows up here and you get a notification."
          />
        )}

        {past.length > 0 && (
          <>
            <div className="section-head">
              <div className="section-title">Recent</div>
            </div>
            <div className="job-strip" style={{ opacity: 0.62 }}>
              {past.slice(0, 4).map((j, i) => (
                <MyJobRow key={j.id} job={j} i={i} days={myDays(j)} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="timeoff-card">
        <h3>Time off</h3>
        <div className="tc-sub">
          Requests go straight to the moderators — you&rsquo;ll hear back in your notifications.
        </div>

        <TimeOffForm today={T} />

        {myTO.length > 0 && (
          <div
            style={{
              marginTop: 18,
              borderTop: "1px solid var(--line-soft)",
              paddingTop: 8,
            }}
          >
            {myTO.map((t) => (
              <div className="to-item" key={t.id}>
                <span className="to-dates">{fmtRange(t.start, t.end)}</span>
                <span className="to-reason">{t.reason || ""}</span>
                <span className={`pill ${t.status}`}>{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- one booked job ---------- */

function MyJobRow({ job: j, i, days }: { job: Job; i: number; days: string[] }) {
  const { ws, openJobPanel } = useWorkspace();

  const list = days.length ? days : j.shootDays;
  /* Open on the next day I work, so a job already part-way through
     lands on the day that still matters. */
  const first = list.find((d) => d >= todayISO()) || list[0];
  const d = new Date(first + "T00:00:00");
  const myRole = crewFor(j, first).find((c) => c.personId === ws.me.id)?.role;

  return (
    <div
      className="job-row"
      style={{ "--i": i } as React.CSSProperties}
      onClick={() => openJobPanel(j.id, first)}
    >
      <div className="job-date">
        <span className="d-mon">{d.toLocaleDateString("en-CA", { month: "short" })}</span>
        <span className="d-day">{d.getDate()}</span>
        <span className="d-wk">
          {d.toLocaleDateString("en-CA", { weekday: "short" })}
          {list.length > 1 ? ` +${list.length - 1}` : ""}
        </span>
      </div>
      <div className="job-main">
        <div className="job-name">
          {j.productionName}
          {myRole && <span className="crew-role-tag">{myRole}</span>}
        </div>
        <div className="job-meta">
          <span>
            <Icon name="clock" />
            Call {fmtTime12(dayVal(j, first, "callTime"))}
          </span>
          <span>
            <Icon name="pin" />
            {(j.location || "—").split(",")[0]}
          </span>
          <span>
            <Icon name="people" />
            {j.headcount} on set
          </span>
        </div>
      </div>
      <div className="job-side">
        <StatusPill status={j.status} />
      </div>
    </div>
  );
}

/* ---------- request time off ---------- */

function TimeOffForm({ today }: { today: string }) {
  const { mutate, toast } = useWorkspace();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!start) return;
    /* Blank end means a single day; a backwards range is folded to one. */
    let last = end || start;
    if (last < start) last = start;

    await mutate("/api/time-off", { start, end: last, reason: reason.trim() });
    toast("Request sent to the moderators", "send");
    setStart("");
    setEnd("");
    setReason("");
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label>First day off</label>
        <input
          type="date"
          name="start"
          required
          min={today}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Last day off</label>
        <input
          type="date"
          name="end"
          min={today}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <span className="hint">Leave blank for a single day.</span>
      </div>
      <div className="field">
        <label>
          Reason <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(optional)</span>
        </label>
        <input
          type="text"
          name="reason"
          placeholder="e.g. out of town"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
        <Icon name="send" /> Request time off
      </button>
    </form>
  );
}
