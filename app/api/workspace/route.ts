/* The client polls this. Everything the signed-in person is
   allowed to see, already filtered. */

import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { loadWorkspace } from "@/lib/repo/workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return handle(async () => loadWorkspace(await requireUser()));
}
