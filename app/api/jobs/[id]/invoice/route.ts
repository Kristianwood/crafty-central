/* Draft an invoice for a job and mark the job invoiced. */

import { bad, handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { addDays, todayISO, uid } from "@/lib/domain";
import { getJob, setJobStatus } from "@/lib/repo/jobs";
import { invoiceCount, saveInvoice } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("finances");
    const { id } = await params;
    const job = await getJob(id);
    if (!job) bad("That job is gone.", 404);

    const n = (await invoiceCount()) + 41;
    const today = todayISO();
    const invoice = await saveInvoice({
      id: "inv-" + uid(),
      jobId: id,
      number: `CR-${today.slice(0, 4)}-0${n}`,
      issuedOn: today,
      dueOn: addDays(today, 30),
      status: "draft",
      taxRate: 0.13,
    });

    await setJobStatus(id, "invoiced");
    return { invoice };
  });
}
