"use client";

/* ============================================================
   Finances overview — the money at a glance, the estimates
   priced live off their job sheets, and the latest invoices.

   The one piece of local state is which estimate has its
   document open, keyed "est:"+jobId as the old view keyed it.
   Estimates are quoted through the same pseudo-invoice the
   preview uses, so the row, the preview and the invoice that
   "Confirm" eventually leads to all agree to the cent.
   ============================================================ */

import { Fragment, useState } from "react";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { InvoiceEditor } from "@/components/invoice-editor";
import { useWorkspace } from "@/components/workspace-provider";
import { invoiceDaysOverdue, invoiceSubtotal, invoiceTotal, totalCovers } from "@/lib/domain";
import { fmtMoney, fmtRange, fmtShort, statSizeClass } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { InvoiceDoc, estimateFor } from "./invoice-doc";
import { InvoiceStatePill, newestFirst, serverToday, track } from "./invoice-pill";

/* The stagger animation reads --i off each child. */
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

const whole = (n: number) => fmtMoney(n).replace(".00", "");

const DAY_MS = 86400_000;

export function OverviewTab({ onShowInvoices }: { onShowInvoices: () => void }) {
  const { ws, job, mutate, toast, openModal } = useWorkspace();
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const today = serverToday(ws.now);

  const total = (inv: Invoice) => invoiceTotal(inv, job(inv.jobId), ws.settings);
  const sum = (list: Invoice[]) => list.reduce((s, i) => s + total(i), 0);

  const tracked = track(ws.invoices, today);
  const unpaid = tracked.filter((r) => r.state === "sent" || r.state === "overdue").map((r) => r.inv);
  const overdue = tracked.filter((r) => r.state === "overdue").map((r) => r.inv);
  const outstanding = sum(unpaid);
  const overdueTotal = sum(overdue);

  /* Paid in the last 30 days by the server's clock; an invoice paid
     before paidAt existed has no stamp and is counted rather than
     quietly dropped. */
  const cutoff = ws.now - 30 * DAY_MS;
  const collectedList = tracked
    .filter((r) => r.state === "paid" && (!r.inv.paidAt || Date.parse(r.inv.paidAt) >= cutoff))
    .map((r) => r.inv);
  const collected = sum(collectedList);

  const estimates = ws.jobs.filter((j) => j.status === "estimate");
  const quotes = estimates.map((j) => {
    const est = estimateFor(j, ws.companies);
    return { j, est, sub: invoiceSubtotal(est, j, ws.settings), tot: invoiceTotal(est, j, ws.settings) };
  });
  const pipeline = quotes.reduce((s, q) => s + q.sub, 0);

  const recent = track(newestFirst(ws.invoices).slice(0, 5), today);

  /* A click anywhere on an estimate row toggles its document, except
     on the row's own Confirm button. */
  const toggle = (key: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setOpenDoc((cur) => (cur === key ? null : key));
  };

  async function confirmJob(id: string) {
    try {
      await mutate(`/api/jobs/${id}`, { status: "confirmed" }, "PATCH");
      toast("Estimate confirmed — job is live", "check");
    } catch {
      /* mutate() has already toasted the reason */
    }
  }

  return (
    <>
      <div className="stat-row stagger">
        <div className={`stat-cell ${outstanding > 0 ? "tint-clay" : ""}`.trim()} style={stagger(0)}>
          <div className="stat-label">Outstanding</div>
          <div className={`stat-value ${statSizeClass(whole(outstanding))}`.trim()}>{whole(outstanding)}</div>
          <div className="stat-sub">
            {unpaid.length} unpaid · {overdue.length} overdue
          </div>
        </div>
        <div className={`stat-cell ${overdue.length ? "tint-clay" : ""}`.trim()} style={stagger(1)}>
          <div className="stat-label">Overdue</div>
          <div className={`stat-value ${statSizeClass(whole(overdueTotal))}`.trim()}>{whole(overdueTotal)}</div>
          <div className="stat-sub">
            {overdue.length
              ? `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} past due`
              : "Nothing past due"}
          </div>
        </div>
        <div className="stat-cell tint-olive" style={stagger(2)}>
          <div className="stat-label">Collected · 30 days</div>
          <div className={`stat-value ${statSizeClass(whole(collected))}`.trim()}>{whole(collected)}</div>
          <div className="stat-sub up">
            {collectedList.length} paid invoice{collectedList.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="stat-cell" style={stagger(3)}>
          <div className="stat-label">Estimate pipeline</div>
          <div className={`stat-value ${statSizeClass(whole(pipeline))}`.trim()}>{whole(pipeline)}</div>
          <div className="stat-sub">
            {estimates.length} open estimate{estimates.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="section-head">
        <div>
          <div className="section-title">Estimates</div>
          <div className="section-hint">
            Built live from the job sheet — headcount × per-head rate × days, plus the truck. Click a
            row to preview the document.
          </div>
        </div>
      </div>

      {quotes.length ? (
        <div className="fin-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Production</th>
                <th>Days</th>
                <th className="num">Covers</th>
                <th className="num">Subtotal</th>
                <th className="num">With HST</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quotes.map(({ j, sub, tot }) => {
                const key = "est:" + j.id;
                return (
                  <Fragment key={j.id}>
                    <tr className="clickable" onClick={toggle(key)}>
                      <td>
                        <strong>{j.productionName}</strong>
                        <span className="fin-sub">{j.productionCompany}</span>
                      </td>
                      <td className="fin-mono">
                        {j.shootDays.length
                          ? fmtRange(j.shootDays[0], j.shootDays[j.shootDays.length - 1])
                          : "—"}
                      </td>
                      <td className="num">{totalCovers(j)} covers</td>
                      <td className="num">{fmtMoney(sub)}</td>
                      <td className="num fin-total">{fmtMoney(tot)}</td>
                      <td className="fin-actions-cell">
                        <button className="btn sm" onClick={() => void confirmJob(j.id)}>
                          <Icon name="check" /> Confirm
                        </button>
                      </td>
                    </tr>
                    {openDoc === key && (
                      <tr className="fin-doc-row">
                        <td colSpan={6}>
                          <InvoiceDoc job={j} invoice={null} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon="doc"
          title="No open estimates"
          sub='Jobs saved with status "Estimate" show up here priced out.'
        />
      )}

      <div className="section-head">
        <div>
          <div className="section-title">Recent invoices</div>
          <div className="section-hint">The latest five. Click one to open it.</div>
        </div>
        {ws.invoices.length > 0 && (
          <button className="text-btn" onClick={onShowInvoices}>
            All invoices →
          </button>
        )}
      </div>

      {recent.length ? (
        <div className="fin-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Production</th>
                <th>Due</th>
                <th className="num">Total</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(({ inv, state }) => {
                const j = job(inv.jobId);
                const days = invoiceDaysOverdue(inv, today);
                return (
                  <tr
                    key={inv.id}
                    className="clickable"
                    onClick={() => openModal(<InvoiceEditor invoiceId={inv.id} />)}
                  >
                    <td className="fin-mono">{inv.number}</td>
                    <td>
                      <strong>{j?.productionName ?? "Job no longer on the books"}</strong>
                      {inv.billTo.name && <span className="fin-sub">{inv.billTo.name}</span>}
                    </td>
                    <td className="fin-mono">
                      {fmtShort(inv.dueOn)}
                      {state === "overdue" && (
                        <span className="fin-overdue">
                          {" "}
                          · {days} day{days === 1 ? "" : "s"} overdue
                        </span>
                      )}
                      {state === "sent" && days < 0 && (
                        <span className="fin-due-in">
                          {" "}
                          · due in {-days} day{days === -1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                    <td className="num fin-total">{fmtMoney(total(inv))}</td>
                    <td>
                      <span className="fin-pills">
                        <InvoiceStatePill state={state} />
                        {inv.hasDocument && <span className="pill neutral">PDF archived</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon="doc"
          title="No invoices yet"
          sub='Open a wrapped job and hit "Create invoice", or start one from the Invoices tab.'
        />
      )}
    </>
  );
}
