import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { fmtRange } from "@/lib/format";
import { deleteJob, getJob, setJobStatus } from "@/lib/repo/jobs";
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

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;
    await deleteJob(id);
    return { ok: true };
  });
}
