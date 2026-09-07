/* ============================================================
   Crafty Central — the catalogue and kits

   catalog_items is the legend of products and services with a
   price on each; a kit is a named bundle of them with quantities.
   Dropping a kit onto an invoice copies its lines over (see
   kitLines in lib/domain.ts), so editing a kit later never
   changes an invoice that already used it.
   ============================================================ */

import { execute, query, transaction } from "../db";
import { uid } from "../domain";
import type { CatalogItem, CatalogKind, Kit } from "../types";

/* ---------- catalogue ---------- */

interface CatalogRow {
  id: string;
  name: string;
  kind: CatalogKind;
  unit: string;
  unit_price: string;
  description: string;
  is_active: number;
  position: number;
}

const toItem = (r: CatalogRow): CatalogItem => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  unit: r.unit,
  unitPrice: Number(r.unit_price),
  description: r.description,
  active: !!r.is_active,
});

export async function listCatalog(): Promise<CatalogItem[]> {
  const rows = await query<CatalogRow>("SELECT * FROM catalog_items ORDER BY kind, position, name");
  return rows.map(toItem);
}

export async function saveCatalogItem(input: Partial<CatalogItem>): Promise<CatalogItem> {
  const item: CatalogItem = {
    id: input.id || "ci-" + uid(),
    name: input.name || "",
    kind: input.kind === "service" ? "service" : "product",
    unit: input.unit || "each",
    unitPrice: Number(input.unitPrice) || 0,
    description: input.description || "",
    active: input.active ?? true,
  };
  await execute(
    `INSERT INTO catalog_items (id, name, kind, unit, unit_price, description, is_active)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), kind=VALUES(kind), unit=VALUES(unit),
       unit_price=VALUES(unit_price), description=VALUES(description), is_active=VALUES(is_active)`,
    [item.id, item.name, item.kind, item.unit, item.unitPrice, item.description, item.active ? 1 : 0],
  );
  return item;
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await execute("DELETE FROM catalog_items WHERE id = ?", [id]);
}

/* ---------- kits ---------- */

interface KitRow {
  id: string;
  name: string;
  description: string;
  position: number;
}

interface KitItemRow {
  kit_id: string;
  catalog_item_id: string;
  qty: string;
}

export async function listKits(): Promise<Kit[]> {
  const [kits, items] = await Promise.all([
    query<KitRow>("SELECT * FROM kits ORDER BY position, name"),
    query<KitItemRow>("SELECT kit_id, catalog_item_id, qty FROM kit_items ORDER BY kit_id, position, id"),
  ]);
  const byId = new Map<string, Kit>(
    kits.map((k) => [k.id, { id: k.id, name: k.name, description: k.description, items: [] }]),
  );
  for (const it of items) {
    byId.get(it.kit_id)?.items.push({ catalogItemId: it.catalog_item_id, qty: Number(it.qty) });
  }
  return [...byId.values()];
}

export async function saveKit(input: Partial<Kit>): Promise<Kit> {
  const kit: Kit = {
    id: input.id || "kit-" + uid(),
    name: input.name || "",
    description: input.description || "",
    items: (input.items || []).map((i) => ({ catalogItemId: i.catalogItemId, qty: Number(i.qty) || 1 })),
  };
  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO kits (id, name, description) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description)`,
      [kit.id, kit.name, kit.description],
    );
    await conn.execute("DELETE FROM kit_items WHERE kit_id = ?", [kit.id]);
    for (const [i, it] of kit.items.entries()) {
      await conn.execute(
        "INSERT INTO kit_items (kit_id, catalog_item_id, qty, position) VALUES (?,?,?,?)",
        [kit.id, it.catalogItemId, it.qty, i],
      );
    }
  });
  return kit;
}

export async function deleteKit(id: string): Promise<void> {
  await execute("DELETE FROM kits WHERE id = ?", [id]);
}
