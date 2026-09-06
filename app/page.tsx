/* The front door. Signed in, you land on whichever view your role
   allows first — crew have no dashboard, so they start on the
   calendar. Signed out, the login screen. */

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { firstViewFor } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await currentUser();
  redirect(me ? firstViewFor(me.role) : "/login");
}
