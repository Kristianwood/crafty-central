"use client";

/* ============================================================
   Finances (admin only) — estimates priced live off the job
   sheet, the invoice list, and the document preview.

   The one piece of state is which document is expanded, keyed
   the way the old view keyed it: an invoice id, or "est:"+jobId
   for an estimate. Clicking the open row closes it again.
   ============================================================ */

import { Fragment, useState } from "react";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import { invoiceTotal, jobSubtotal, totalCovers } from "@/lib/domain";
import { fmtMoney, fmtRange, fmtShort } from "@/lib/format";
import type { Company, Invoice, Job } from "@/lib/types";

/* The stagger animation reads --i off each child. */
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

/* Estimates have no invoice to carry a rate, so they are quoted at
   the same default invoiceTotal() falls back to. */
const ESTIMATE_TAX_RATE = 0.13;

/* Jobs store the production company as free text, so match the way
   store.js did: trimmed and case-insensitive. */
function companyByName(companies: Company[], name: string): Company | undefined {
  const n = (name || "").trim().toLowerCase();
  return n ? companies.find((c) => c.name.trim().toLowerCase() === n) : undefined;
}

export default function FinancesView() {
  const { ws, can, job, mutate, toast } = useWorkspace();
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  /* The route is admin-gated by the shell too, but the view kept its
     own message and it is the one a demoted account would land on. */
  if (!can("finances")) {
    return (
      <div className="empty view-enter">
        <Icon name="finances" />
        <div className="e-title">Admins only</div>
        <div className="e-sub">Financials are only visible to admin accounts.</div>
      </div>
    );
  }

  const jobs = ws.jobs;
  const invoices = ws.invoices.slice().reverse();
  const estimates = jobs.filter((j) => j.status === "estimate");
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const outstanding = unpaid.reduce((s, i) => s + invoiceTotal(i, job(i.jobId), ws.settings), 0);
  const collected = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + invoiceTotal(i, job(i.jobId), ws.settings), 0);
  const pipeline = estimates.reduce((s, j) => s + jobSubtotal(j, ws.settings), 0);

  /* A click anywhere on a row toggles its document, except on the
     row's own action button. */
  const toggle = (key: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setOpenDoc((cur) => (cur === key ? null : key));
  };

  async function markPaid(id: string) {
    await mutate(`/api/invoices/${id}`, { status: "paid" }, "PATCH");
    toast("Invoice marked paid", "check");
  }

  async function confirmJob(id: string) {
    await mutate(`/api/jobs/${id}`, { status: "confirmed" }, "PATCH");
    toast("Estimate confirmed — job is live", "check");
  }

  return (
    <div className="view-enter">
      <div className="stat-row stagger">
        <div className={`stat-cell ${outstanding > 0 ? "tint-clay" : ""}`} style={stagger(0)}>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{fmtMoney(outstanding).replace(".00", "")}</div>
          <div className="stat-sub">
            {unpaid.length} unpaid invoice{unpaid.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="stat-cell tint-olive" style={stagger(1)}>
          <div className="stat-label">Collected · 30 days</div>
          <div className="stat-value">{fmtMoney(collected).replace(".00", "")}</div>
          <div className="stat-sub up">marked paid</div>
        </div>
        <div className="stat-cell" style={stagger(2)}>
          <div className="stat-label">Estimate pipeline</div>
          <div className="stat-value">{fmtMoney(pipeline).replace(".00", "")}</div>
          <div className="stat-sub">
            {estimates.length} open estimate{estimates.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="stat-cell" style={stagger(3)}>
          <div className="stat-label">HST rate</div>
          <div className="stat-value">
            13<span className="unit">%</span>
          </div>
          <div className="stat-sub">Ontario</div>
        </div>
      </div>

      <div className="section-head">
        <div>
          <div className="section-title">Estimates</div>
          <div className="section-hint">
            Built live from the job sheet — headcount × per-head rate × days, plus the truck.
          </div>
        </div>
      </div>

      {estimates.length ? (
        <table className="fin-table">
          <thead>
            <tr>
              <th>Production</th>
              <th>Days</th>
              <th className="num">Covers</th>
              <th className="num">Subtotal</th>
              <th className="num">With HST</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((j) => {
              const sub = jobSubtotal(j, ws.settings);
              const key = "est:" + j.id;
              return (
                <Fragment key={j.id}>
                  <tr className="clickable" onClick={toggle(key)}>
                    <td>
                      <strong>{j.productionName}</strong>
                      <br />
                      <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
                        {j.productionCompany}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>
                      {fmtRange(j.shootDays[0], j.shootDays[j.shootDays.length - 1])}
                    </td>
                    <td className="num">{totalCovers(j)} covers</td>
                    <td className="num">{fmtMoney(sub)}</td>
                    <td className="num fin-total">{fmtMoney(sub * (1 + ESTIMATE_TAX_RATE))}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn sm" onClick={() => void confirmJob(j.id)}>
                        <Icon name="check" /> Confirm
                      </button>
                    </td>
                  </tr>
                  {openDoc === key && (
                    <tr>
                      <td colSpan={6}>
                        <Doc job={j} invoice={null} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <Icon name="doc" />
          <div className="e-title">No open estimates</div>
          <div className="e-sub">Jobs saved with status &quot;Estimate&quot; show up here priced out.</div>
        </div>
      )}

      <div className="section-head">
        <div>
          <div className="section-title">Invoices</div>
          <div className="section-hint">Click a row to preview the document.</div>
        </div>
      </div>

      {invoices.length ? (
        <table className="fin-table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Production</th>
              <th>Issued</th>
              <th>Due</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const j = job(inv.jobId);
              if (!j) return null;
              return (
                <Fragment key={inv.id}>
                  <tr className="clickable" onClick={toggle(inv.id)}>
                    <td style={{ fontFamily: "var(--mono)" }}>{inv.number}</td>
                    <td>
                      <strong>{j.productionName}</strong>
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>
                      {fmtShort(inv.issuedOn)}
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>
                      {fmtShort(inv.dueOn)}
                    </td>
                    <td className="num fin-total">{fmtMoney(invoiceTotal(inv, j, ws.settings))}</td>
                    <td>
                      <span
                        className={`pill ${
                          inv.status === "paid"
                            ? "paid"
                            : inv.status === "sent"
                              ? "pending"
                              : "neutral"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {inv.status !== "paid" && (
                        <button className="btn sm" onClick={() => void markPaid(inv.id)}>
                          <Icon name="check" /> Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                  {openDoc === inv.id && (
                    <tr>
                      <td colSpan={7}>
                        <Doc job={j} invoice={inv} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <Icon name="doc" />
          <div className="e-title">No invoices yet</div>
          <div className="e-sub">Open a wrapped job and hit &quot;Create invoice&quot;.</div>
        </div>
      )}
    </div>
  );
}

/* ============ Document preview (estimate or invoice) ============ */

function Doc({ job: j, invoice: inv }: { job: Job; invoice: Invoice | null }) {
  const { ws } = useWorkspace();
  const co = companyByName(ws.companies, j.productionCompany);
  const attn = [j.pm && `${j.pm} (PM)`, j.producers].filter(Boolean).join(" · ");

  /* jobSubtotal() treats a dayless job as one day; quote the same. */
  const days = j.shootDays.length || 1;
  const perHead = j.rates?.perHead ?? ws.settings.perHeadDefault;
  const truck = j.rates?.truckDay ?? ws.settings.truckDayDefault;
  const covers = totalCovers(j);
  const catering = covers * perHead;
  const sub = jobSubtotal(j, ws.settings);
  /* Derived rather than recomputed, so the lines always add up to
     the subtotal the rest of the app quotes. */
  const truckTotal = sub - catering;
  const total = inv ? invoiceTotal(inv, j, ws.settings) : sub * (1 + ESTIMATE_TAX_RATE);
  const tax = total - sub;

  return (
    <div className="doc">
      <div className="doc-head">
        <div>
          <div className="dh-brand">Crafty</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            Craft service &amp; catering · Toronto ON
          </div>
        </div>
        <div className="dh-meta">
          {inv ? (
            <>
              {inv.number}
              <br />
              Issued {fmtShort(inv.issuedOn)} · Due {fmtShort(inv.dueOn)}
            </>
          ) : (
            "ESTIMATE"
          )}
        </div>
      </div>

      <div className="doc-billto">
        <div className="db-label">Bill to</div>
        <div className="db-body">
          <strong>{j.productionCompany}</strong>
          <br />
          {co?.billingAddress ? (
            co.billingAddress.split("\n").map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </Fragment>
            ))
          ) : (
            <span className="db-warn">
              <Icon name="alert" /> No billing address on file — add {j.productionCompany} under
              Directory → Production companies.
            </span>
          )}
          {co?.email && (
            <>
              <br />
              <span style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{co.email}</span>
            </>
          )}
          {attn && (
            <>
              <br />
              <span style={{ color: "var(--ink-2)" }}>Attn: {attn}</span>
            </>
          )}
        </div>
      </div>

      <table>
        <tbody>
          <tr>
            <th>Line item</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
          <tr>
            <td>Full craft service — {j.productionName}</td>
            <td className="num">{covers} covers</td>
            <td className="num">{fmtMoney(perHead)}</td>
            <td className="num">{fmtMoney(catering)}</td>
          </tr>
          <tr>
            <td>Truck &amp; crew day rate</td>
            <td className="num">{days}d</td>
            <td className="num">{fmtMoney(truck)}</td>
            <td className="num">{fmtMoney(truckTotal)}</td>
          </tr>
          <tr>
            <td colSpan={3} style={{ textAlign: "right", color: "var(--ink-2)" }}>
              Subtotal
            </td>
            <td className="num">{fmtMoney(sub)}</td>
          </tr>
          <tr>
            <td colSpan={3} style={{ textAlign: "right", color: "var(--ink-2)" }}>
              HST (13%)
            </td>
            <td className="num">{fmtMoney(tax)}</td>
          </tr>
          <tr className="total">
            <td colSpan={3} style={{ textAlign: "right" }}>
              Total
            </td>
            <td className="num">{fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
