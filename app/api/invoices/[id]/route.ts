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
import { invoiceTotal, todayISO } from "@/lib/domain";
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

    /* Paid is the end of the line. Walking one back to "sent" used to
       be accepted and cleared paid_at with it, so a paid invoice could
       quietly rejoin the outstanding column. */
    if (inv!.status === "paid") {
      bad("That invoice is paid. Its record does not go backwards.", 409);
    }

    const [job, settings] = await Promise.all([getJob(inv!.jobId), getSettings()]);

    if (status === "sent" || status === "paid") {
      /* Claim the transition first. Only then is it safe to archive:
         the lines cannot change underneath us afterwards, because a
         save is refused on anything that is no longer a draft. Doing
         it the other way round left a window where a save between the
         render and the status change produced an archive that did not
         match the invoice it was filed against. */
      const moved = await markInvoice(id, status, { from: inv!.status });
      if (!moved) bad("Someone else just changed that invoice. Have another look.", 409);

      // A sent invoice keeps the copy it already has; a draft paid
      // directly gets one now, so the paperwork exists either way.
      if (!inv!.hasDocument) {
        const committed = await getInvoice(id);
        if (committed) {
          const pdf = await renderInvoicePdf({ invoice: committed, job, settings });
          await storeInvoiceDocument(committed.id, invoiceFilename(committed), pdf);
        }
      }
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
      // Back to draft, which by here can only mean from sent — paid was
      // turned away above.
      const moved = await markInvoice(id, "draft", { from: inv!.status });
      if (!moved) bad("Someone else just changed that invoice. Have another look.", 409);
      await deleteInvoiceDocument(id);
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

    /* With its last invoice gone the job is no longer invoiced, and
       the status it had before is not recorded anywhere — so it is
       read off the calendar rather than assumed. A job that has
       already shot is wrapped; one still to come is confirmed, which
       is what it must have been to be billed in the first place. */
    const job = await getJob(inv.jobId);
    if (job?.status === "invoiced" && !(await invoicesForJob(inv.jobId)).length) {
      const lastDay = job.shootDays[job.shootDays.length - 1];
      await setJobStatus(inv.jobId, !lastDay || lastDay < todayISO() ? "wrapped" : "confirmed");
    }
    return { ok: true };
  });
}
