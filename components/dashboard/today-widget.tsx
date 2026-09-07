"use client";

/* ============================================================
   On the truck today.

   Today's shoot days, with the call, crew and location for that
   day specifically — per-day overrides and all — because that is
   what the person loading the truck needs. On a day with nothing
   on, it looks ahead to the next shoot day instead of sitting
   empty.
   ============================================================ */

import { useRouter } from "next/navigation";
import { AvatarStack } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { useWorkspace } from "@/components/workspace-provider";
import { crewFor, dayVal, jobsOn, missing, todayISO } from "@/lib/domain";
import { fmtLong, fmtTime12 } from "@/lib/format";
import type { Job } from "@/lib/types";
import { nextShootDay } from "./derive";

export function TodayWidget() {
  const { ws } = useWorkspace();
  const T = todayISO();

  let date = T;
  let jobs = jobsOn(ws.jobs, T);
  if (!jobs.length) {
    const next = nextShootDay(ws.jobs, T);
    if (next) {
      date = next;
      jobs = jobsOn(ws.jobs, next);
    }
  }

  if (!jobs.length) {
    return (
      <Empty
        icon="truck"
        title="Nothing on the books"
        sub="No shoot days scheduled from today onward."
      />
    );
  }

  return (
    <>
      {date !== T && (
        <div className="today-next">
          <Icon name="calendar" /> Nothing today · next up {fmtLong(date)}
        </div>
      )}
      <div className="today-list">
        {jobs.map((j) => (
          <TodayJob key={j.id} job={j} date={date} />
        ))}
      </div>
    </>
  );
}

function TodayJob({ job: j, date }: { job: Job; date: string }) {
  const { person, openJobPanel } = useWorkspace();
  const router = useRouter();

  const call = dayVal(j, date, "callTime");
  const wrap = dayVal(j, date, "wrapTime");
  const head = dayVal(j, date, "headcount");
  const location = String(dayVal(j, date, "location") || "");
  const crew = crewFor(j, date);
  const miss = missing(j);

  return (
    <article className={`today-job ${miss.length ? "has-miss" : ""}`.trim()}>
      <div className="tj-head">
        <div>
          <div className="tj-name">{j.productionName}</div>
          <div className="tj-co">{j.productionCompany || "—"}</div>
        </div>
        <StatusPill status={j.status} />
      </div>

      <div className="tj-meta">
        <span>
          <Icon name="clock" />
          Call {fmtTime12(call)}
          {wrap ? ` · Wrap ${fmtTime12(wrap)}` : ""}
        </span>
        <span>
          <Icon name="people" />
          {head || "?"} on set
        </span>
        <span>
          <Icon name="pin" />
          {location ? location.split(",")[0] : "No location yet"}
        </span>
      </div>

      <div className="tj-foot">
        {crew.length ? (
          <AvatarStack people={crew.map((c) => person(c.personId))} />
        ) : (
          <span className="tj-nocrew">
            <Icon name="alert" /> No crew booked
          </span>
        )}
        <div className="tj-actions">
          <button
            type="button"
            className="btn sm"
            aria-label={`Open job sheet for ${j.productionName}`}
            onClick={() => openJobPanel(j.id, date)}
          >
            <Icon name="doc" /> Job sheet
          </button>
          <button
            type="button"
            className="btn sm"
            aria-label={`Open brief for ${j.productionName}`}
            onClick={() => router.push(`/brief/${j.id}?date=${date}`)}
          >
            <Icon name="truck" /> Brief
          </button>
        </div>
      </div>
    </article>
  );
}
