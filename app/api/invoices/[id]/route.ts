import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { setInvoiceStatus } from "@/lib/repo/misc";
import type { InvoiceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"];

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    await requirePermission("finances");
    const { id } = await params;
    const status = str((await body(req)).status) as InvoiceStatus;
    if (!STATUSES.includes(status)) bad("Unknown invoice status.");
    await setInvoiceStatus(id, status);
    return { ok: true };
  });
}
