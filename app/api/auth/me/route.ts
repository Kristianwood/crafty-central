import { handle } from "@/lib/api";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ person: await currentUser() }));
}
