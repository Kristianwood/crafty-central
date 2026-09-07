/* ============================================================
   Small shared bits for the finance screens: the state pill an
   invoice wears everywhere, and the two orderings the lists
   agree on. Pure — no hooks — so both tabs and the editor can
   lean on them without caring who renders first.
   ============================================================ */

import { invoiceState, iso, type InvoiceState } from "@/lib/domain";
import type { Invoice } from "@/lib/types";

/* One pill class per state; the classes themselves are app.css's. */
const PILL_CLASS: Record<InvoiceState, string> = {
  draft: "neutral",
  sent: "pending",
  overdue: "warn",
  paid: "paid",
};

export const stateLabel = (s: InvoiceState): string => s.charAt(0).toUpperCase() + s.slice(1);

export function InvoiceStatePill({ state }: { state: InvoiceState }) {
  return <span className={`pill ${PILL_CLASS[state]}`}>{stateLabel(state)}</span>;
}

/** Today by the server's clock, so a stale tab never ages an invoice early. */
export const serverToday = (now: number): string => iso(new Date(now));

/** Newest first: by issue date, then by number within a day. */
export const newestFirst = (invoices: Invoice[]): Invoice[] =>
  invoices
    .slice()
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.number.localeCompare(a.number));

/** An invoice paired with where it is in its life, for list rows. */
export interface TrackedInvoice {
  inv: Invoice;
  state: InvoiceState;
}

export const track = (invoices: Invoice[], today: string): TrackedInvoice[] =>
  invoices.map((inv) => ({ inv, state: invoiceState(inv, today) }));
