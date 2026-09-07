"use client";

/* ============================================================
   "New invoice" — pick a job, draft from it, land in the builder.

   The draft comes from POST /api/jobs/[id]/invoice, the same
   call the job sheet's "Create invoice" makes, so an invoice
   starts identically whichever door it came through.
   ============================================================ */

import { useState } from "react";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { InvoiceEditor } from "@/components/invoice-editor";
import { useWorkspace } from "@/components/workspace-provider";
import { fmtDays, statusLabel } from "@/lib/format";
import type { Invoice } from "@/lib/types";

const lastDay = (days: string[]) => days[days.length - 1] ?? "";

export function NewInvoiceModal() {
  const { ws, mutate, toast, closeModal, openModal } = useWorkspace();
  const jobs = ws.jobs.slice().sort((a, b) => lastDay(b.shootDays).localeCompare(lastDay(a.shootDays)));
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const j = jobs.find((x) => x.id === jobId);
  const existing = ws.invoices.filter((i) => i.jobId === jobId);

  async function create() {
    if (!j) return;
    const again = existing.length
      ? ` It already has ${existing.map((i) => i.number).join(", ")}; this drafts another.`
      : "";
    if (
      !confirm(
        `Draft an invoice for "${j.productionName}"? It starts from the job's pricing and the job is marked invoiced.${again}`,
      )
    )
      return;
    setBusy(true);
    try {
      const out = await mutate<{ invoice: Invoice }>(`/api/jobs/${j.id}/invoice`);
      toast(`Invoice ${out.invoice.number} drafted`, "doc");
      openModal(<InvoiceEditor invoiceId={out.invoice.id} />);
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">New invoice</div>
          <div className="modal-sub">
            Pick the job. The draft opens in the builder with the job&apos;s pricing as its first
            lines.
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      {jobs.length ? (
        <>
          <div className="field">
            <label>Job</label>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} autoFocus>
              {jobs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.productionName} — {fmtDays(x.shootDays)} · {statusLabel(x.status)}
                </option>
              ))}
            </select>
            {j && (
              <div className="hint">
                {j.productionCompany || "No production company on the sheet"}
                {existing.length
                  ? ` · already invoiced: ${existing.map((i) => i.number).join(", ")}`
                  : ""}
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={closeModal}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={create} disabled={busy || !j}>
              <Icon name="doc" /> Draft invoice
            </button>
          </div>
        </>
      ) : (
        <Empty icon="briefcase" title="No jobs to invoice" sub="Add a job on the calendar first." />
      )}
    </>
  );
}
