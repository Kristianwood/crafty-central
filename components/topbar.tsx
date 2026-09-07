"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ROLE_LABELS,
  STALE_REQUEST_HOURS,
  isStaleRequest,
  unansweredRequests,
} from "@/lib/domain";
import { titleFor } from "@/lib/nav";
import { fmtAgo } from "@/lib/format";
import { Avatar } from "./avatar";
import { Empty } from "./empty";
import { Icon } from "./icons";
import { signOut } from "./account-box";
import { useWorkspace } from "./workspace-provider";

export function Topbar() {
  const pathname = usePathname();
  const { ws, can, mutate } = useWorkspace();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const unread = ws.notifications.some((n) => !n.read);

  /* Unanswered job requests follow you around the app, not just the
     dashboard: a count beside the bell, turning red once one has sat
     for a day. Age is measured against the server's clock. */
  const waiting = can("createJob") ? unansweredRequests(ws.inquiries) : [];
  const stale = waiting.some((q) => isStaleRequest(q, ws.now));

  /* Click anywhere else closes the drawer — same behaviour as before. */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!drawerRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) await mutate("/api/notifications/read").catch(() => {});
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">{titleFor(pathname)}</div>
        <div className="topbar-actions">
          {waiting.length > 0 && (
            <Link
              href="/dashboard"
              className={`req-pill ${stale ? "stale" : ""}`.trim()}
              aria-label={`${waiting.length} job request${waiting.length === 1 ? "" : "s"} waiting`}
              title={
                stale
                  ? `A request has waited more than ${STALE_REQUEST_HOURS} hours — open the dashboard`
                  : "Unanswered job requests — open the dashboard"
              }
            >
              <span className="rp-dot" aria-hidden="true" />
              <span className="rp-count">{waiting.length}</span>
              <span className="rp-text">
                {waiting.length === 1 ? "request" : "requests"} waiting
              </span>
            </Link>
          )}

          <button
            ref={buttonRef}
            className="icon-btn"
            title="Notifications"
            aria-label="Notifications"
            onClick={() => void toggle()}
          >
            <Icon name="bell" />
            {unread && <span className="notif-dot" />}
          </button>

          <div
            className="topbar-user"
            style={{ cursor: "pointer" }}
            title="Sign out"
            onClick={() => {
              if (confirm("Sign out of Crafty Central?")) void signOut();
            }}
          >
            <div className="u-meta">
              <span className="u-name">{ws.me.name}</span>
              <span className="u-role">
                {ROLE_LABELS[ws.me.role]} · {ws.me.position}
              </span>
            </div>
            <Avatar person={ws.me} />
          </div>
        </div>
      </header>

      {open && (
        <aside className="notif-drawer" ref={drawerRef}>
          <div className="notif-head">
            <span>Notifications</span>
            <button
              className="text-btn"
              onClick={() => void mutate("/api/notifications/read").catch(() => {})}
            >
              Mark all read
            </button>
          </div>
          <div className="notif-list">
            {ws.notifications.length ? (
              ws.notifications.map((n) => (
                <div key={n.id} className={`notif-item ${n.read ? "" : "unread"}`.trim()}>
                  <span className="n-icon">
                    <Icon name={n.icon} />
                  </span>
                  <div>
                    <div>{n.text}</div>
                    <div className="n-time">{fmtAgo(n.at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                icon="bell"
                title="All caught up"
                sub="Nothing new for you right now."
                style={{ border: "none" }}
              />
            )}
          </div>
        </aside>
      )}
    </>
  );
}
