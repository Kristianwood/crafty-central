import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { fmtRange } from "@/lib/format";
import { deleteJob, getJob, setJobStatus } from "@/lib/repo/jobs";
import { invoicesForJob } from "@/lib/repo/invoices";
import { notify } from "@/lib/repo/notifications";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATUSES: JobStatus[] = ["estimate", "confirmed", "wrapped", "invoiced"];

/** Status changes only — the whole-job save is POST /api/jobs. */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;
    const b = await body(req);
    const status = str(b.status) as JobStatus;
    if (!STATUSES.includes(status)) bad("Unknown status.");

    const job = await getJob(id);
    if (!job) bad("That job is gone.", 404);
    if (job!.status === status) return { job };

    const was = job!.status;
    await setJobStatus(id, status);

    if (was === "estimate" && status === "confirmed") {
      const d = job!.shootDays;
      await notify(
        "all",
        `${job!.productionName} is confirmed (${fmtRange(d[0], d[d.length - 1])}).`,
        "check",
      );
    }
    return { job: { ...job!, status } };
  });
}

/**
 * Delete a job. The foreign keys cascade, so this also takes the
 * job's invoices, their lines and the PDFs archived against them —
 * which is right for a job that was never billed and quite wrong for
 * one that was. An invoice that has gone out is the record of what a
 * client was charged, so a job carrying one is not deleted by
 * whoever can edit jobs; it is turned away here with a reason.
 */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;

    const issued = (await invoicesForJob(id)).filter((inv) => inv.status !== "draft");
    if (issued.length) {
      const numbers = issued.map((inv) => inv.number).join(", ");
      bad(
        `This job has been invoiced (${numbers}). Delete the invoice first, or leave the job where it is — ` +
          "an invoice that has gone out is the only record of what was charged.",
        409,
      );
    }

    await deleteJob(id);
    return { ok: true };
  });
}
