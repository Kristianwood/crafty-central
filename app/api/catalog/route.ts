/* Products and services — the legend an invoice is built from. */

import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { saveCatalogItem } from "@/lib/repo/catalog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("manageCatalog");
    const b = await body(req);
    const name = str(b.name).slice(0, 190);
    if (!name) bad("Give the item a name.");
    const unitPrice = Number(b.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) bad("The price needs to be a number, zero or more.");

    return {
      item: await saveCatalogItem({
        id: str(b.id) || undefined,
        name,
        kind: str(b.kind) === "service" ? "service" : "product",
        unit: str(b.unit).slice(0, 40) || "each",
        unitPrice: Math.round(unitPrice * 100) / 100,
        description: str(b.description).slice(0, 500),
        active: b.active === undefined ? true : !!b.active,
      }),
    };
  });
}
