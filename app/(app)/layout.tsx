/* ============================================================
   The signed-in shell.

   Auth is checked here, on the server, once — every page inside
   this group is behind it. The workspace snapshot is loaded here
   too and handed to the client provider, so the first paint has
   real data rather than a spinner.
   ============================================================ */

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { loadWorkspace } from "@/lib/repo/workspace";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (!me) redirect("/login");

  const workspace = await loadWorkspace(me);
  return <AppShell initial={workspace}>{children}</AppShell>;
}
