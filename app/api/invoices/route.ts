/* ============================================================
   Create or update an invoice from the builder.

   The body is the whole invoice — header, bill-to, and every
   line — and the lines are replaced wholesale, the same way a
   job's days are. Only drafts may be edited: once an invoice has
   gone out its lines are what the client was billed, full stop.
   Status changes go through PATCH /api/invoices/[id].
   ============================================================ */

import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { DEFAULT_TAX_RATE, addDays, todayISO, uid } from "@/lib/domain";
import { parseBillTo, parseLines } from "@/lib/invoice-input";
import { getJob, setJobStatus } from "@/lib/repo/jobs";
import { getInvoice, nextInvoiceNumber, saveInvoice } from "@/lib/repo/invoices";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("finances");
    const b = await body(req);

    const id = str(b.id);
    const existing = id ? await getInvoice(id) : null;
    if (id && !existing) bad("That invoice is gone.", 404);
    if (existing && existing.status !== "draft") {
      bad("That invoice has already gone out — its lines are frozen.", 409);
    }

    const jobId = existing?.jobId ?? str(b.jobId);
    const job = await getJob(jobId);
    if (!job) bad("Pick a job to invoice.", 404);

    const issuedOn = ISO_DATE.test(str(b.issuedOn)) ? str(b.issuedOn) : existing?.issuedOn ?? todayISO();
    const dueOn = ISO_DATE.test(str(b.dueOn)) ? str(b.dueOn) : existing?.dueOn ?? addDays(issuedOn, 30);
    if (dueOn < issuedOn) bad("The due date is before the issue date.");

    let taxRate = b.taxRate === undefined ? (existing?.taxRate ?? DEFAULT_TAX_RATE) : Number(b.taxRate);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) taxRate = DEFAULT_TAX_RATE;

    const lines = "lines" in b ? parseLines(b.lines) : (existing?.lines ?? []);
    if (!lines.length) bad("An invoice needs at least one line.");

    const invoice: Invoice = {
      id: existing?.id ?? "inv-" + uid(),
      jobId: job!.id,
      number: existing?.number ?? (await nextInvoiceNumber(issuedOn.slice(0, 4))),
      issuedOn,
      dueOn,
      status: "draft",
      taxRate,
      lines,
      notes: "notes" in b ? str(b.notes).slice(0, 2000) : (existing?.notes ?? ""),
      sentAt: null,
      paidAt: null,
      billTo: parseBillTo(
        b.billTo,
        existing?.billTo ?? { name: job!.productionCompany, address: "", email: "", attn: "" },
      ),
      hasDocument: false,
    };

    await saveInvoice(invoice);
    if (job!.status !== "invoiced") await setJobStatus(job!.id, "invoiced");
    return { invoice };
  });
}
