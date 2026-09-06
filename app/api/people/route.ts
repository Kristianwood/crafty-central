/* Directory entries. Role changes are admin-only: a moderator can
   keep the book tidy but cannot promote anyone, themselves least
   of all. */

import { bad, body, handle, str, strArray } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/domain";
import { getPerson, savePerson } from "@/lib/repo/people";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "moderator", "crew"];

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePermission("editDirectory");
    const b = await body(req);
    const id = str(b.id);
    const existing = id ? await getPerson(id) : null;

    const name = str(b.name);
    if (!name) bad("Everyone needs a name.");

    let role = (str(b.role) || existing?.role || "crew") as Role;
    if (!ROLES.includes(role)) role = "crew";

    // Only an admin can set or change a role.
    if (!can(me.role, "finances") && role !== (existing?.role ?? "crew")) {
      bad("Only an admin can change someone's role.", 403);
    }
    // And nobody demotes the last admin out of existence by accident.
    if (existing?.id === me.id && role !== me.role) {
      bad("Change your own role from another admin account.", 403);
    }

    const person = await savePerson({
      id: id || undefined,
      name,
      role,
      position: str(b.position),
      phone: str(b.phone),
      email: str(b.email).toLowerCase(),
      tags: strArray(b.tags),
      dietary: strArray(b.dietary),
    });
    return { person };
  });
}
