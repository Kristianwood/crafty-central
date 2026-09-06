"use client";

/* ============================================================
   Crafty Central — Menus
   The menu library: build menus once, then apply them to any
   job from the job sheet (or when creating the job).
   Admins + moderators only.
   ============================================================ */

import { useState } from "react";
import type { Job, MenuTemplate } from "@/lib/types";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";

/* Two menus are "the same" when their items match in order, which
   is how a job is matched back to the template it was built from —
   jobs keep a copy, so there is no id to follow. */
const key = (items: string[] | undefined) => (items || []).join("|");

function usedCount(jobs: Job[], m: MenuTemplate): number {
  if (!m.items.length) return 0;
  const k = key(m.items);
  return jobs.filter(
    (j) =>
      key(j.menu) === k ||
      Object.values(j.dayInfo || {}).some(
        (d) => Array.isArray(d.menu) && key(d.menu) === k,
      ),
  ).length;
}

export default function MenusView() {
  const { ws, can, openModal } = useWorkspace();

  if (!can("editJob")) {
    return (
      <div className="empty view-enter">
        <Icon name="menu" />
        <div className="e-title">Admins and moderators only</div>
        <div className="e-sub">
          Menus are managed by the office — the one on your job shows up on the job sheet.
        </div>
      </div>
    );
  }

  const menus = ws.menus.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="view-enter">
      <div className="section-head">
        <div>
          <div className="section-title">Menu library</div>
          <div className="section-hint">
            Build a menu once, then apply it to any job from the job sheet. Jobs keep their own
            copy, so tweaking a saved menu never changes past jobs.
          </div>
        </div>
        <button className="btn primary" onClick={() => openModal(<MenuForm />)}>
          <Icon name="plus" /> New menu
        </button>
      </div>

      {menus.length ? (
        <div className="menu-grid stagger">
          {menus.map((m, i) => {
            const used = usedCount(ws.jobs, m);
            return (
              <div
                className="menu-card"
                key={m.id}
                style={{ "--i": i } as React.CSSProperties}
                onClick={() => openModal(<MenuForm menu={m} />)}
              >
                <div className="mc-head">
                  <span className="mc-icon">
                    <Icon name="menu" />
                  </span>
                  <div className="mc-title">
                    <span className="mc-name">{m.name}</span>
                    <span className="mc-count">
                      {m.items.length} item{m.items.length === 1 ? "" : "s"}
                      {used ? ` · on ${used} job${used === 1 ? "" : "s"}` : ""}
                    </span>
                  </div>
                  <span className="mc-edit">
                    <Icon name="edit" />
                  </span>
                </div>
                <ul className="mc-items">
                  {m.items.slice(0, 5).map((it, k) => (
                    <li key={k}>{it}</li>
                  ))}
                  {m.items.length > 5 && (
                    <li className="mc-more">+ {m.items.length - 5} more</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <Icon name="menu" />
          <div className="e-title">No menus yet</div>
          <div className="e-sub">
            Build your first menu — the crew sees it on every job you apply it to.
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <button className="btn primary" onClick={() => openModal(<MenuForm />)}>
              <Icon name="plus" /> Build a menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   New menu / edit menu
   ============================================================ */

function MenuForm({ menu }: { menu?: MenuTemplate }) {
  const { mutate, toast, closeModal } = useWorkspace();
  const [name, setName] = useState(menu?.name ?? "");
  /* Items are edited as text and only split on save, so a
     half-typed line is never dropped mid-edit. */
  const [text, setText] = useState((menu?.items ?? []).join("\n"));
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const items = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!trimmed || !items.length) {
      toast("A menu needs a name and at least one item", "alert");
      return;
    }
    setBusy(true);
    try {
      /* The API replaces the item list wholesale, so the whole
         list goes up every save. */
      await mutate("/api/menus", { id: menu?.id, name: trimmed, items });
      closeModal();
      toast(menu ? "Menu saved" : "Menu created — apply it from any job sheet", "check");
    } catch {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!menu) return;
    if (!confirm(`Delete the "${menu.name}" menu? Jobs it was applied to keep their items.`))
      return;
    setBusy(true);
    try {
      await mutate(`/api/menus/${menu.id}`, undefined, "DELETE");
      closeModal();
      toast("Menu deleted", "x");
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{menu ? "Edit menu" : "New menu"}</div>
          <div className="modal-sub">
            One item per line. Applying this menu to a job copies the items over.
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label>Menu name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Shoot Day"
          />
        </div>
        <div className="field">
          <label>
            Items <span style={{ fontWeight: 400, color: "var(--ink-3)" }}>(one per line)</span>
          </label>
          <textarea
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "Breakfast burritos\nEspresso + drip station\nHot lunch — protein + two sides\nAfternoon substantials"
            }
          />
        </div>
        <div className="modal-foot">
          {menu && (
            <button
              type="button"
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={onDelete}
              disabled={busy}
            >
              <Icon name="x" /> Delete
            </button>
          )}
          <button type="button" className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {menu ? "Save menu" : "Create menu"}
          </button>
        </div>
      </form>
    </>
  );
}
