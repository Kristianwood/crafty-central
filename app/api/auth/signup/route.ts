/* First sign-up claims the owner seat; after that, a new email
   joins as crew. Someone an admin already added to the Directory
   keeps the role and position on file — signing up just attaches
   a password to the record that is already there. */

import { handle, bad, body, str } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { inferTags } from "@/lib/domain";
import {
  getPasswordHash,
  getPersonByEmail,
  newPersonId,
  peopleCount,
  savePerson,
  setPasswordHash,
} from "@/lib/repo/people";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const email = str(b.email).toLowerCase();
    const password = str(b.password);
    const name = str(b.name);

    if (!email || !password) bad("Email and password are both required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("That email address does not look right.");
    if (password.length < 8) bad("Password needs at least 8 characters.");

    const existing = await getPersonByEmail(email);

    if (existing) {
      if (await getPasswordHash(existing.id)) {
        bad("That email already has an account — sign in instead.", 409);
      }
      // On file but never signed up: keep their role and position.
      await setPasswordHash(existing.id, await hashPassword(password));
      if (name && !existing.name) await savePerson({ ...existing, name });
      await createSession(existing.id, req.headers.get("user-agent") ?? "");
      return { person: { ...existing, hasAccount: true } };
    }

    const first = (await peopleCount()) === 0;
    const displayName = name || email.split("@")[0];
    const position = first ? "Owner / Operator" : "Crew";

    const person = await savePerson({
      id: newPersonId(),
      name: displayName,
      role: first ? "owner" : "crew",
      position,
      phone: "",
      email,
      tags: inferTags(position),
      dietary: [],
    });
    await setPasswordHash(person.id, await hashPassword(password));
    await createSession(person.id, req.headers.get("user-agent") ?? "");
    return { person: { ...person, hasAccount: true } };
  });
}
