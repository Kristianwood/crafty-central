"use client";

/* ============================================================
   The public enquiry form.

   Same form, same copy. What changed is where it writes: it used
   to put a document straight into Firestore from the browser, on
   the strength of a security rule that made `inquiries` the one
   publicly-writable collection. Now it posts to an API route that
   validates, caps and rate-limits it before it reaches MySQL.
   ============================================================ */

import { useState } from "react";
import { api } from "@/lib/client";
import { fmtLong } from "@/lib/format";
import { Icon } from "@/components/icons";

export default function OutreachForm() {
  const [days, setDays] = useState<string[]>([]);
  const [picker, setPicker] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [f, setF] = useState({
    company: "",
    pm: "",
    headcount: "",
    intExt: "INT + EXT",
    dayNight: "Day",
    email: "",
    phone: "",
    notes: "",
  });

  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  function addDay() {
    if (picker && !days.includes(picker)) setDays([...days, picker].sort());
    setPicker("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/inquiries", {
        body: {
          company: f.company.trim(),
          pm: f.pm.trim(),
          headcount: Number(f.headcount) || 0,
          intExt: f.intExt,
          dayNight: f.dayNight,
          shootDays: days,
          email: f.email.trim(),
          phone: f.phone.trim(),
          notes: f.notes.trim(),
        },
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send just now — give it another try in a minute.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="outreach-wrap">
      <div className="outreach-card">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="menu" />
          </div>
          <div className="brand-text">
            <span className="brand-name">Crafty</span>
            <span className="brand-sub">Craft Service · Toronto</span>
          </div>
        </div>

        {done ? (
          <div className="oc-done">
            <span className="big">
              <Icon name="check" strokeWidth={2.5} />
            </span>
            <h1 className="oc-title" style={{ marginTop: 0 }}>
              Got it — thanks!
            </h1>
            <p className="oc-sub" style={{ marginBottom: 0 }}>
              Your shoot details are with the Crafty team. We&rsquo;ll be in touch shortly to
              lock it in.
            </p>
          </div>
        ) : (
          <>
            <h1 className="oc-title">Tell us about your shoot</h1>
            <p className="oc-sub">
              A few quick details and we&rsquo;ll come back to you with availability and a
              number — usually same day.
            </p>

            <form onSubmit={onSubmit}>
              <div className="form-grid">
                <div className="field wide">
                  <label>Production company *</label>
                  <input
                    type="text"
                    required
                    placeholder="Who's producing"
                    value={f.company}
                    onChange={set("company")}
                  />
                </div>

                <div className="field">
                  <label>PM name</label>
                  <input
                    type="text"
                    placeholder="Production manager"
                    value={f.pm}
                    onChange={set("pm")}
                  />
                </div>

                <div className="field">
                  <label>Rough headcount *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="People on set"
                    inputMode="numeric"
                    value={f.headcount}
                    onChange={set("headcount")}
                  />
                </div>

                <div className="field">
                  <label>INT / EXT</label>
                  <select value={f.intExt} onChange={set("intExt")}>
                    <option>INT</option>
                    <option>EXT</option>
                    <option>INT + EXT</option>
                  </select>
                </div>

                <div className="field">
                  <label>Day / Night</label>
                  <select value={f.dayNight} onChange={set("dayNight")}>
                    <option>Day</option>
                    <option>Night</option>
                    <option>Both</option>
                  </select>
                </div>

                <div className="field wide">
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
                      + Add day
                    </button>
                  </div>
                  <div className="day-chips" style={{ marginTop: 8 }}>
                    {days.length ? (
                      days.map((d, i) => (
                        <span className="day-chip" key={d}>
                          {fmtLong(d)}
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => setDays(days.filter((_, k) => k !== i))}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        No days added yet.
                      </span>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label>Your email *</label>
                  <input
                    type="email"
                    required
                    placeholder="So we can get back to you"
                    autoComplete="email"
                    value={f.email}
                    onChange={set("email")}
                  />
                </div>

                <div className="field">
                  <label>Phone</label>
                  <input
                    type="tel"
                    placeholder="Optional"
                    autoComplete="tel"
                    value={f.phone}
                    onChange={set("phone")}
                  />
                </div>

                <div className="field wide">
                  <label>Anything else?</label>
                  <textarea
                    rows={3}
                    placeholder="Location, special requests, dietary-heavy cast…"
                    value={f.notes}
                    onChange={set("notes")}
                  />
                </div>
              </div>

              {error && <div className="auth-err">{error}</div>}

              <button
                type="submit"
                className="btn primary"
                disabled={busy}
                style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
              >
                {busy ? "Sending…" : "Send it over"}
              </button>
            </form>
          </>
        )}

        <div className="oc-foot">
          Crafty · food truck &amp; craft service for film — Toronto, ON
        </div>
      </div>
    </div>
  );
}
