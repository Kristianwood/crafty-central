/* Create or update a whole job. */

import { bad, body, handle, int, str, strArray } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { todayISO } from "@/lib/domain";
import { fmtRange } from "@/lib/format";
import { getJob, newJobId, saveJob } from "@/lib/repo/jobs";
import { notify } from "@/lib/repo/notifications";
import { getSettings } from "@/lib/repo/misc";
import type { DayInfo, Job, JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: JobStatus[] = ["estimate", "confirmed", "wrapped", "invoiced"];

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("createJob");
    const b = await body(req);

    const name = str(b.productionName);
    if (!name) bad("A job needs a production name.");

    const shootDays = strArray(b.shootDays).sort();
    if (!shootDays.length) bad("A job needs at least one shoot day.");

    const settings = await getSettings();
    const id = str(b.id);
    const isNew = !id;
    const before = id ? await getJob(id) : null;

    /* "Invoiced" is terminal, and the job form does not offer it — so
       a save that came from that form carries whatever the form last
       had, which used to knock an invoiced job back to a hold. Its
       money would then be counted twice: once as an outstanding
       invoice and again in the estimate pipeline, with "Create
       invoice" armed to make a second one. An edit changes the job's
       details, never the fact that it has been billed. */
    let status = STATUSES.includes(b.status as JobStatus)
      ? (b.status as JobStatus)
      : "estimate";
    if (before?.status === "invoiced") status = "invoiced";

    const job: Job = {
      id: id || newJobId(),
      productionName: name,
      productionCompany: str(b.productionCompany),
      agency: str(b.agency),
      pm: str(b.pm),
      producers: str(b.producers),
      headcount: int(b.headcount),
      location: str(b.location),
      shootDays,
      callTime: str(b.callTime),
      wrapTime: str(b.wrapTime),
      status,
      crew: Array.isArray(b.crew)
        ? (b.crew as { role?: unknown; personId?: unknown }[])
            .filter((c) => str(c.personId))
            .map((c) => ({ role: str(c.role, "Assist"), personId: str(c.personId) }))
        : [],
      menu: strArray(b.menu),
      rates: {
        perHead: b.rates && typeof b.rates === "object" && "perHead" in b.rates
          ? Number((b.rates as { perHead: unknown }).perHead) || settings.perHeadDefault
          : settings.perHeadDefault,
        truckDay: b.rates && typeof b.rates === "object" && "truckDay" in b.rates
          ? Number((b.rates as { truckDay: unknown }).truckDay) || settings.truckDayDefault
          : settings.truckDayDefault,
      },
      notes: str(b.notes),
      dayInfo: (b.dayInfo && typeof b.dayInfo === "object"
        ? (b.dayInfo as Record<string, DayInfo>)
        : {}),
      createdAt: str(b.createdAt) || todayISO(),
      ...(b.sample ? { sample: true } : {}),
    };

    const saved = await saveJob(job);

    if (isNew) {
      await notify(
        "all",
        `New job created: ${saved.productionName} (${fmtRange(
          saved.shootDays[0],
          saved.shootDays[saved.shootDays.length - 1],
        )}).`,
        "briefcase",
      );
    }

    return { job: saved };
  });
}
