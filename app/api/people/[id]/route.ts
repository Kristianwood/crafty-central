import { bad, handle } from "@/lib/api";
import { ROLE_LABELS, ROLE_RANK } from "@/lib/domain";
import { requirePermission } from "@/lib/auth";
import { deletePerson, getPerson } from "@/lib/repo/people";
import { jobIdsForPerson } from "@/lib/repo/jobs";

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

    if (person.hasAccount) {
      bad("That person has an account — an admin has to close it first.", 409);
    }
    const booked = await jobIdsForPerson(id);
    if (booked.length) {
      bad(`They are still booked on ${booked.length} job${booked.length === 1 ? "" : "s"}.`, 409);
    }
    await deletePerson(id);
    return { ok: true };
  });
}
