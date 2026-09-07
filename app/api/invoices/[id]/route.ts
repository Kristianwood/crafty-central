/* ============================================================
   Invoice status, and deleting a draft.

     PATCH { status: "sent" }   render the PDF, archive it, stamp
                                sent_at — from now on "the invoice
                                we sent" means that archived copy
     PATCH { status: "paid" }   stamp paid_at (a draft may be paid
                                straight off; it is archived first)
     PATCH { status: "draft" }  reopen a sent invoice: the archived
                                PDF is discarded and lines unfreeze
     DELETE                     drafts only

   Deleting the last invoice on a job puts the job back to wrapped,
   so "Create invoice" reappears on its sheet.
   ============================================================ */

import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { invoiceTotal } from "@/lib/domain";
import { fmtMoney } from "@/lib/format";
import { invoiceFilename, renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getJob, setJobStatus } from "@/lib/repo/jobs";
import {
  deleteInvoice,
  deleteInvoiceDocument,
  getInvoice,
  invoicesForJob,
  markInvoice,
  storeInvoiceDocument,
} from "@/lib/repo/invoices";
import { getSettings } from "@/lib/repo/misc";
import { notify } from "@/lib/repo/notifications";
import type { InvoiceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const me = await requirePermission("finances");
    const { id } = await params;
    const status = str((await body(req)).status) as InvoiceStatus;
    if (!STATUSES.includes(status)) bad("Unknown invoice status.");

    const inv = await getInvoice(id);
    if (!inv) bad("That invoice is gone.", 404);
    if (inv!.status === status) return { invoice: inv };

    const [job, settings] = await Promise.all([getJob(inv!.jobId), getSettings()]);

    if (status === "sent" || status === "paid") {
      // Archive what is going out. A sent invoice keeps the copy it
      // already has; a draft being paid directly gets one now so the
      // paperwork exists either way.
      if (!inv!.hasDocument) {
        const stamped = { ...inv!, status, sentAt: inv!.sentAt ?? new Date().toISOString() };
        const pdf = await renderInvoicePdf({ invoice: stamped, job, settings });
        await storeInvoiceDocument(inv!.id, invoiceFilename(inv!), pdf);
      }
      await markInvoice(id, status);
      if (status === "paid") {
        await notify(
          "admin",
          `${inv!.number} paid — ${fmtMoney(invoiceTotal(inv!, job ?? undefined, settings))} from ${
            inv!.billTo.name || job?.productionCompany || "the client"
          }. Marked by ${me.name}.`,
          "check",
        );
      }
    } else {
      // Back to draft: only from sent. A paid invoice is history.
      if (inv!.status === "paid") bad("A paid invoice cannot be reopened.", 409);
      await deleteInvoiceDocument(id);
      await markInvoice(id, "draft");
    }

    return { invoice: await getInvoice(id) };
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("finances");
    const { id } = await params;
    const inv = await getInvoice(id);
    if (!inv) return { ok: true };
    if (inv.status !== "draft") bad("Only a draft can be deleted. Reopen it first.", 409);

    await deleteInvoice(id);

    const job = await getJob(inv.jobId);
    if (job?.status === "invoiced" && !(await invoicesForJob(inv.jobId)).length) {
      await setJobStatus(inv.jobId, "wrapped");
    }
    return { ok: true };
  });
}
