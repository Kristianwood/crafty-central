import { body, handle, str } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { markChannelRead } from "@/lib/repo/chat";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const channel = str((await body(req)).channel);
    if (channel) await markChannelRead(me.id, channel);
    return { ok: true };
  });
}
