import { handle } from "@/lib/api";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await destroySession();
    return { ok: true };
  });
}
