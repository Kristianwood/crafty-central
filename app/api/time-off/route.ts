/* Anyone can ask for time off; only their own. */

import { bad, body, handle, str } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { todayISO, uid } from "@/lib/domain";
import { fmtRange } from "@/lib/format";
import { notify } from "@/lib/repo/notifications";
import { saveTimeOff } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = await body(req);
    const start = str(b.start);
    const end = str(b.end) || start;

    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) bad("Pick a start and end date.");
    if (end < start) bad("The end date is before the start date.");

    const request = await saveTimeOff({
      id: "to-" + uid(),
      personId: me.id,
      start,
      end,
      reason: str(b.reason),
      status: "pending",
      createdAt: todayISO(),
    });

    await notify(
      "moderator",
      `${me.name} requested time off (${fmtRange(start, end)}).`,
      "palm",
    );
    return { request };
  });
}
