/* ============================================================
   Parsing an invoice body from the builder.

   Shared by the routes that accept invoice lines. Untrusted input:
   every field is coerced, capped and checked here so the repo only
   ever sees a well-formed Invoice.
   ============================================================ */

import { bad, str } from "./api";
import type { BillTo, InvoiceLine } from "./types";

const MAX_LINES = 100;

const money = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
};

export function parseLines(raw: unknown): InvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoiceLine[] = [];
  for (const l of raw.slice(0, MAX_LINES)) {
    if (!l || typeof l !== "object") continue;
    const o = l as Record<string, unknown>;
    const description = str(o.description).slice(0, 255);
    if (!description) continue;
    const qty = money(o.qty, 1);
    const unitPrice = money(o.unitPrice, 0);
    if (qty < 0 || unitPrice < 0) bad("Quantities and rates cannot be negative.");
    out.push({
      description,
      qty,
      unit: str(o.unit).slice(0, 40),
      unitPrice,
      catalogItemId: str(o.catalogItemId) || null,
      kitId: str(o.kitId) || null,
    });
  }
  return out;
}

export function parseBillTo(raw: unknown, fallback: BillTo): BillTo {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  return {
    name: str(o.name, fallback.name).slice(0, 190),
    address: str(o.address, fallback.address).slice(0, 500),
    email: str(o.email, fallback.email).slice(0, 190),
    attn: str(o.attn, fallback.attn).slice(0, 255),
  };
}
