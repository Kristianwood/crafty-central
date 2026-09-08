"use client";

/* ============================================================
   The invoice, on its own page.

   Why this exists: every "PDF" button used to point a brand-new
   tab straight at /api/invoices/[id]/pdf. On a desktop browser
   the built-in viewer paints it, so it looked fine. On a phone
   there is no inline PDF viewer — the browser hands the bytes to
   the download manager and ABORTS the navigation, leaving the
   tab it just opened on about:blank. That is the "blank page"
   the office kept landing on, and it is worse in the installed
   PWA, where that empty view has no URL bar and no back button.

   So the buttons come here instead: a normal page the browser can
   always paint, showing the same document the PDF shows (the
   preview component below is the one lib/pdf/invoice-pdf.ts
   mirrors, block for block), with the file itself one tap away.
   A page never comes up blank; a raw PDF response sometimes does.
   ============================================================ */

import { use } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { InvoiceDoc } from "@/components/finances/invoice-doc";
import { serverToday } from "@/components/finances/invoice-pill";
import { useWorkspace } from "@/components/workspace-provider";
import { invoiceState } from "@/lib/domain";
import { fmtStamp } from "@/lib/format";

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ws, can } = useWorkspace();

  /* Crew and moderators are never sent the invoices at all, so one
     they cannot see reads the same here as one that is gone. */
  const invoice = ws.invoices.find((i) => i.id === id) ?? null;
  const job = invoice ? ws.jobs.find((j) => j.id === invoice.jobId) : undefined;

  if (!invoice) {
    return (
      <div className="empty view-enter">
        <Icon name="receipt" />
        <div className="e-title">{can("finances") ? "No such invoice" : "Admins only"}</div>
        <div className="e-sub">
          {can("finances")
            ? "It may have been deleted since this link was made."
            : "Financials are only visible to admin accounts."}
        </div>
        {can("finances") && (
          <Link className="btn" href="/finances?tab=invoices">
            <Icon name="chevLeft" /> Back to Finances
          </Link>
        )}
      </div>
    );
  }

  const archived = invoice.hasDocument;
  const state = invoiceState(invoice, serverToday(ws.now));

  return (
    <div className="view-enter inv-page">
      <div className="section-head">
        <div>
          <Link className="inv-page-back" href="/finances?tab=invoices">
            <Icon name="chevLeft" /> Finances
          </Link>
          <div className="section-title">{invoice.number}</div>
          <div className="section-hint">
            {job?.productionName ?? "Job no longer on the books"}
            {" — "}
            {archived
              ? `the copy that went out${invoice.sentAt ? ` on ${fmtStamp(invoice.sentAt)}` : ""}. The download is those exact bytes.`
              : state === "draft"
                ? "a draft. The download renders it as it stands right now."
                : "rendered from the record as it stands."}
          </div>
        </div>
        <a
          className="btn primary"
          href={`/api/invoices/${invoice.id}/pdf?download=1`}
          download
        >
          <Icon name="download" /> Download PDF
        </a>
      </div>

      <InvoiceDoc job={job} invoice={invoice} />
    </div>
  );
}
