/* Turn an enquiry into a held job, or wave it off. */

import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { todayISO } from "@/lib/domain";
import { newJobId, saveJob } from "@/lib/repo/jobs";
import { getSettings, listInquiries, setInquiryStatus } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("createJob");
    const { id } = await params;
    const action = str((await body(req)).action);

    if (action === "dismiss") {
      await setInquiryStatus(id, "dismissed");
      return { ok: true };
    }
    if (action !== "convert") bad("Convert it or dismiss it.");

    const inquiry = (await listInquiries()).find((i) => i.id === id);
    if (!inquiry) bad("That enquiry is gone.", 404);
    if (inquiry!.status !== "new") bad("That enquiry has already been dealt with.", 409);

    const settings = await getSettings();
    const contact = [inquiry!.email, inquiry!.phone].filter(Boolean).join(" · ");

    const job = await saveJob({
      id: newJobId(),
      productionName: "TBC — " + inquiry!.company,
      productionCompany: inquiry!.company,
      agency: "",
      pm: inquiry!.pm,
      producers: "",
      headcount: inquiry!.headcount,
      location: "",
      shootDays: inquiry!.shootDays.slice().sort(),
      callTime: "07:00",
      wrapTime: "19:00",
      status: "estimate",
      crew: [],
      menu: [],
      rates: { perHead: settings.perHeadDefault, truckDay: settings.truckDayDefault },
      notes:
        `From outreach form — ${inquiry!.intExt || "?"} · ${inquiry!.dayNight || "?"}.` +
        (contact ? ` Contact: ${contact}.` : "") +
        (inquiry!.notes ? ` "${inquiry!.notes}"` : ""),
      dayInfo: {},
      createdAt: todayISO(),
    });

    await setInquiryStatus(id, "converted");
    return { job };
  });
}
