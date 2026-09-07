/* Draft an invoice for a job and mark the job invoiced.

   The draft starts with the job's own pricing as its lines —
   covers × per-head and the truck by the day — and the billing
   address of the production company on file snapshotted into the
   bill-to block. The builder (POST /api/invoices) takes it from
   there: kits, extra lines, notes. */

import { bad, handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { DEFAULT_TAX_RATE, addDays, defaultInvoiceLines, todayISO, uid } from "@/lib/domain";
import { getJob, setJobStatus } from "@/lib/repo/jobs";
import { nextInvoiceNumber, saveInvoice } from "@/lib/repo/invoices";
import { findCompanyByName, getSettings } from "@/lib/repo/misc";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("finances");
    const { id } = await params;
    const job = await getJob(id);
    if (!job) bad("That job is gone.", 404);

    const [settings, company] = await Promise.all([
      getSettings(),
      findCompanyByName(job!.productionCompany),
    ]);
    const today = todayISO();
    const attn = [job!.pm && `${job!.pm} (PM)`, job!.producers].filter(Boolean).join(" · ");

    const invoice: Invoice = {
      id: "inv-" + uid(),
      jobId: id,
      number: await nextInvoiceNumber(today.slice(0, 4)),
      issuedOn: today,
      dueOn: addDays(today, 30),
      status: "draft",
      taxRate: DEFAULT_TAX_RATE,
      lines: defaultInvoiceLines(job!, settings),
      notes: "",
      sentAt: null,
      paidAt: null,
      billTo: {
        name: company?.name ?? job!.productionCompany,
        address: company?.billingAddress ?? "",
        email: company?.email ?? "",
        attn,
      },
      hasDocument: false,
    };

    await saveInvoice(invoice);
    await setJobStatus(id, "invoiced");
    return { invoice };
  });
}
