"use client";

/* ============================================================
   Invoice tracking — every invoice, filtered by where it is in
   its life, with the next step on each row.

   Nothing about state is decided here: invoiceState() says
   whether a sent invoice is overdue, invoiceDaysOverdue() by how
   much, and the actions offered follow from that alone.
   ============================================================ */

import Link from "next/link";
import { useState } from "react";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { InvoiceEditor } from "@/components/invoice-editor";
import { useWorkspace } from "@/components/workspace-provider";
import { invoiceDaysOverdue, invoiceTotal, type InvoiceState } from "@/lib/domain";
import { fmtMoney, fmtShort } from "@/lib/format";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { InvoiceStatePill, newestFirst, serverToday, track } from "./invoice-pill";
import { NewInvoiceModal } from "./new-invoice-modal";

type Filter = "all" | InvoiceState;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
];

export function InvoicesTab() {
  const { ws, job, mutate, toast, openModal } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const today = serverToday(ws.now);

  const all = track(newestFirst(ws.invoices), today);
  const counts: Record<Filter, number> = { all: all.length, draft: 0, sent: 0, overdue: 0, paid: 0 };
  all.forEach((r) => counts[r.state]++);
  const rows = filter === "all" ? all : all.filter((r) => r.state === filter);

  const open = (inv: Invoice) => openModal(<InvoiceEditor invoiceId={inv.id} />);

  /* Every status change is the same shape: ask, PATCH, say so.
     mutate() toasts a server refusal itself, so a failure is quiet
     here rather than an unhandled rejection. */
  async function setStatus(inv: Invoice, status: InvoiceStatus, ask: string, done: string, icon: string) {
    if (!confirm(ask)) return;
    try {
      await mutate(`/api/invoices/${inv.id}`, { status }, "PATCH");
      toast(done, icon);
    } catch {
      /* already toasted */
    }
  }

  const markSent = (inv: Invoice) =>
    setStatus(
      inv,
      "sent",
      `Mark ${inv.number} as sent? The PDF is archived exactly as it is now and the lines lock.`,
      `Invoice ${inv.number} sent — PDF archived`,
      "send",
    );

  const markPaid = (inv: Invoice) =>
    setStatus(
      inv,
      "paid",
      `Mark ${inv.number} as paid? A paid invoice cannot be reopened.`,
      `${inv.number} marked paid`,
      "check",
    );

  const reopen = (inv: Invoice) =>
    setStatus(
      inv,
      "draft",
      `Reopen ${inv.number} as a draft? The archived PDF is discarded and the lines unlock.`,
      `${inv.number} is a draft again`,
      "refresh",
    );

  /* A click anywhere on a row opens the editor, except on the row's
     own buttons and links. */
  const rowClick = (inv: Invoice) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    open(inv);
  };

  return (
    <>
      <div className="section-head">
        <div>
          <div className="section-title">Invoices</div>
          <div className="section-hint">
            Click a row to open it. Drafts can be edited; once sent, the lines lock and the PDF is
            kept exactly as it went out.
          </div>
        </div>
        <button className="btn primary" onClick={() => openModal(<NewInvoiceModal />)}>
          <Icon name="plus" /> New invoice
        </button>
      </div>

      <div className="fin-filters" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`fin-filter ${filter === f.id ? "active" : ""}`.trim()}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="cnt">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {rows.length ? (
        <div className="fin-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Production</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="num">Total</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, state }) => {
                const j = job(inv.jobId);
                const late = state === "overdue" ? invoiceDaysOverdue(inv, today) : 0;
                return (
                  <tr key={inv.id} className="clickable" onClick={rowClick(inv)}>
                    <td className="fin-mono">{inv.number}</td>
                    <td>
                      <strong>{j?.productionName ?? "Job no longer on the books"}</strong>
                      {(inv.billTo.name || j?.productionCompany) && (
                        <span className="fin-sub">{inv.billTo.name || j?.productionCompany}</span>
                      )}
                    </td>
                    <td className="fin-mono">{fmtShort(inv.issuedOn)}</td>
                    <td className="fin-mono">
                      {fmtShort(inv.dueOn)}
                      {late > 0 && (
                        <span className="fin-overdue">
                          {" "}
                          · {late} day{late === 1 ? "" : "s"} overdue
                        </span>
                      )}
                    </td>
                    <td className="num fin-total">{fmtMoney(invoiceTotal(inv, j, ws.settings))}</td>
                    <td>
                      <InvoiceStatePill state={state} />
                    </td>
                    <td className="fin-actions-cell">
                      <div className="fin-actions">
                        <button className="btn sm" onClick={() => open(inv)}>
                          <Icon name="edit" /> Open
                        </button>
                        <Link
                          className="btn sm"
                          href={`/invoices/${inv.id}`}
                          title={inv.hasDocument ? "The PDF as sent" : "PDF, rendered now"}
                        >
                          <Icon name="doc" /> PDF{inv.hasDocument ? " · as sent" : ""}
                        </Link>
                        {state === "draft" && (
                          <button className="btn sm" onClick={() => void markSent(inv)}>
                            <Icon name="send" /> Mark sent
                          </button>
                        )}
                        {(state === "sent" || state === "overdue") && (
                          <>
                            <button className="btn sm" onClick={() => void markPaid(inv)}>
                              <Icon name="check" /> Mark paid
                            </button>
                            <button className="btn sm" onClick={() => void reopen(inv)}>
                              <Icon name="refresh" /> Reopen
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : all.length ? (
        <Empty
          icon="doc"
          title={`Nothing ${filter === "draft" ? "in draft" : filter}`}
          sub="Try another filter."
        />
      ) : (
        <Empty
          icon="doc"
          title="No invoices yet"
          sub='Hit "New invoice", or open a wrapped job and choose "Create invoice".'
        />
      )}
    </>
  );
}
