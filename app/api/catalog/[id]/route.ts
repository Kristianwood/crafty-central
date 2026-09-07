import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { deleteCatalogItem } from "@/lib/repo/catalog";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Kits that used the item lose that line (kit_items cascades);
    invoices that already billed it keep theirs — lines are copies. */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("manageCatalog");
    await deleteCatalogItem((await params).id);
    return { ok: true };
  });
}
