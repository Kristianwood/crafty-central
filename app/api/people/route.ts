/* Directory entries. Role changes are gated by mayAssignRole() in
   lib/domain.ts: admins and the owner set roles, but only the owner
   hands out or takes back the owner seat — with one exception,
   while nobody holds it yet an admin may give it to one person, so
   the business owner can be seated on an existing database from the
   Directory rather than a console. */

import { bad, body, handle, str, strArray } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { isRole, mayAssignRole } from "@/lib/domain";
import { getPerson, getPersonByEmail, ownerExists, savePerson } from "@/lib/repo/people";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePermission("editDirectory");
    const b = await body(req);
    const id = str(b.id);
    const existing = id ? await getPerson(id) : null;
    if (id && !existing) bad("That person is gone.", 404);

    const name = str(b.name);
    if (!name) bad("Everyone needs a name.");

    /* Email is unique in the table, and savePerson upserts. Without
       this check, "add employee" with an address already on file
       would not add anyone — MySQL would resolve the duplicate key
       against the email and rewrite THAT person's row, name, role and
       all. Someone could quietly demote the owner by typing their
       address into the add form. */
    const email = str(b.email).toLowerCase();
    if (email) {
      const holder = await getPersonByEmail(email);
      if (holder && holder.id !== (existing?.id ?? "")) {
        bad(`${holder.name} already uses that email address. Edit their record instead.`, 409);
      }
    }

    // The owner's own record is off limits to moderators: nobody below
    // admin gets to rewrite the owner's name or email.
    if (existing?.role === "owner" && existing.id !== me.id && me.role === "moderator") {
      bad("Only an admin or the owner can edit the owner's record.", 403);
    }

    const requested = str(b.role);
    const role: Role = isRole(requested) ? requested : (existing?.role ?? "crew");
    const current = existing?.role ?? null;

    if (role !== (current ?? "crew")) {
      // Nobody changes their own role — not even the owner, so the
      // seat cannot be given away by accident.
      if (existing?.id === me.id) bad("Change your own role from another account.", 403);
      if (!mayAssignRole(me.role, current, role, await ownerExists(existing?.id))) {
        bad(
          role === "owner" || current === "owner"
            ? "Only the owner can change who holds the owner seat."
            : "Only an admin can change someone's role.",
          403,
        );
      }
    }

    const person = await savePerson({
      id: id || undefined,
      name,
      role,
      position: str(b.position),
      phone: str(b.phone),
      email,
      tags: strArray(b.tags),
      dietary: strArray(b.dietary),
    });
    return { person };
  });
}
