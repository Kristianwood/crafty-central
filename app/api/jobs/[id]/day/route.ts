/* Per-day schedule overrides. An empty string clears an override
   and puts that field back on the job default. */

import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { setDayInfo } from "@/lib/repo/job-edits";
import type { DayInfo } from "@/lib/types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;
    const b = await body(req);
    const date = str(b.date);
    if (!date) bad("Which day?");

    const patch: Partial<DayInfo> = {};
    if ("callTime" in b) patch.callTime = str(b.callTime);
    if ("wrapTime" in b) patch.wrapTime = str(b.wrapTime);
    if ("location" in b) patch.location = str(b.location);
    if ("notes" in b) patch.notes = str(b.notes);
    if ("headcount" in b) {
      const n = Number(b.headcount);
      patch.headcount = Number.isFinite(n) && n > 0 ? Math.trunc(n) : "";
    }

    return { job: await setDayInfo(id, date, patch) };
  });
}
