"use client";

/* ============================================================
   New job / edit job.

   Same fields, same validation and the same day-chip picker as
   before. The one thing worth knowing: on an edit this sends the
   job's existing dayInfo back untouched, so per-day menus and
   crew survive a change to the job-level details.
   ============================================================ */

import { useState } from "react";
import { fmtLong } from "@/lib/format";
import type { Job } from "@/lib/types";
import { Icon } from "./icons";
import { useWorkspace } from "./workspace-provider";

interface Props {
  job?: Job | null;
  presetDate?: string | null;
}

export function JobForm({ job, presetDate }: Props) {
  const { ws, mutate, toast, closeModal } = useWorkspace();
  const s = ws.settings;

  const [days, setDays] = useState<string[]>(
    job ? job.shootDays.slice() : presetDate ? [presetDate] : [],
  );
  const [picker, setPicker] = useState("");
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    productionName: job?.productionName ?? "",
    productionCompany: job?.productionCompany ?? "",
    agency: job?.agency ?? "",
    pm: job?.pm ?? "",
    producers: job?.producers ?? "",
    headcount: job?.headcount ? String(job.headcount) : "",
    status: job?.status && job.status !== "invoiced" ? job.status : "estimate",
    /* Kept out of the select below: an invoiced job stays invoiced. */
    menuTpl: "",
    callTime: job?.callTime || "07:00",
    wrapTime: job?.wrapTime || "19:00",
    location: job?.location ?? "",
    perHead: String(job?.rates?.perHead ?? s.perHeadDefault),
    truckDay: String(job?.rates?.truckDay ?? s.truckDayDefault),
    notes: job?.notes ?? "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  function addDay() {
    if (picker && !days.includes(picker)) setDays([...days, picker].sort());
    setPicker("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, boolean> = {
      productionName: !f.productionName.trim(),
      productionCompany: !f.productionCompany.trim(),
      headcount: !(Number(f.headcount) > 0),
      days: days.length === 0,
    };
    setInvalid(bad);
    if (Object.values(bad).some(Boolean)) return;

    let menu = job?.menu ?? [];
    if (f.menuTpl) {
      const tpl = ws.menus.find((m) => m.id === f.menuTpl);
      if (tpl) menu = tpl.items.slice();
    }

    setBusy(true);
    try {
      await mutate("/api/jobs", {
        id: job?.id,
        productionName: f.productionName.trim(),
        productionCompany: f.productionCompany.trim(),
        agency: f.agency.trim(),
        pm: f.pm.trim(),
        producers: f.producers.trim(),
        headcount: Number(f.headcount),
        status: f.status,
        shootDays: days,
        callTime: f.callTime,
        wrapTime: f.wrapTime,
        location: f.location.trim(),
        rates: { perHead: Number(f.perHead) || 0, truckDay: Number(f.truckDay) || 0 },
        notes: f.notes.trim(),
        crew: job?.crew ?? [],
        menu,
        dayInfo: job?.dayInfo ?? {},
        createdAt: job?.createdAt,
      });
      closeModal();
      toast(job ? "Job updated" : "Job created — it is on the calendar", "check");
    } catch {
      setBusy(false);
    }
  }

  const fieldClass = (name: string) => `field${invalid[name] ? " invalid" : ""}`;

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{job ? "Edit job" : "New job"}</div>
          <div className="modal-sub">
            {job ? job.productionName : "It lands on the calendar the moment you save."}
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className={fieldClass("productionName") + " wide"}>
            <label>Production name</label>
            <input
              type="text"
              value={f.productionName}
              onChange={set("productionName")}
              placeholder={'e.g. Maple & Rye "First Pour"'}
            />
            <span className="err">Give the production a name.</span>
          </div>

          <div className={fieldClass("productionCompany")}>
            <label>Production company</label>
            <input
              type="text"
              value={f.productionCompany}
              onChange={set("productionCompany")}
              placeholder="Who's producing"
              list="companyOptions"
              autoComplete="off"
            />
            <datalist id="companyOptions">
              {ws.companies.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <span className="hint">
              Pick a company from the directory and its billing address flows onto the invoice.
            </span>
            <span className="err">Required.</span>
          </div>

          <div className="field">
            <label>
              Agency <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(optional)</span>
            </label>
            <input type="text" value={f.agency} onChange={set("agency")} />
          </div>

          <div className="field">
            <label>Production manager</label>
            <input type="text" value={f.pm} onChange={set("pm")} placeholder="PM's name" />
          </div>

          <div className="field">
            <label>Producer(s)</label>
            <input
              type="text"
              value={f.producers}
              onChange={set("producers")}
              placeholder="Comma-separated if several"
            />
          </div>

          <div className={fieldClass("headcount")}>
            <label>People on set</label>
            <input
              type="number"
              min={1}
              value={f.headcount}
              onChange={set("headcount")}
              placeholder="e.g. 45"
            />
            <span className="err">How many mouths to feed?</span>
          </div>

          <div className="field">
            <label>Status</label>
            {job?.status === "invoiced" ? (
              /* The select has no "invoiced" option and the server
                 will not accept a downgrade, so say so rather than
                 offering a choice that does nothing. */
              <>
                <div className="role-static">
                  <span className="pill invoiced">
                    <span className="pip" />
                    Invoiced
                  </span>
                </div>
                <span className="hint">
                  This job has been invoiced. Reopen its invoice from Finances to change that.
                </span>
              </>
            ) : (
              <select value={f.status} onChange={set("status")}>
                <option value="estimate">Hold</option>
                <option value="confirmed">Confirmed</option>
                <option value="wrapped">Wrapped</option>
              </select>
            )}
          </div>

          {ws.menus.length > 0 && (
            <div className="field wide">
              <label>
                Menu{" "}
                <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>
                  (default for every shoot day — fine-tune per day on the job sheet)
                </span>
              </label>
              <select value={f.menuTpl} onChange={set("menuTpl")}>
                <option value="">
                  {job?.menu?.length ? `Keep current menu (${job.menu.length} items)` : "Decide later"}
                </option>
                {ws.menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.items.length} items
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={fieldClass("days") + " wide"}>
            <label>Shoot days</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date"
                style={{ flex: 1 }}
                value={picker}
                onChange={(e) => setPicker(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDay();
                  }
                }}
              />
              <button type="button" className="btn" onClick={addDay}>
                <Icon name="plus" /> Add day
              </button>
            </div>
            <div className="day-chips" style={{ marginTop: 8 }}>
              {days.length ? (
                days.map((d, i) => (
                  <span className="day-chip" key={d}>
                    {fmtLong(d)}
                    <button
                      type="button"
                      aria-label="Remove day"
                      onClick={() => setDays(days.filter((_, k) => k !== i))}
                    >
                      <Icon name="x" />
                    </button>
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>No days added yet.</span>
              )}
            </div>
            <span className="err">Add at least one shoot day.</span>
          </div>

          <div className="field">
            <label>Call time</label>
            <input type="time" value={f.callTime} onChange={set("callTime")} />
          </div>

          <div className="field">
            <label>Wrap (est.)</label>
            <input type="time" value={f.wrapTime} onChange={set("wrapTime")} />
          </div>

          <div className="field wide">
            <label>Location</label>
            <input
              type="text"
              value={f.location}
              onChange={set("location")}
              placeholder="Studio / address"
            />
          </div>

          <div className="field">
            <label>Rate per head / day</label>
            <input type="number" min={0} step={0.5} value={f.perHead} onChange={set("perHead")} />
          </div>

          <div className="field">
            <label>Truck day rate</label>
            <input type="number" min={0} step={25} value={f.truckDay} onChange={set("truckDay")} />
          </div>

          <div className="field wide">
            <label>Notes</label>
            <textarea
              value={f.notes}
              onChange={set("notes")}
              placeholder="Allergies on the client side, load-in quirks, power, parking…"
            />
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : job ? "Save changes" : "Create job"}
          </button>
        </div>
      </form>
    </>
  );
}
