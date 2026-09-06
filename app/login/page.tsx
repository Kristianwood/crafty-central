import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { firstViewFor } from "@/lib/nav";
import { peopleCount } from "@/lib/repo/people";
import AuthScreen from "@/components/auth-screen";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in · Crafty Central" };

export default async function LoginPage() {
  const me = await currentUser();
  if (me) redirect(firstViewFor(me.role));

  // An empty database means whoever signs up first is the owner —
  // worth saying out loud rather than letting them guess.
  let firstRun = false;
  try {
    firstRun = (await peopleCount()) === 0;
  } catch {
    // No database yet: the screen still renders and says so on submit.
  }

  return <AuthScreen firstRun={firstRun} />;
}
