import { bad, body, handle, str, strArray } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { saveMenu } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("editJob");
    const b = await body(req);
    const name = str(b.name);
    if (!name) bad("Give the menu a name.");
    return { menu: await saveMenu({ id: str(b.id) || undefined, name, items: strArray(b.items) }) };
  });
}
