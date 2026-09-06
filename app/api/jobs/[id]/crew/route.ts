import { bad, body, handle, int, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { CREW_ROLES } from "@/lib/types";
import { addCrew, removeCrew } from "@/lib/repo/job-edits";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("assignCrew");
    const { id } = await params;
    const b = await body(req);
    const role = str(b.role);
    const personId = str(b.personId);
    const date = str(b.date) || null;
    if (!personId) bad("Pick someone to add.");
    if (!(CREW_ROLES as readonly string[]).includes(role)) bad("Unknown crew role.");
    return { job: await addCrew(id, role, personId, date) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("assignCrew");
    const { id } = await params;
    const b = await body(req);
    return { job: await removeCrew(id, int(b.index, -1), str(b.date) || null) };
  });
}
