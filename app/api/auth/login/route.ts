import { handle, bad, body, str } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { getPasswordHash, getPersonByEmail } from "@/lib/repo/people";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const email = str(b.email).toLowerCase();
    const password = str(b.password);
    if (!email || !password) bad("Email and password are both required.");

    const person = await getPersonByEmail(email);
    const hash = person ? await getPasswordHash(person.id) : null;

    // Same message either way — never confirm which emails exist.
    if (!person || !hash || !(await verifyPassword(password, hash))) {
      bad("Wrong email or password.", 401);
    }

    await createSession(person!.id, req.headers.get("user-agent") ?? "");
    return { person };
  });
}
