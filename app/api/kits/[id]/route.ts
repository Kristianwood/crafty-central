import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { deleteKit } from "@/lib/repo/catalog";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Invoices that used the kit keep their lines — they are copies. */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("manageCatalog");
    await deleteKit((await params).id);
    return { ok: true };
  });
}
