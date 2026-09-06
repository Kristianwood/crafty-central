"use client";

/* ============================================================
   Crafty Central — Job Brief
   A full-page, read-first call sheet for one job, one day at a
   time: call-time hero, fact tiles, then Menu · Crew · Dietary.
   Everyone can view it; editing stays on the job sheet panel.

   Ported from js/views/brief.js. The one real change: the day
   being shown used to be module state on a pseudo-view, and is
   now the ?date= on a real route, so a brief can be linked to,
   reloaded, and shared as the day it actually describes.
   ============================================================ */

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { crewFor, dayVal, menuFor, todayISO } from "@/lib/domain";
import { fmtLong, fmtShort, fmtTime12 } from "@/lib/format";
import type { DayInfo, Person } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/status-pill";
import { useWorkspace } from "@/components/workspace-provider";

/* useSearchParams needs a suspense boundary above it; the brief is
   worthless without its day, so the boundary lives here rather than
   somewhere that would make the whole shell wait. */
export default function BriefPage() {
  return (
    <Suspense fallback={null}>
      <BriefView />
    </Suspense>
  );
}

interface DietRow {
  name: string;
  role: string;
  diet: string;
  severe: boolean;
}

function BriefView() {
  const { ws, can, person, job, openJobPanel } = useWorkspace();
  const router = useRouter();
  const { jobId } = useParams<{ jobId: string }>();
  const dateParam = useSearchParams().get("date");

  const j = jobId ? job(jobId) : undefined;

  /* No job means deleted, or a job this person is not allowed to
     see — either way there is nothing to show but a way out. */
  if (!j) {
    return (
      <div className="view-enter brief">
        <div className="brief-topline">
          <button className="btn sm" onClick={() => router.back()}>
            <Icon name="chevLeft" /> Back
          </button>
          <span />
        </div>
        <div className="empty">
          <Icon name="doc" />
          <div className="e-title">No job selected</div>
          <div className="e-sub">
            Open any job from the calendar and tap &quot;Job brief&quot;.
          </div>
        </div>
      </div>
    );
  }

  /* A ?date= that is not one of this job's shoot days (an old link,
     a day since removed) falls back to day one, as setJob did. */
  const dayIdx = dateParam ? Math.max(0, j.shootDays.indexOf(dateParam)) : 0;
  const date = j.shootDays[dayIdx] || todayISO();
  const multi = j.shootDays.length > 1;

  const dv = (f: "callTime" | "wrapTime" | "headcount" | "location") =>
    dayVal(j, date, f);
  const di: DayInfo = j.dayInfo?.[date] ?? {};
  const menu = menuFor(j, date);
  const crew = crewFor(j, date);
  const canEdit = can("editJob");

  /* dietary: the day's truck crew with restrictions + every on-set
     person on file (the people we feed) */
  const crewDiet: DietRow[] = crew
    .map((c) => person(c.personId))
    .filter((p): p is Person => !!p && p.dietary.length > 0)
    .map((p) => ({
      name: p.name,
      role: "Crafty · " + (p.position || "crew"),
      diet: p.dietary.join(", "),
      severe: p.dietary.some((d) => /severe|allerg/i.test(d)),
    }));
  const setDiet: DietRow[] = ws.setCrew
    .filter((c) => c.dietary.length || c.notes)
    .map((c) => ({
      name: c.name,
      role: c.position || "on set",
      diet: [c.dietary.join(", "), c.notes].filter(Boolean).join(" — "),
      severe: c.dietary.some((d) => /allerg/i.test(d)) || /severe/i.test(c.notes || ""),
    }));
  const dietary = [...crewDiet, ...setDiet];

  const gaps: string[] = [];
  if (!crew.length) gaps.push(multi ? `No crew booked for Day ${dayIdx + 1} yet.` : "No crew booked yet.");
  if (!menu.length) gaps.push(multi ? `Day ${dayIdx + 1}'s menu is still unset.` : "The menu is still unset.");
  if (!dv("location")) gaps.push("No location on the sheet.");

  return (
    <div className="view-enter brief">
      <div className="brief-topline">
        <button className="btn sm" onClick={() => router.back()}>
          <Icon name="chevLeft" /> Back
        </button>

        {/* replace, not push: switching day tabs used to be a plain
            re-render, so it must not pile up history entries that
            Back then has to chew through to leave the brief. */}
        {multi && (
          <div className="day-tabs brief-days">
            {j.shootDays.map((d, i) => (
              <button
                key={d}
                className={`seg ${i === dayIdx ? "active" : ""}`.trim()}
                onClick={() => router.replace(`/brief/${j.id}?date=${d}`)}
              >
                Day {i + 1} <span className="seg-sub">{fmtShort(d)}</span>
              </button>
            ))}
          </div>
        )}

        {canEdit ? (
          <button
            className="btn sm"
            onClick={() => {
              router.push("/calendar");
              openJobPanel(j.id, date);
            }}
          >
            <Icon name="edit" /> Open job sheet
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="brief-hero">
        <div className="bh-kicker">
          Job brief · {fmtLong(date)}
          {multi ? ` · Day ${dayIdx + 1} of ${j.shootDays.length}` : ""}
        </div>
        <div className="bh-call">
          <span className="bh-time">{fmtTime12(dv("callTime"))}</span>
          <span className="bh-call-label">call</span>
        </div>
        <div className="bh-name">{j.productionName}</div>
        <div className="bh-sub">
          {dv("location") || "Location TBC"} · {dv("headcount") || "—"} on set · wrap{" "}
          {fmtTime12(dv("wrapTime"))} est.
        </div>
        {/* the day's own note only — a job-level note has its own card below */}
        {di.notes && (
          <div className="bh-note">
            <Icon name="note" /> {di.notes}
          </div>
        )}
      </div>

      <div className="brief-tiles">
        <div className="fact">
          <div className="f-label">Production co.</div>
          <div className="f-value">{j.productionCompany}</div>
        </div>
        <div className="fact">
          <div className="f-label">PM</div>
          <div className="f-value">{j.pm || "—"}</div>
        </div>
        <div className="fact">
          <div className="f-label">Producer{j.producers.includes(",") ? "s" : ""}</div>
          <div className="f-value">{j.producers || "—"}</div>
        </div>
        <div className="fact">
          <div className="f-label">Status</div>
          <div className="f-value">
            <StatusPill status={j.status} />
          </div>
        </div>
      </div>

      <div className="brief-cols">
        <div className="brief-card">
          <div className="bc-title">Menu{multi ? ` — Day ${dayIdx + 1}` : ""}</div>
          {menu.length ? (
            <div className="bc-list">
              {menu.map((m, i) => (
                <span className="bc-pill" key={`${m}-${i}`}>
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="bc-empty">
              Nothing set yet{canEdit ? " — build it on the job sheet" : ""}.
            </p>
          )}
        </div>

        <div className="brief-card">
          <div className="bc-title">Crew on the truck</div>
          {crew.length ? (
            <div className="bc-rows">
              {crew.map((c, i) => {
                const p = person(c.personId);
                if (!p) return null;
                return (
                  <span className="bc-row" key={`${c.personId}-${i}`}>
                    <Avatar person={p} size="sm" />
                    <b>{p.name}</b>
                    <span className="bc-role">{c.role}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="bc-empty">Nobody booked{multi ? " for this day" : ""} yet.</p>
          )}
        </div>

        <div className="brief-card">
          <div className="bc-title">Watch the plates</div>
          {dietary.length ? (
            <div className="bc-diet">
              {dietary.map((d, i) => (
                <span
                  className={`bc-diet-row ${d.severe ? "severe" : ""}`.trim()}
                  key={`${d.name}-${i}`}
                >
                  <b>{d.name}</b> · {d.role} — {d.diet}
                </span>
              ))}
            </div>
          ) : (
            <p className="bc-empty">No dietary flags on file.</p>
          )}
        </div>
      </div>

      {j.notes && (
        <div className="brief-card brief-notes">
          <div className="bc-title">Job notes</div>
          <p className="bc-body">{j.notes}</p>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="brief-gaps">
          <Icon name="alert" />
          <span>{gaps.join(" ")}</span>
        </div>
      )}
    </div>
  );
}
