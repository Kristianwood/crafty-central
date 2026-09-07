"use client";

/* ============================================================
   The document preview — what the PDF shows, on screen.

   One component covers an estimate (no invoice yet) and an
   invoice at any stage. An estimate is run through the very same
   pricing helpers as a pseudo-invoice with no lines of its own,
   so invoiceLines() falls back to the job's default lines and the
   preview quotes exactly what "Create invoice" will draft. The
   layout mirrors lib/pdf/invoice-pdf.ts block for block: header,
   bill-to beside the production, lines, totals, payment line,
   notes.
   ============================================================ */

import { Fragment } from "react";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import {
  DEFAULT_TAX_RATE,
  invoiceLines,
  invoiceState,
  invoiceSubtotal,
  invoiceTax,
  invoiceTotal,
  lineAmount,
} from "@/lib/domain";
import { fmtDays, fmtMoney, fmtShort } from "@/lib/format";
import type { Company, Invoice, Job } from "@/lib/types";
import { serverToday } from "./invoice-pill";

/* Jobs store the production company as free text, so match the way
   store.js did: trimmed and case-insensitive. */
export function companyByName(companies: Company[], name: string): Company | undefined {
  const n = (name || "").trim().toLowerCase();
  return n ? companies.find((c) => c.name.trim().toLowerCase() === n) : undefined;
}

/**
 * An estimate, shaped as the invoice it would become: a draft with
 * no lines, so the domain prices it from the job, at the rate every
 * new invoice starts on, billed to the company on file.
 */
export function estimateFor(job: Job, companies: Company[]): Invoice {
  const co = companyByName(companies, job.productionCompany);
  const attn = [job.pm && `${job.pm} (PM)`, job.producers].filter(Boolean).join(" · ");
  return {
    id: "est:" + job.id,
    jobId: job.id,
    number: "",
    issuedOn: "",
    dueOn: "",
    status: "draft",
    taxRate: DEFAULT_TAX_RATE,
    lines: [],
    notes: "",
    sentAt: null,
    paidAt: null,
    billTo: {
      name: co?.name ?? job.productionCompany,
      address: co?.billingAddress ?? "",
      email: co?.email ?? "",
      attn,
    },
    hasDocument: false,
  };
}

/** 2 → "2", 2.5 → "2.5" — quantities and percentages without a trailing .00. */
export const trimNumber = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

export function InvoiceDoc({ job, invoice }: { job: Job | undefined; invoice: Invoice | null }) {
  const { ws } = useWorkspace();
  if (!invoice && !job) return null;

  const doc = invoice ?? estimateFor(job!, ws.companies);
  const isEstimate = !invoice;
  const state = invoiceState(doc, serverToday(ws.now));
  const lines = invoiceLines(doc, job, ws.settings);
  const subtotal = invoiceSubtotal(doc, job, ws.settings);
  const tax = invoiceTax(doc, job, ws.settings);
  const total = invoiceTotal(doc, job, ws.settings);
  const billName = doc.billTo.name || job?.productionCompany || "—";

  const facts: [string, string][] = [];
  if (job?.shootDays.length) facts.push(["Shoot days", fmtDays(job.shootDays)]);
  if (job?.location) facts.push(["Location", job.location]);
  if (job?.pm) facts.push(["Production manager", job.pm]);
  if (job?.agency) facts.push(["Agency", job.agency]);

  return (
    <div className="doc">
      <div className="doc-head">
        <div>
          <div className="dh-brand">Crafty</div>
          <div className="dh-tag">Craft service &amp; catering · Toronto ON</div>
        </div>
        <div className="dh-meta">
          {isEstimate ? (
            <span className="dh-kind">ESTIMATE</span>
          ) : (
            <>
              <span className={`dh-kind ${state === "draft" ? "" : "live"}`.trim()}>
                {state === "draft" ? "DRAFT INVOICE" : "INVOICE"}
              </span>
              <br />
              {doc.number}
              <br />
              Issued {fmtShort(doc.issuedOn)} · Due {fmtShort(doc.dueOn)}
              {doc.sentAt && (
                <>
                  <br />
                  Sent {fmtShort(doc.sentAt.slice(0, 10))}
                </>
              )}
              {doc.paidAt && (
                <>
                  <br />
                  Paid {fmtShort(doc.paidAt.slice(0, 10))}
                </>
              )}
              {(state === "paid" || state === "overdue") && (
                <>
                  <br />
                  <span className={`doc-stamp ${state}`}>{state.toUpperCase()}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="doc-parties">
        <div className="doc-billto">
          <div className="db-label">Bill to</div>
          <div className="db-body">
            <strong>{billName}</strong>
            <br />
            {doc.billTo.address ? (
              doc.billTo.address.split("\n").map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && <br />}
                  {line}
                </Fragment>
              ))
            ) : (
              <span className="db-warn">
                <Icon name="alert" /> No billing address — add {billName} under Directory →
                Production companies.
              </span>
            )}
            {doc.billTo.email && (
              <>
                <br />
                <span className="doc-email">{doc.billTo.email}</span>
              </>
            )}
            {doc.billTo.attn && (
              <>
                <br />
                <span style={{ color: "var(--ink-2)" }}>Attn: {doc.billTo.attn}</span>
              </>
            )}
          </div>
        </div>

        <div className="doc-billto">
          <div className="db-label">Production</div>
          <div className="db-body doc-facts">
            <strong>{job?.productionName ?? "—"}</strong>
            {facts.map(([k, v]) => (
              <Fragment key={k}>
                <br />
                <span>{k}: </span>
                {v}
              </Fragment>
            ))}
          </div>
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
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description || "—"}</td>
              <td className="num">
                {trimNumber(l.qty)}
                {l.unit ? ` ${l.unit}` : ""}
              </td>
              <td className="num">{fmtMoney(l.unitPrice)}</td>
              <td className="num">{fmtMoney(lineAmount(l))}</td>
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={4} style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
                No line items.
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={3} style={{ textAlign: "right", color: "var(--ink-2)" }}>
              Subtotal
            </td>
            <td className="num">{fmtMoney(subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3} style={{ textAlign: "right", color: "var(--ink-2)" }}>
              HST ({trimNumber(doc.taxRate * 100)}%)
            </td>
            <td className="num">{fmtMoney(tax)}</td>
          </tr>
          <tr className="total">
            <td colSpan={3} style={{ textAlign: "right" }}>
              {isEstimate ? "Estimated total" : state === "paid" ? "Total (paid)" : "Total due"}
            </td>
            <td className="num">{fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>

      {!isEstimate && (
        <div className="doc-pay">
          {state === "paid" && doc.paidAt
            ? `Paid ${fmtShort(doc.paidAt.slice(0, 10))}. Thank you.`
            : `Payment due ${fmtShort(doc.dueOn)} · e-transfer or cheque payable to Crafty.`}
        </div>
      )}

      {doc.notes.trim() && (
        <div className="doc-notes">
          <div className="db-label">Notes</div>
          {doc.notes.trim()}
        </div>
      )}
    </div>
  );
}
