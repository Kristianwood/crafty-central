import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { deleteCompany } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("finances");
    await deleteCompany((await params).id);
    return { ok: true };
  });
}
