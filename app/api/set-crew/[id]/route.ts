import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { deleteSetCrew } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editDirectory");
    await deleteSetCrew((await params).id);
    return { ok: true };
  });
}
