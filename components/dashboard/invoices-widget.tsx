"use client";

/* ============================================================
   Invoice tracking — what is owed, what is waiting, what is
   still a draft.

   Only rendered for people with the finances permission; for
   everyone else the workspace does not even carry invoices, so
   this would have nothing to show. State and totals come from
   lib/domain so the numbers here match the finances page to the
   cent.
   ============================================================ */

import Link from "next/link";
import { Icon } from "@/components/icons";
import { Empty } from "@/components/empty";
import { useWorkspace } from "@/components/workspace-provider";
import {
  invoiceDaysOverdue,
  invoiceState,
  invoiceTotal,
  iso,
  type InvoiceState,
} from "@/lib/domain";
import { fmtMoney, fmtShort } from "@/lib/format";
import type { Invoice } from "@/lib/types";

/** How many rows fit before the page is the better place to look. */
const MAX_ROWS = 6;

const PILL: Record<InvoiceState, string> = {
  overdue: "warn",
  sent: "pending",
  paid: "paid",
  draft: "neutral",
};
const STATE_LABEL: Record<InvoiceState, string> = {
  overdue: "Overdue",
  sent: "Sent",
  paid: "Paid",
  draft: "Draft",
};
/** Overdue first, then sent, then drafts; paid ones are done. */
const ORDER: Record<InvoiceState, number> = { overdue: 0, sent: 1, draft: 2, paid: 3 };

interface Row {
  inv: Invoice;
  state: InvoiceState;
  total: number;
  /** Days past due; only meaningful when state is overdue. */
  late: number;
}

export function InvoicesWidget() {
  const { ws, can, job } = useWorkspace();
  if (!can("finances")) return null;

  /* The server's clock, not the browser's: a tablet whose date has
     drifted must not disagree with Finances about what is overdue. */
  const T = iso(new Date(ws.now));
  const rows: Row[] = ws.invoices.map((inv) => ({
    inv,
    state: invoiceState(inv, T),
    total: invoiceTotal(inv, job(inv.jobId), ws.settings),
    late: invoiceDaysOverdue(inv, T),
  }));

  const overdue = rows.filter((r) => r.state === "overdue");
  const sent = rows.filter((r) => r.state === "sent");
  const drafts = rows.filter((r) => r.state === "draft");
  const sum = (xs: Row[]) => xs.reduce((s, r) => s + r.total, 0);

  const shown = rows
    .filter((r) => r.state !== "paid")
    .sort(
      (a, b) =>
        ORDER[a.state] - ORDER[b.state] ||
        (a.state === "overdue" ? b.late - a.late : a.inv.dueOn.localeCompare(b.inv.dueOn)),
    )
    .slice(0, MAX_ROWS);

  return (
    <>
      <div className="inv-minis">
        <div className={`inv-mini ${overdue.length ? "clay" : ""}`.trim()}>
          <span className="im-label">Overdue</span>
          <span className="im-value">{overdue.length}</span>
          <span className="im-sub">{fmtMoney(sum(overdue))}</span>
        </div>
        <div className="inv-mini">
          <span className="im-label">Awaiting payment</span>
          <span className="im-value">{sent.length}</span>
          <span className="im-sub">{fmtMoney(sum(sent))}</span>
        </div>
        <div className="inv-mini">
          <span className="im-label">Drafts</span>
          <span className="im-value">{drafts.length}</span>
          <span className="im-sub">not yet sent</span>
        </div>
      </div>

      {shown.length ? (
        <div className="inv-list">
          {shown.map(({ inv, state, total, late }) => (
            <div className="inv-row" key={inv.id}>
              <span className="ir-num">{inv.number}</span>
              <span className="ir-name">{job(inv.jobId)?.productionName ?? "—"}</span>
              <span className={`ir-due ${state === "overdue" ? "late" : ""}`.trim()}>
                {state === "overdue"
                  ? `${late} day${late === 1 ? "" : "s"} overdue`
                  : `Due ${fmtShort(inv.dueOn)}`}
              </span>
              <span className="ir-total">{fmtMoney(total)}</span>
              <span className={`pill ${PILL[state]}`}>{STATE_LABEL[state]}</span>
              <Link
                className="ir-pdf"
                href={`/invoices/${inv.id}`}
                title="Open PDF"
                aria-label={`Open PDF for ${inv.number}`}
              >
                <Icon name="doc" />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon="receipt"
          title={ws.invoices.length ? "Nothing open" : "No invoices yet"}
          sub={
            ws.invoices.length
              ? "Every invoice has been paid."
              : "Draft one from a wrapped job on the finances page."
          }
        />
      )}

      <Link href="/finances?tab=invoices" className="dw-more">
        Open finances →
      </Link>
    </>
  );
}
