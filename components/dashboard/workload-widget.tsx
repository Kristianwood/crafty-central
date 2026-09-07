"use client";

/* ============================================================
   Crew workload — booked days from today onward, busiest first.

   Clicking a person opens their schedule in the modal; that
   component lives in person-schedule.tsx so the list here stays
   the size of a list.
   ============================================================ */

import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { useWorkspace } from "@/components/workspace-provider";
import { personBookedDays, personUpcomingDays, todayISO } from "@/lib/domain";
import { fmtShort } from "@/lib/format";
import { PersonSchedule } from "./person-schedule";

export function WorkloadWidget() {
  const { ws, openModal } = useWorkspace();
  const T = todayISO();

  const people = ws.people
    .slice()
    .sort(
      (a, b) =>
        personUpcomingDays(ws.jobs, b.id) - personUpcomingDays(ws.jobs, a.id) ||
        a.name.localeCompare(b.name),
    );

  if (!people.length) {
    return <Empty icon="people" title="Nobody in the directory yet" sub="Add crew from the Directory." />;
  }

  return (
    <>
      <div className="dw-sub">
        <span className="section-hint">
          Booked days from today onward — click anyone to see their schedule.
        </span>
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
              role="button"
              tabIndex={0}
              aria-label={`Open schedule for ${p.name}`}
              onClick={() => openModal(<PersonSchedule person={p} />)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openModal(<PersonSchedule person={p} />);
                }
              }}
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
              <div className={`wl-days ${days ? "" : "zero"}`.trim()}>
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
