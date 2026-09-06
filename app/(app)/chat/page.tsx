"use client";

/* ============================================================
   Crafty Central — Chat
   #crafty-hq company channel + DMs. Messages composed outside
   the active window (7am–9pm) queue and deliver at 7:00 AM.

   Messages are no longer part of the workspace snapshot: this
   view owns its own feed and polls /api/chat every 3s, faster
   than the 8s whole-app poll, because a chat that lags feels
   broken in a way a calendar does not.
   ============================================================ */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { chatWindowOpen, dmChannel, nextWindowOpen } from "@/lib/domain";
import { fmtClock, firstName } from "@/lib/format";
import type { Message } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";

const POLL_MS = 3000;

/** What GET /api/chat answers. */
interface ChatFeed {
  channel: string;
  messages: Message[];
  /** Every channel the server knows I am in. The sidebar lists
      people rather than channels, so this is only a sanity check. */
  channels: { company: string; dms: string[] };
  unread: string[];
  /** The server's clock at the moment it answered. */
  now: number;
}

/** 7 → "7:00 AM". The settings store an hour, not a time. */
function fmtHour(h: number): string {
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:00 ${ap}`;
}

const dayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

export default function ChatView() {
  const { ws, person, refresh, toast } = useWorkspace();

  const [picked, setActive] = useState("company");
  const [feed, setFeed] = useState<ChatFeed | null>(null);
  const [draft, setDraft] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /* Poll responses can land out of order; only the newest wins. */
  const seq = useRef(0);
  /* The last channel we told the server we had looked at. */
  const marked = useRef("");

  const me = ws.me;
  const settings = ws.settings;

  /* A channel id that is not mine can only be left over from a
     previous account on this tab. Derived, not corrected in an
     effect — there is nothing to synchronise, only to ignore. */
  const active =
    picked !== "company" && !picked.includes(me.id) ? "company" : picked;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await api<ChatFeed>(`/api/chat?channel=${encodeURIComponent(active)}`);
      if (seq.current === mine) setFeed(next);
    } catch {
      /* A poll that fails is not worth shouting about; the next one
         usually succeeds. */
    }
  }, [active]);

  /* Poll while the tab is visible, and catch up the moment it is
     again — same shape as the workspace poll, just quicker. */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void load();
        start();
      } else {
        stop();
      }
    };

    // load() only reaches setState after an awaited fetch, so there is
    // no synchronous cascade here — which is what the rule guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      // Bumping the sequence is the point: it invalidates whatever is
      // still in flight so a late response cannot set state after
      // unmount. Reading the ref here is deliberate.
      seq.current++;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  /* Opening a channel clears its badge, and so does a message
     arriving while you are sitting in it — the old view called
     markRead on every render, which amounted to the same thing. */
  useEffect(() => {
    const pending = feed?.unread ?? [];
    if (marked.current === active && !pending.includes(active)) return;
    marked.current = active;
    void api("/api/chat/read", { body: { channel: active } })
      .then(() => refresh()) // so the sidebar badge follows
      .catch(() => {});
  }, [active, feed, refresh]);

  const messages = feed && feed.channel === active ? feed.messages : [];

  /* Pin to the bottom whenever the conversation grows. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, active]);

  /* Recomputed on every poll from the server's clock, so the pill and
     the composer notice flip over on their own — and agree with the
     machine that actually decides when a message goes out. */
  const serverNow = feed?.now ?? 0;
  const windowOpen = serverNow ? chatWindowOpen(settings, new Date(serverNow)) : true;

  /* The chat feed carries a fresher unread list than the 8s
     workspace snapshot, so the dots here move at chat speed. */
  const unread = feed?.unread ?? ws.unreadChannels;

  const others = ws.people.filter((p) => p.id !== me.id);
  const dmName = (chan: string) => {
    const otherId = chan.split(":").slice(1).find((id) => id !== me.id);
    return (otherId && person(otherId)?.name) || "Unknown";
  };
  const title = active === "company" ? "# crafty-hq" : dmName(active);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    try {
      const out = await api<{ message: Message; queued: boolean }>("/api/chat", {
        body: { text, channel: active },
      });
      if (out.queued) toast(`Queued — sends at ${fmtHour(settings.quietStart)}`, "moon");
      await load();
      inputRef.current?.focus();
    } catch (err) {
      // Give people their sentence back rather than swallowing it.
      setDraft(text);
      toast(err instanceof Error ? err.message : "That did not send", "alert");
    }
  }

  return (
    <div className="view-enter chat-shell">
      <div className="chat-side">
        <div className="cs-label">Channels</div>
        <button
          className={`chan-btn ${active === "company" ? "active" : ""}`}
          onClick={() => setActive("company")}
        >
          <span className="hash">#</span> crafty-hq
          {unread.includes("company") && active !== "company" && (
            <span className="cb-unread" />
          )}
        </button>

        <div className="cs-label">Direct messages</div>
        {others.map((p) => {
          const chan = dmChannel(me.id, p.id);
          return (
            <button
              key={p.id}
              className={`chan-btn ${active === chan ? "active" : ""}`}
              onClick={() => setActive(chan)}
            >
              <Avatar person={p} size="sm" /> {firstName(p.name)}
              {unread.includes(chan) && active !== chan && (
                <span className="cb-unread" />
              )}
            </button>
          );
        })}
      </div>

      <div className="chat-main">
        <div className="chat-title-bar">
          <div>
            <div className="ct-name">{title}</div>
            <div className="ct-sub">
              {active === "company" ? "Everyone at Crafty" : "Private conversation"}
            </div>
          </div>
          <span className={`chat-window-pill ${windowOpen ? "on" : "off"}`}>
            <span className="pip" />
            {windowOpen
              ? `Active until ${fmtHour(settings.quietEnd)}`
              : `Quiet hours — opens ${fmtHour(settings.quietStart)}`}
          </span>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length ? (
            messages.map((m, i) => {
              const day = dayLabel(m.sentAt);
              const newDay = i === 0 || day !== dayLabel(messages[i - 1].sentAt);
              const p = person(m.fromId);
              const mine = m.fromId === me.id;
              const queued = serverNow > 0 && m.deliverAt > serverNow;
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="day-divider">{day}</div>}
                  <div className={`msg ${mine ? "mine" : ""} ${queued ? "queued" : ""}`}>
                    <Avatar person={p} size="sm" />
                    <div className="msg-body">
                      <div className="msg-head">
                        <span className="msg-name">
                          {mine ? "You" : firstName(p?.name ?? "Unknown")}
                        </span>
                        <span className="msg-time">{fmtClock(m.sentAt)}</span>
                      </div>
                      <div className="msg-text">{m.text}</div>
                      {queued && (
                        <span className="msg-queued-tag">
                          <Icon name="moon" /> Sends at {fmtClock(m.deliverAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })
          ) : (
            <Empty
              icon="chat"
              title="No messages yet"
              sub="Say hello — everyone in this channel will see it."
              style={{ margin: "auto", border: "none" }}
            />
          )}
        </div>

        <div className="chat-compose">
          {!windowOpen && (
            <div className="chat-quiet-note">
              <Icon name="moon" />
              It&rsquo;s outside the {fmtHour(settings.quietStart)}–{fmtHour(settings.quietEnd)}{" "}
              window. Your message will send automatically at{" "}
              {fmtHour(nextWindowOpen(settings).getHours())}.
            </div>
          )}
          <form className="compose-row" onSubmit={(e) => void send(e)}>
            <input
              type="text"
              ref={inputRef}
              placeholder={`Message ${
                active === "company" ? "#crafty-hq" : firstName(dmName(active))
              }…`}
              autoComplete="off"
              maxLength={600}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="send-btn" type="submit" aria-label="Send">
              <Icon name="send" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
