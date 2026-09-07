"use client";

/* ============================================================
   The job side panel — the job sheet, and the day view.

   Ported from ui.js with its behaviour intact, including the two
   things that are easy to lose:

   - On a multi-day job every block is scoped to the selected day
     tab, and the "all days" checkboxes decide whether an edit
     lands on one day or on the job default.
   - <details> open/closed state is preserved across re-renders,
     except when you switch day tabs, where it is recomputed from
     what that day is missing.
   ============================================================ */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CREW_ROLES,
  type CrewSlot,
  type DayInfo,
  type Job,
  type Person,
} from "@/lib/types";
import {
  candidatesFor,
  crewFor,
  dayVal,
  hasTimeOff,
  jobSubtotal,
  menuFor,
  missing,
  totalCovers,
} from "@/lib/domain";
import { fmtDays, fmtLong, fmtMoney, fmtShort, fmtTime12, firstName } from "@/lib/format";
import { Avatar, AvatarStack } from "./avatar";
import { Empty } from "./empty";
import { newestFirst } from "./finances/invoice-pill";
import { Icon } from "./icons";
import { InvoiceEditor } from "./invoice-editor";
import { JobForm } from "./job-form";
import { StatusPill } from "./status-pill";
import { useWorkspace } from "./workspace-provider";

export function JobPanel() {
  const { panel, closingPanel, closePanel, job } = useWorkspace();
  const open = !!(panel.jobId || panel.date);

  /* While it slides out the panel still has to show what was in it,
     so fall back to the outgoing state the provider is holding. */
  const shown = open ? panel : closingPanel;
  if (!shown) return null;

  const current = shown.jobId ? job(shown.jobId) : null;

  return (
    <>
      <aside className={`panel${open ? " open" : ""}`}>
        <div className="panel-inner">
          {shown.date ? (
            <DayPanel date={shown.date} />
          ) : current ? (
            <JobSheet job={current} dayIdx={shown.dayIdx} />
          ) : null}
        </div>
      </aside>
      <div
        className={`panel-scrim${open ? " open" : ""}`}
        /* Transparent but still full-screen when closed, so it must not
           swallow clicks meant for the view behind it. */
        style={open ? undefined : { pointerEvents: "none" }}
        onClick={closePanel}
      />
    </>
  );
}

/* ============================================================
   Day view — everything happening on one date
   ============================================================ */

function DayPanel({ date }: { date: string }) {
  const { ws, can, closePanel, openJobPanel, openModal, person } = useWorkspace();
  const router = useRouter();

  const jobs = ws.jobs.filter((j) => j.shootDays.includes(date));
  const canSeeAll = can("approveTimeOff");
  const offs = ws.timeOff.filter(
    (t) =>
      t.status === "approved" &&
      date >= t.start &&
      date <= t.end &&
      (canSeeAll || t.personId === ws.me.id),
  );

  return (
    <>
      <div className="panel-top">
        <div>
          <div className="panel-kicker">Day view</div>
          <h2 className="panel-title">
            {new Date(date + "T00:00:00").toLocaleDateString("en-CA", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
          <div className="panel-sub text-inkish">
            {jobs.length
              ? `${jobs.length} job${jobs.length === 1 ? "" : "s"} on the truck`
              : "Nothing on the books"}
            {offs.length ? ` · ${offs.length} off` : ""}
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closePanel}>
          <Icon name="x" />
        </button>
      </div>

      <div className="dp-list">
        {jobs.map((j) => {
          const dayNum = j.shootDays.indexOf(date) + 1;
          const crew = crewFor(j, date);
          const menu = menuFor(j, date);
          const head = dayVal(j, date, "headcount");
          return (
            <div className="dp-job" key={j.id}>
              <div className="dp-job-head">
                <div>
                  <div className="dp-name">{j.productionName}</div>
                  <div className="dp-co">
                    {j.productionCompany}
                    {j.shootDays.length > 1 ? ` · Day ${dayNum} of ${j.shootDays.length}` : ""}
                  </div>
                </div>
                <StatusPill status={j.status} />
              </div>

              <div className="dp-meta">
                <span>
                  <Icon name="clock" />
                  {fmtTime12(dayVal(j, date, "callTime"))} – {fmtTime12(dayVal(j, date, "wrapTime"))}
                </span>
                <span>
                  <Icon name="people" />
                  {head || "—"} on set
                </span>
                <span>
                  <Icon name="truck" />
                  {crew.length ? `${crew.length} crew` : <b className="dp-gap">no crew</b>}
                </span>
                <span>
                  <Icon name="menu" />
                  {menu.length ? `${menu.length} items` : <b className="dp-gap">no menu</b>}
                </span>
              </div>

              {crew.length > 0 && (
                <div className="dp-crew">
                  <AvatarStack people={crew.map((c) => person(c.personId))} max={6} />
                </div>
              )}

              <div className="dp-actions">
                <button className="btn sm" onClick={() => openJobPanel(j.id, date)}>
                  <Icon name="edit" /> Job sheet
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    closePanel();
                    router.push(`/brief/${j.id}?date=${date}`);
                  }}
                >
                  <Icon name="doc" /> Brief
                </button>
              </div>
            </div>
          );
        })}

        {!jobs.length && (
          <Empty
            icon="truck"
            title="A quiet one"
            sub={`No jobs on this day${can("createJob") ? " — yet" : ""}.`}
            style={{ padding: "32px 20px" }}
          />
        )}

        {offs.length > 0 && (
          <div className="dp-off-wrap">
            <div className="dp-off-title">Off this day</div>
            {offs.map((t) => {
              const p = person(t.personId);
              if (!p) return null;
              return (
                <span className="dp-off" key={t.id}>
                  <Avatar person={p} size="sm" />
                  <b>{p.name}</b>
                  <span>{t.reason || "time off"}</span>
                </span>
              );
            })}
          </div>
        )}

        {can("createJob") && (
          <button
            className="btn primary"
            style={{ justifyContent: "center" }}
            onClick={() => {
              closePanel();
              openModal(<JobForm presetDate={date} />);
            }}
          >
            <Icon name="plus" /> New job on {fmtShort(date)}
          </button>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Job sheet
   ============================================================ */

function JobSheet({ job: j, dayIdx: rawDayIdx }: { job: Job; dayIdx: number }) {
  const { ws, can, setPanelDay, closePanel, openModal, mutate, toast } = useWorkspace();
  const router = useRouter();

  const canEdit = can("editJob");
  const canCrew = can("assignCrew");
  const [drafting, setDrafting] = useState(false);
  const miss = useMemo(() => missing(j), [j]);

  const multiDay = j.shootDays.length > 1;
  const dayIdx = Math.min(rawDayIdx, Math.max(0, j.shootDays.length - 1));
  const activeDate = j.shootDays[dayIdx] ?? j.shootDays[0];
  const di: DayInfo = (activeDate && j.dayInfo[activeDate]) || {};

  const dayMenu = multiDay && activeDate ? menuFor(j, activeDate) : j.menu;
  const dayCrew = multiDay && activeDate ? crewFor(j, activeDate) : j.crew;
  const menuDate = multiDay ? activeDate : null;
  const crewDate = multiDay ? activeDate : null;
  const hasMenuOverride = multiDay && Array.isArray(di.menu);
  const hasCrewOverride = multiDay && Array.isArray(di.crew);

  const offOn = (pid: string, days: string[]) => hasTimeOff(ws.timeOff, pid, days);

  const subtotal = jobSubtotal(j, ws.settings);

  return (
    <>
      <div className="panel-top">
        <div>
          <div className="panel-kicker">
            {j.productionCompany}
            {j.agency ? ` · ${j.agency}` : ""}
          </div>
          <h2 className="panel-title">{j.productionName}</h2>
          <div className="panel-sub">
            {canEdit && j.status !== "invoiced" ? (
              <select
                className={`status-select ${j.status}`}
                aria-label="Job status"
                value={j.status}
                onChange={async (e) => {
                  const status = e.target.value;
                  await mutate(`/api/jobs/${j.id}`, { status }, "PATCH");
                  toast(
                    status === "confirmed"
                      ? "Confirmed — it’s locked in on the calendar"
                      : "Status updated",
                    "check",
                  );
                }}
              >
                <option value="estimate">Hold</option>
                <option value="confirmed">Confirmed</option>
                <option value="wrapped">Wrapped</option>
              </select>
            ) : (
              <StatusPill status={j.status} />
            )}
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closePanel}>
          <Icon name="x" />
        </button>
      </div>

      {multiDay && (
        <div className="day-tabs">
          {j.shootDays.map((d, i) => {
            const info = j.dayInfo[d];
            const needs = !menuFor(j, d).length || !crewFor(j, d).length;
            const cls = needs
              ? "needs-menu"
              : info && Object.keys(info).length
                ? "has-info"
                : "";
            return (
              <button
                key={d}
                className={`seg ${i === dayIdx ? "active" : ""} ${cls}`.trim()}
                onClick={() => setPanelDay(i)}
              >
                Day {i + 1} <span className="seg-sub">{fmtShort(d)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="miss-stack">
        <CrewBlock
          job={j}
          dayIdx={dayIdx}
          activeDate={activeDate}
          multiDay={multiDay}
          dayCrew={dayCrew}
          crewDate={crewDate}
          hasOverride={hasCrewOverride}
          incomplete={miss.includes("crew")}
          canCrew={canCrew}
          offOn={offOn}
        />

        <MenuBlock
          job={j}
          dayIdx={dayIdx}
          activeDate={activeDate}
          multiDay={multiDay}
          dayMenu={dayMenu}
          menuDate={menuDate}
          hasOverride={hasMenuOverride}
          incomplete={miss.includes("menu")}
          canEdit={canEdit}
        />

        <DietBlock crew={dayCrew} />
      </div>

      {multiDay && activeDate && (
        /* keyed by date so switching tabs remounts it with that day's
           values, rather than syncing the fields in an effect */
        <DayCard
          key={activeDate}
          job={j}
          date={activeDate}
          dayIdx={dayIdx}
          info={di}
          canEdit={canEdit}
        />
      )}

      <div className="fact-grid">
        <div className="fact">
          <div className="f-label">Shoot days</div>
          <div className="f-value mono">{fmtDays(j.shootDays)}</div>
        </div>
        <div className="fact">
          <div className="f-label">{multiDay ? "Total covers" : "Headcount"}</div>
          <div className="f-value mono">
            {multiDay ? totalCovers(j) : `${j.headcount} on set`}
          </div>
        </div>

        {!multiDay && (
          <>
            <div className="fact">
              <div className="f-label">Call</div>
              <div className="f-value mono">{fmtTime12(j.callTime)}</div>
            </div>
            <div className="fact">
              <div className="f-label">Wrap (est.)</div>
              <div className="f-value mono">{fmtTime12(j.wrapTime)}</div>
            </div>
          </>
        )}

        {j.pm && (
          <div className="fact">
            <div className="f-label">Production manager</div>
            <div className="f-value">{j.pm}</div>
          </div>
        )}
        {j.producers && (
          <div className={`fact${j.pm ? "" : " wide"}`}>
            <div className="f-label">Producer{j.producers.includes(",") ? "s" : ""}</div>
            <div className="f-value">{j.producers}</div>
          </div>
        )}
        {!multiDay && (
          <div className="fact wide">
            <div className="f-label">Location</div>
            <div className="f-value">{j.location || "—"}</div>
          </div>
        )}
        {j.notes && (
          <div className="fact wide">
            <div className="f-label">Notes</div>
            <div className="f-value" style={{ fontWeight: 450, fontSize: 13 }}>
              {j.notes}
            </div>
          </div>
        )}
        {can("finances") && (
          <div className="fact wide">
            <div className="f-label">Estimate value</div>
            <div className="f-value mono">
              {fmtMoney(subtotal)}{" "}
              <span style={{ color: "var(--ink-3)", fontSize: 11 }}>+ HST</span>
            </div>
          </div>
        )}
      </div>

      <div className="panel-actions">
        {canEdit && j.status === "estimate" && (
          <button
            className="btn primary"
            onClick={async () => {
              await mutate(`/api/jobs/${j.id}`, { status: "confirmed" }, "PATCH");
              toast("Confirmed — it’s locked in on the calendar", "check");
            }}
          >
            <Icon name="check" /> Confirm job
          </button>
        )}

        <button
          className={`btn ${canEdit && j.status === "estimate" ? "" : "primary"}`.trim()}
          onClick={() => {
            const day = j.shootDays[dayIdx];
            closePanel();
            router.push(`/brief/${j.id}${day ? `?date=${day}` : ""}`);
          }}
        >
          <Icon name="doc" /> Job brief
        </button>

        {canEdit && (
          <button className="btn" onClick={() => openModal(<JobForm job={j} />)}>
            <Icon name="edit" /> Edit job
          </button>
        )}

        {can("finances") && j.status !== "invoiced" && (
          <button
            className="btn"
            /* Drafting is a POST that mints a number, so a second click
               while the first is still in flight would mint a second
               invoice for the same job. */
            disabled={drafting}
            onClick={async () => {
              if (drafting) return;
              setDrafting(true);
              try {
                const out = await mutate<{ invoice: { id: string; number: string } }>(
                  `/api/jobs/${j.id}/invoice`,
                );
                toast(`Invoice ${out.invoice.number} drafted`, "doc");
                openModal(<InvoiceEditor invoiceId={out.invoice.id} />);
              } catch {
                /* mutate has already toasted why. */
              } finally {
                setDrafting(false);
              }
            }}
          >
            <Icon name="doc" /> {drafting ? "Drafting…" : "Create invoice"}
          </button>
        )}

        {can("finances") &&
          (() => {
            /* The latest invoice on this job, if any — the builder
               shows it whatever state it is in. */
            const inv = newestFirst(ws.invoices.filter((i) => i.jobId === j.id))[0];
            return inv ? (
              <button className="btn" onClick={() => openModal(<InvoiceEditor invoiceId={inv.id} />)}>
                <Icon name="receipt" /> View invoice {inv.number}
              </button>
            ) : null;
          })()}

        {canEdit && (
          <button
            className="btn danger"
            onClick={async () => {
              if (
                !confirm(
                  `Delete "${j.productionName}"? Any draft invoice on it goes too. ` +
                    "A job whose invoice has already gone out cannot be deleted.",
                )
              ) {
                return;
              }
              await mutate(`/api/jobs/${j.id}`, undefined, "DELETE");
              closePanel();
              toast("Job deleted", "x");
            }}
          >
            <Icon name="x" /> Delete
          </button>
        )}
      </div>
    </>
  );
}

/* ---------- crew ---------- */

function CrewBlock({
  job: j,
  dayIdx,
  activeDate,
  multiDay,
  dayCrew,
  crewDate,
  hasOverride,
  incomplete,
  canCrew,
  offOn,
}: {
  job: Job;
  dayIdx: number;
  activeDate: string;
  multiDay: boolean;
  dayCrew: CrewSlot[];
  crewDate: string | null;
  hasOverride: boolean;
  incomplete: boolean;
  canCrew: boolean;
  offOn: (pid: string, days: string[]) => boolean;
}) {
  const { ws, person, mutate, toast } = useWorkspace();
  const [role, setRole] = useState<string>(CREW_ROLES[0]);
  const [allDays, setAllDays] = useState(true);
  const [chosen, setChosen] = useState("");

  const scopeDate = multiDay && !allDays ? activeDate : null;
  const scopeDays = scopeDate ? [scopeDate] : j.shootDays;
  const candidates = candidatesFor(ws.people, j, role, scopeDate);

  /* Changing the role or the day narrows the list, which can strand
     the current choice. Derive it rather than chasing it with an
     effect: whoever is picked, if they are still eligible; the first
     candidate otherwise. */
  const pick = candidates.some((p) => p.id === chosen) ? chosen : (candidates[0]?.id ?? "");

  async function add() {
    if (!pick) return;
    const p = person(pick);
    if (!p) return;
    if (
      offOn(p.id, scopeDays) &&
      !confirm(
        `${p.name} has time off during ${scopeDate ? "that day" : "this shoot"}. Book them anyway?`,
      )
    ) {
      return;
    }
    await mutate(`/api/jobs/${j.id}/crew`, { role, personId: pick, date: scopeDate });
    toast(
      `${firstName(p.name)} added as ${role}${
        scopeDate ? ` — Day ${dayIdx + 1} only` : multiDay ? " — all days" : ""
      }`,
      "people",
    );
  }

  return (
    <details className={`miss-block${incomplete ? " incomplete" : ""}`} open={!dayCrew.length}>
      <summary>
        <span className="ms-icon">
          <Icon name="people" />
        </span>
        Crew
        {multiDay ? (
          <span className="seg-sub">
            {" "}
            Day {dayIdx + 1} · {fmtShort(activeDate)}
          </span>
        ) : (
          " on this job"
        )}
        <span className="ms-state">
          {!dayCrew.length ? (
            <span className="missing-chip">
              <Icon name="alert" />
              {multiDay ? `Day ${dayIdx + 1} — nobody` : "None assigned"}
            </span>
          ) : (
            <AvatarStack people={dayCrew.map((c) => person(c.personId))} max={5} />
          )}
          <span className="chev">
            <Icon name="chevDown" />
          </span>
        </span>
      </summary>

      <div className="miss-body">
        {multiDay && (
          <p className="menu-scope-hint">
            {hasOverride
              ? `Custom crew for Day ${dayIdx + 1} — switch tabs above for the other days.`
              : `Using the job's default crew — removing someone here only changes Day ${dayIdx + 1}.`}
          </p>
        )}

        {dayCrew.length ? (
          <div className="check-list">
            {dayCrew.map((c, i) => {
              const p = person(c.personId);
              if (!p) return null;
              const off = offOn(p.id, multiDay ? [activeDate] : j.shootDays);
              return (
                <div className="check-item" key={`${c.personId}-${i}`}>
                  <span className="crew-role-tag">{c.role}</span>
                  <Avatar person={p} size="sm" />
                  <span>{p.name}</span>
                  <span className="ci-sub">
                    {off ? <span className="pill warn">Time off</span> : p.position}
                  </span>
                  {canCrew && (
                    <button
                      className="crew-remove"
                      aria-label={`Remove ${p.name}${multiDay ? ` from Day ${dayIdx + 1}` : ""}`}
                      title={`Remove${multiDay ? ` from Day ${dayIdx + 1}` : ""}`}
                      onClick={() =>
                        void mutate(
                          `/api/jobs/${j.id}/crew`,
                          { index: i, date: crewDate },
                          "DELETE",
                        )
                      }
                    >
                      <Icon name="x" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", paddingTop: 8 }}>
            Nobody booked{multiDay ? " for this day" : ""} yet.
          </p>
        )}

        {canCrew && (
          <>
            <div className="crew-add">
              <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
                {CREW_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                aria-label="Person"
                value={pick}
                disabled={!candidates.length}
                onChange={(e) => setChosen(e.target.value)}
              >
                {candidates.length ? (
                  candidates.map((p: Person) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {offOn(p.id, scopeDays) ? " — time off" : ""}
                    </option>
                  ))
                ) : (
                  <option value="">No one tagged {role}</option>
                )}
              </select>
              <button
                className="btn sm"
                type="button"
                disabled={!candidates.length}
                onClick={() => void add()}
              >
                <Icon name="plus" /> Add
              </button>
            </div>

            {multiDay && (
              <label className="menu-pick-all">
                <input
                  type="checkbox"
                  checked={allDays}
                  onChange={(e) => setAllDays(e.target.checked)}
                />{" "}
                Book for all {j.shootDays.length} days (uncheck for Day {dayIdx + 1} only)
              </label>
            )}
          </>
        )}
      </div>
    </details>
  );
}

/* ---------- menu ---------- */

function MenuBlock({
  job: j,
  dayIdx,
  activeDate,
  multiDay,
  dayMenu,
  menuDate,
  hasOverride,
  incomplete,
  canEdit,
}: {
  job: Job;
  dayIdx: number;
  activeDate: string;
  multiDay: boolean;
  dayMenu: string[];
  menuDate: string | null;
  hasOverride: boolean;
  incomplete: boolean;
  canEdit: boolean;
}) {
  const { ws, mutate, toast } = useWorkspace();
  const [tpl, setTpl] = useState("");
  const [applyAll, setApplyAll] = useState(false);
  const [item, setItem] = useState("");

  async function applyTemplate() {
    const t = ws.menus.find((m) => m.id === tpl);
    if (!t) return;
    const target = multiDay && !applyAll ? activeDate : null;
    const existing = target ? menuFor(j, target).length : j.menu.length;
    const scope = target
      ? `Day ${dayIdx + 1}`
      : multiDay
        ? `all ${j.shootDays.length} days`
        : "this job";

    if (existing || (!target && multiDay)) {
      const warning =
        !target && multiDay
          ? " Each day’s own menu will be replaced."
          : existing
            ? ` Its current ${existing} item${existing === 1 ? "" : "s"} will be replaced.`
            : "";
      if (!confirm(`Apply the "${t.name}" menu to ${scope}?${warning}`)) return;
    }

    await mutate(`/api/jobs/${j.id}/menu`, { items: t.items, date: target }, "PUT");
    toast(`"${t.name}" applied to ${scope}`, "menu");
  }

  return (
    <details className={`miss-block${incomplete ? " incomplete" : ""}`} open={!dayMenu.length}>
      <summary>
        <span className="ms-icon">
          <Icon name="menu" />
        </span>
        Menu
        {multiDay && (
          <span className="seg-sub">
            {" "}
            Day {dayIdx + 1} · {fmtShort(activeDate)}
          </span>
        )}
        <span className="ms-state">
          {!dayMenu.length ? (
            <span className="missing-chip">
              <Icon name="alert" />
              {multiDay ? `Day ${dayIdx + 1} not set` : "Not set"}
            </span>
          ) : (
            <span className="pill neutral">
              {dayMenu.length} item{dayMenu.length === 1 ? "" : "s"}
            </span>
          )}
          <span className="chev">
            <Icon name="chevDown" />
          </span>
        </span>
      </summary>

      <div className="miss-body">
        {multiDay && (
          <p className="menu-scope-hint">
            {hasOverride
              ? `Custom menu for Day ${dayIdx + 1} — switch tabs above to set the other days.`
              : `Using the job's default menu — any change here becomes Day ${dayIdx + 1}'s own menu.`}
          </p>
        )}

        {dayMenu.length ? (
          <div className="tag-row">
            {dayMenu.map((m, i) => (
              <span className="tag" key={`${m}-${i}`}>
                {m}
                {canEdit && (
                  <button
                    aria-label="Remove"
                    onClick={(e) => {
                      e.preventDefault();
                      void mutate(`/api/jobs/${j.id}/menu`, { index: i, date: menuDate }, "DELETE");
                    }}
                  >
                    <Icon name="x" />
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", paddingTop: 8 }}>
            Nothing on the menu yet{multiDay ? " for this day" : ""}.
          </p>
        )}

        {canEdit && ws.menus.length > 0 && (
          <>
            <div className="menu-pick">
              <select aria-label="Saved menu" value={tpl} onChange={(e) => setTpl(e.target.value)}>
                <option value="">Apply a saved menu…</option>
                {ws.menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.items.length})
                  </option>
                ))}
              </select>
              <button className="btn sm" type="button" onClick={() => void applyTemplate()}>
                <Icon name="check" /> Apply
              </button>
            </div>
            {multiDay && (
              <label className="menu-pick-all">
                <input
                  type="checkbox"
                  checked={applyAll}
                  onChange={(e) => setApplyAll(e.target.checked)}
                />{" "}
                Apply to all {j.shootDays.length} days (replaces each day&rsquo;s menu)
              </label>
            )}
          </>
        )}

        {canEdit && (
          <form
            className="tag-add"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!item.trim()) return;
              const text = item.trim();
              setItem("");
              await mutate(`/api/jobs/${j.id}/menu`, { item: text, date: menuDate });
            }}
          >
            <input
              type="text"
              placeholder={dayMenu.length ? "Add an extra item…" : "Or add items one by one…"}
              autoComplete="off"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
            <button className="btn sm" type="submit">
              <Icon name="plus" /> Add
            </button>
          </form>
        )}
      </div>
    </details>
  );
}

/* ---------- dietary flags for the booked crew ---------- */

function DietBlock({ crew }: { crew: CrewSlot[] }) {
  const { person } = useWorkspace();
  const flags = crew
    .map((c) => person(c.personId))
    .filter((p): p is Person => !!p && p.dietary.length > 0)
    .map((p) => `${firstName(p.name)}: ${p.dietary.join(", ")}`);

  if (!flags.length) return null;

  return (
    <details className="miss-block">
      <summary>
        <span className="ms-icon">
          <Icon name="alert" />
        </span>
        Crew dietary notes
        <span className="ms-state">
          <span className="pill pending">{flags.length}</span>
          <span className="chev">
            <Icon name="chevDown" />
          </span>
        </span>
      </summary>
      <div className="miss-body">
        <div className="check-list">
          {flags.map((f) => (
            <div className="check-item" key={f}>
              <span className="diet-flag">{f}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

/* ---------- per-day schedule ---------- */

function DayCard({
  job: j,
  date,
  dayIdx,
  info,
  canEdit,
}: {
  job: Job;
  date: string;
  dayIdx: number;
  info: DayInfo;
  canEdit: boolean;
}) {
  const { mutate, toast } = useWorkspace();

  const [form, setForm] = useState({
    callTime: String(dayVal(j, date, "callTime") || ""),
    wrapTime: String(dayVal(j, date, "wrapTime") || ""),
    headcount: String(dayVal(j, date, "headcount") ?? ""),
    location: String(dayVal(j, date, "location") || ""),
    notes: info.notes ?? "",
  });

  const usingDefaults = !Object.keys(info).some(
    (k) => k !== "menu" && k !== "crew" && info[k as keyof DayInfo] !== "" && info[k as keyof DayInfo] !== undefined && info[k as keyof DayInfo] !== null,
  );

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="day-card">
      <div className="day-card-head">
        {fmtLong(date)}
        {usingDefaults ? " · using job defaults" : ""}
      </div>

      {canEdit ? (
        <div className="day-form">
          <div className="field">
            <label>Call</label>
            <input type="time" value={form.callTime} onChange={set("callTime")} />
          </div>
          <div className="field">
            <label>Wrap (est.)</label>
            <input type="time" value={form.wrapTime} onChange={set("wrapTime")} />
          </div>
          <div className="field">
            <label>People on set</label>
            <input type="number" min={0} value={form.headcount} onChange={set("headcount")} />
          </div>
          <div className="field">
            <label>Location</label>
            <input type="text" value={form.location} onChange={set("location")} />
          </div>
          <div className="field wide">
            <label>Notes for this day</label>
            <input
              type="text"
              value={form.notes}
              onChange={set("notes")}
              placeholder="e.g. company move, night exteriors…"
            />
          </div>
          <button
            className="btn sm primary"
            type="button"
            style={{ justifySelf: "start" }}
            onClick={async () => {
              await mutate(`/api/jobs/${j.id}/day`, {
                date,
                callTime: form.callTime,
                wrapTime: form.wrapTime,
                headcount: form.headcount,
                location: form.location.trim(),
                notes: form.notes.trim(),
              });
              toast(`Day ${dayIdx + 1} saved`, "check");
            }}
          >
            <Icon name="check" /> Save day {dayIdx + 1}
          </button>
        </div>
      ) : (
        <div className="fact-grid" style={{ marginTop: 0 }}>
          <div className="fact">
            <div className="f-label">Call</div>
            <div className="f-value mono">{fmtTime12(dayVal(j, date, "callTime"))}</div>
          </div>
          <div className="fact">
            <div className="f-label">Wrap (est.)</div>
            <div className="f-value mono">{fmtTime12(dayVal(j, date, "wrapTime"))}</div>
          </div>
          <div className="fact">
            <div className="f-label">People on set</div>
            <div className="f-value mono">{dayVal(j, date, "headcount") || "—"}</div>
          </div>
          <div className="fact">
            <div className="f-label">Location</div>
            <div className="f-value">{dayVal(j, date, "location") || "—"}</div>
          </div>
          {info.notes && (
            <div className="fact wide">
              <div className="f-label">Day notes</div>
              <div className="f-value" style={{ fontWeight: 450, fontSize: 13 }}>
                {info.notes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
