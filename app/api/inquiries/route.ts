/* The public end of the outreach form — the only route anyone can
   reach without signing in. Everything here is untrusted input:
   validated, length-capped and rate-limited. */

import { bad, body, handle, int, str, strArray } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { saveInquiry } from "@/lib/repo/misc";
import { notify } from "@/lib/repo/notifications";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cap = (s: string, n: number) => s.slice(0, n);

export async function POST(req: Request) {
  return handle(async () => {
    if (!rateLimit("inquiry:" + clientIp(req), 5, 10 * 60_000)) {
      bad("That is a lot of enquiries — give it a few minutes.", 429);
    }

    const b = await body(req);
    const company = str(b.company);
    const email = str(b.email);

    if (!company) bad("Tell us who is producing.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad("We need an email that works.");

    const headcount = int(b.headcount);
    if (headcount < 1 || headcount > 5000) bad("Roughly how many people are on set?");

    const shootDays = strArray(b.shootDays).filter((d) => ISO_DATE.test(d)).slice(0, 60);

    const inquiry = await saveInquiry({
      company: cap(company, 180),
      pm: cap(str(b.pm), 150),
      email: cap(email, 180),
      phone: cap(str(b.phone), 50),
      intExt: cap(str(b.intExt), 20),
      dayNight: cap(str(b.dayNight), 20),
      headcount,
      shootDays,
      notes: cap(str(b.notes), 2000),
      status: "new",
    });

    await notify(
      "moderator",
      `New enquiry from ${inquiry.company} — ${headcount} on set.`,
      "briefcase",
    );

    // Deliberately thin: never tell the public what got stored.
    return { ok: true };
  });
}
