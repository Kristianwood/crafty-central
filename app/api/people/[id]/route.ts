import { bad, handle } from "@/lib/api";
import { ROLE_LABELS, ROLE_RANK } from "@/lib/domain";
import { requirePermission } from "@/lib/auth";
import { deletePerson, getPerson } from "@/lib/repo/people";
import { openJobIdsForPerson } from "@/lib/repo/jobs";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const me = await requirePermission("editDirectory");
    const { id } = await params;
    if (id === me.id) bad("You cannot remove yourself.");

    const person = await getPerson(id);
    if (!person) return { ok: true };

    /* Nobody removes someone above them. Without this a moderator
       could delete an owner who has not claimed their account yet and
       leave the seat vacant — the one record the directory must not
       lose to a tidy-up. */
    if (ROLE_RANK[person.role] < ROLE_RANK[me.role]) {
      bad(`Only ${ROLE_LABELS[person.role].toLowerCase()}-level access can remove ${person.name}.`, 403);
    }
    if (person.role === "owner") {
      bad("The owner cannot be removed. Pass the seat on first.", 403);
    }

    /* Having signed in is not a reason to keep someone on the books.
       Nothing in the app can close an account, so refusing here left
       every employee who had ever logged in un-removable — the
       Directory said "an admin has to close it first" and no admin,
       anywhere, had a way to do it. Removing them takes their login
       with them: sessions cascade, so they are signed out at once. */
    const booked = await openJobIdsForPerson(id);
    if (booked.length) {
      bad(
        `They are still on the crew for ${booked.length} job${booked.length === 1 ? "" : "s"} that ` +
          `${booked.length === 1 ? "has" : "have"} not wrapped. Take them off ` +
          `${booked.length === 1 ? "it" : "those"} first.`,
        409,
      );
    }
    await deletePerson(id);
    return { ok: true };
  });
}
