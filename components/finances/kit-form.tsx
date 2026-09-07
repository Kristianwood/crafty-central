"use client";

/* ============================================================
   New kit / edit kit — a named bundle of catalogue items.

   Rows are edited as (item, qty) pairs and the total is quoted
   live through kitTotal(), the same helper the cards use, so the
   number you see while building is the number the card shows.
   Only active items are offered; an existing row that points at
   an item since retired keeps showing it, flagged, rather than
   silently jumping to something else.
   ============================================================ */

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import { kitTotal } from "@/lib/domain";
import { fmtMoney } from "@/lib/format";
import type { CatalogItem, Kit } from "@/lib/types";

interface Row {
  key: number;
  catalogItemId: string;
  qty: string;
}

const nextKey = (rows: Row[]) => rows.reduce((m, r) => Math.max(m, r.key), -1) + 1;

const itemLabel = (c: CatalogItem) => `${c.name} — ${fmtMoney(c.unitPrice)} / ${c.unit || "each"}`;

export function KitForm({ kit }: { kit?: Kit }) {
  const { ws, mutate, toast, closeModal } = useWorkspace();
  const active = ws.catalog.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name));

  const [name, setName] = useState(kit?.name ?? "");
  const [description, setDescription] = useState(kit?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    kit
      ? kit.items.map((it, i) => ({ key: i, catalogItemId: it.catalogItemId, qty: String(it.qty) }))
      : [{ key: 0, catalogItemId: active[0]?.id ?? "", qty: "1" }],
  );
  const [busy, setBusy] = useState(false);

  /* The kit as it stands, for the live total. kitTotal() skips rows
     whose item is gone, exactly as the card will. */
  const draft: Kit = {
    id: kit?.id ?? "",
    name,
    description,
    items: rows.map((r) => ({ catalogItemId: r.catalogItemId, qty: Number(r.qty) || 0 })),
  };
  const total = kitTotal(draft, ws.catalog);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => [...rs, { key: nextKey(rs), catalogItemId: active[0]?.id ?? "", qty: "1" }]);

  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Give the kit a name", "alert");
      return;
    }
    const known = new Set(ws.catalog.map((c) => c.id));
    const items = rows
      .filter((r) => known.has(r.catalogItemId))
      .map((r) => ({ catalogItemId: r.catalogItemId, qty: Number(r.qty) || 1 }));
    if (!items.length) {
      toast("A kit needs at least one catalogue item", "alert");
      return;
    }
    setBusy(true);
    try {
      /* The API replaces the item list wholesale, so the whole
         list goes up every save. */
      await mutate("/api/kits", { id: kit?.id, name: trimmed, description: description.trim(), items });
      closeModal();
      toast(kit ? "Kit saved" : "Kit created — add it to any draft invoice", "check");
    } catch {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!kit) return;
    if (!confirm(`Delete the "${kit.name}" kit? Invoices it was added to keep their lines.`)) return;
    setBusy(true);
    try {
      await mutate(`/api/kits/${kit.id}`, undefined, "DELETE");
      closeModal();
      toast("Kit deleted", "x");
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{kit ? "Edit kit" : "New kit"}</div>
          <div className="modal-sub">
            Adding a kit to an invoice copies its lines, so re-pricing it later never changes an
            invoice that already went out.
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label>Kit name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard shoot day"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this bundle is for — shown on the card, not on the invoice."
          />
        </div>

        <div className="field">
          <label>Items</label>
          {rows.length ? (
            <div className="kit-rows">
              {rows.map((r) => {
                const current = ws.catalog.find((c) => c.id === r.catalogItemId);
                const retired = current && !current.active;
                return (
                  <div className="kit-row" key={r.key}>
                    <select
                      value={r.catalogItemId}
                      onChange={(e) => setRow(r.key, { catalogItemId: e.target.value })}
                    >
                      {!current && <option value="">Item no longer in the catalogue — pick another</option>}
                      {retired && <option value={current.id}>{itemLabel(current)} (inactive)</option>}
                      {active.map((c) => (
                        <option key={c.id} value={c.id}>
                          {itemLabel(c)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={r.qty}
                      aria-label="Quantity"
                      onChange={(e) => setRow(r.key, { qty: e.target.value })}
                    />
                    <button
                      type="button"
                      className="crew-remove"
                      aria-label="Remove item"
                      onClick={() => removeRow(r.key)}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hint">No items yet — add at least one.</div>
          )}
          {active.length ? (
            <div>
              <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={addRow}>
                <Icon name="plus" /> Add item
              </button>
            </div>
          ) : (
            <div className="hint">
              Nothing active in the catalogue yet — add products or services first, then build the
              kit.
            </div>
          )}
        </div>

        <div className="kit-form-total">
          <span>Kit total, before HST</span>
          <b>{fmtMoney(total)}</b>
        </div>

        <div className="modal-foot">
          {kit && (
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
          <button type="submit" className="btn primary" disabled={busy || !ws.catalog.length}>
            {kit ? "Save kit" : "Create kit"}
          </button>
        </div>
      </form>
    </>
  );
}
