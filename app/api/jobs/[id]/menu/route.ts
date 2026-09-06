import { body, handle, int, str, strArray } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { addMenuItem, removeMenuItem, setMenu } from "@/lib/repo/job-edits";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Add one item. */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;
    const b = await body(req);
    return { job: await addMenuItem(id, str(b.item), str(b.date) || null) };
  });
}

/** Replace the whole menu — applying a saved template. */
export async function PUT(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;
    const b = await body(req);
    return { job: await setMenu(id, strArray(b.items), str(b.date) || null) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("editJob");
    const { id } = await params;
    const b = await body(req);
    return { job: await removeMenuItem(id, int(b.index, -1), str(b.date) || null) };
  });
}
