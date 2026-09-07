/* One person's dashboard arrangement. PUT saves it, DELETE puts it
   back to the default for their role. Whatever arrives is run
   through normalizeDashboard() so a hand-crafted body cannot pin a
   widget the role may not see. */

import { body, handle } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { resetDashboard, saveDashboard } from "@/lib/repo/dashboard";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  return handle(async () => {
    const me = await requirePermission("customizeDashboard");
    const layout = await body(req);
    return { dashboard: await saveDashboard(me.id, me.role, layout) };
  });
}

export async function DELETE() {
  return handle(async () => {
    const me = await requirePermission("customizeDashboard");
    return { dashboard: await resetDashboard(me.id, me.role) };
  });
}
