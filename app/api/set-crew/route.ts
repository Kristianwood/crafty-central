import { bad, body, handle, str, strArray } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { saveSetCrew } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("editDirectory");
    const b = await body(req);
    const name = str(b.name);
    if (!name) bad("Everyone needs a name.");
    return {
      member: await saveSetCrew({
        id: str(b.id) || undefined,
        name,
        position: str(b.position),
        dietary: strArray(b.dietary),
        notes: str(b.notes),
      }),
    };
  });
}
