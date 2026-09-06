/* ============================================================
   Chat. Two rules carried over exactly:

   - A message sent outside the quiet-hours window is stored with
     a deliver_at in the morning. Nothing has to run at 7am; every
     reader simply filters on the time.
   - You can always see your own queued messages, so you know the
     3am one went somewhere.
   ============================================================ */

import { bad, body, handle, str } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { chatWindowOpen, dmChannel, isDM, nextWindowOpen, uid } from "@/lib/domain";
import { channelMessages, insertMessage, myChannels, unreadChannels } from "@/lib/repo/chat";
import { getSettings } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Everyone in a DM channel id, so nobody can read someone else's. */
function mayReadChannel(channel: string, myId: string): boolean {
  if (channel === "company") return true;
  if (!isDM(channel)) return false;
  return channel.slice(3).split(":").includes(myId);
}

export async function GET(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const channel = str(new URL(req.url).searchParams.get("channel")) || "company";
    if (!mayReadChannel(channel, me.id)) bad("That is not your conversation.", 403);

    const [messages, channels, unread] = await Promise.all([
      channelMessages(channel, me.id),
      myChannels(me.id),
      unreadChannels(me.id),
    ]);
    // The server's clock, so the client can decide what is still
    // queued without reading its own (which would also make the
    // render impure).
    return { channel, messages, channels, unread, now: Date.now() };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = await body(req);
    const text = str(b.text);
    if (!text) bad("Nothing to send.");
    if (text.length > 4000) bad("That message is too long.");

    // Either an explicit channel, or "start a DM with this person".
    const to = str(b.to);
    const channel = to ? dmChannel(me.id, to) : str(b.channel) || "company";
    if (!mayReadChannel(channel, me.id)) bad("That is not your conversation.", 403);

    const settings = await getSettings();
    const now = Date.now();
    const open = chatWindowOpen(settings);

    const message = await insertMessage({
      id: uid(),
      channel,
      fromId: me.id,
      text,
      sentAt: now,
      deliverAt: open ? now : nextWindowOpen(settings).getTime(),
    });

    return { message, queued: !open };
  });
}
