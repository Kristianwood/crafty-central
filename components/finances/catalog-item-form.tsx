"use client";

/* ============================================================
   Add / edit one catalogue item — a priced product or service.

   The price is kept as the typed string until save so a half-
   typed "12." is never snapped to 12 under the cursor; the
   server rounds to cents. Deleting an item pulls it out of every
   kit that used it, but invoices keep their lines — they are
   copies, and the confirm says so.
   ============================================================ */

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import type { CatalogItem, CatalogKind } from "@/lib/types";

export function CatalogItemForm({ item }: { item?: CatalogItem }) {
  const { ws, mutate, toast, closeModal } = useWorkspace();

  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<CatalogKind>(item?.kind ?? "product");
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [unitPrice, setUnitPrice] = useState(item ? String(item.unitPrice) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);

  const usedBy = item ? ws.kits.filter((k) => k.items.some((it) => it.catalogItemId === item.id)) : [];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const price = Number(unitPrice);
    if (!trimmed) {
      toast("Give the item a name", "alert");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast("The price needs to be a number, zero or more", "alert");
      return;
    }
    setBusy(true);
    try {
      await mutate("/api/catalog", {
        id: item?.id,
        name: trimmed,
        kind,
        unit: unit.trim() || "each",
        unitPrice: price,
        description: description.trim(),
        active,
      });
      closeModal();
      toast(item ? "Catalogue item saved" : `${trimmed} added to the catalogue`, "check");
    } catch {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!item) return;
    if (
      !confirm(
        `Delete "${item.name}" from the catalogue? Kits that use it lose that line; past invoices are untouched.`,
      )
    )
      return;
    setBusy(true);
    try {
      await mutate(`/api/catalog/${item.id}`, undefined, "DELETE");
      closeModal();
      toast("Catalogue item deleted", "x");
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{item ? "Edit item" : "Add to the catalogue"}</div>
          <div className="modal-sub">
            {item
              ? usedBy.length
                ? `In ${usedBy.length} kit${usedBy.length === 1 ? "" : "s"}: ${usedBy
                    .map((k) => k.name)
                    .join(", ")}.`
                : "Not in any kit yet."
              : "A product or service you can drop onto an invoice, on its own or inside a kit."}
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className="field wide">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Espresso station"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as CatalogKind)}>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div className="field">
            <label>Unit</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="each · day · hour · cover"
            />
          </div>
          <div className="field">
            <label>Unit price</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="field">
            <label>Availability</label>
            <label className="cat-active">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active — offered in the kit and invoice pickers
            </label>
          </div>
          <div className="field wide">
            <label>Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the client gets — shown under the name in the catalogue, not on the invoice."
            />
          </div>
        </div>

        <div className="modal-foot">
          {item && (
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
            {item ? "Save item" : "Add item"}
          </button>
        </div>
      </form>
    </>
  );
}
