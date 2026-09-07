/* A kit: a named bundle of catalogue items with quantities. */

import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { listCatalog, saveKit } from "@/lib/repo/catalog";
import type { KitItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("manageCatalog");
    const b = await body(req);
    const name = str(b.name).slice(0, 190);
    if (!name) bad("Give the kit a name.");

    const known = new Set((await listCatalog()).map((c) => c.id));
    const items: KitItem[] = [];
    for (const raw of Array.isArray(b.items) ? b.items.slice(0, 100) : []) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const catalogItemId = str(o.catalogItemId);
      if (!known.has(catalogItemId)) continue;
      const qty = Number(o.qty);
      items.push({ catalogItemId, qty: Number.isFinite(qty) && qty > 0 ? Math.round(qty * 100) / 100 : 1 });
    }
    if (!items.length) bad("A kit needs at least one catalogue item.");

    return {
      kit: await saveKit({
        id: str(b.id) || undefined,
        name,
        description: str(b.description).slice(0, 500),
        items,
      }),
    };
  });
}
