import { bad, body, handle, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { saveCompany } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await requirePermission("finances");
    const b = await body(req);
    const name = str(b.name);
    if (!name) bad("A billing contact needs a company name.");
    return {
      company: await saveCompany({
        id: str(b.id) || undefined,
        name,
        billingAddress: str(b.billingAddress),
        contactName: str(b.contactName),
        email: str(b.email),
        phone: str(b.phone),
      }),
    };
  });
}
