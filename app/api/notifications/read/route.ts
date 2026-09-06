import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { markAllRead } from "@/lib/repo/notifications";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const me = await requireUser();
    await markAllRead(me.id, me.role);
    return { ok: true };
  });
}
