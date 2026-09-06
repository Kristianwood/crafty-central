import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { fmtRange } from "@/lib/format";
import { getTimeOff, setTimeOffStatus } from "@/lib/repo/misc";
import { notify } from "@/lib/repo/notifications";
import type { TimeOffStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("approveTimeOff");
    const { id } = await params;
    const status = str((await body(req)).status) as TimeOffStatus;
    if (status !== "approved" && status !== "denied") bad("Approve it or deny it.");

    const request = await getTimeOff(id);
    if (!request) bad("That request is gone.", 404);

    await setTimeOffStatus(id, status);
    await notify(
      "person:" + request!.personId,
      `Your time-off request (${fmtRange(request!.start, request!.end)}) was ${status}.`,
      status === "approved" ? "check" : "x",
    );
    return { ok: true };
  });
}
