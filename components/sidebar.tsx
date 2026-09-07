"use client";

/* Sidebar on desktop, bottom tab bar on mobile — app.css handles
   that switch, this just renders the links the role allows and
   the two badges that used to live on them. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { unansweredRequests } from "@/lib/domain";
import { navFor } from "@/lib/nav";
import { Icon } from "./icons";
import { useWorkspace } from "./workspace-provider";
import { AccountBox } from "./account-box";

export function Sidebar({ unreadChat }: { unreadChat: boolean }) {
  const pathname = usePathname();
  const { ws, can } = useWorkspace();

  /* One badge for everything the office owes an answer to: time off
     waiting on approval plus job requests nobody has replied to. The
     title spells the split out, since the number alone cannot. */
  const timeOffPending = can("approveTimeOff")
    ? ws.timeOff.filter((t) => t.status === "pending").length
    : 0;
  const requestsWaiting = can("createJob") ? unansweredRequests(ws.inquiries).length : 0;
  const pending = timeOffPending + requestsWaiting;
  const pendingTitle = [
    requestsWaiting ? `${requestsWaiting} request${requestsWaiting === 1 ? "" : "s"}` : "",
    timeOffPending ? `${timeOffPending} time-off` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const items = navFor(ws.me.role);

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true">
          <Icon name="menu" />
        </div>
        <div className="brand-text">
          <span className="brand-name">Crafty</span>
          <span className="brand-sub">Central</span>
        </div>
      </div>

      <div className="sidebar-nav">
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link key={n.id} href={n.href} className={`nav-link ${active ? "active" : ""}`.trim()}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.id === "dashboard" && pending > 0 && (
                <span className="nav-badge" title={pendingTitle}>
                  {pending}
                </span>
              )}
              {n.id === "chat" && unreadChat && (
                <span
                  className="nav-badge"
                  style={{ minWidth: 8, height: 8, padding: 0, borderRadius: "50%" }}
                />
              )}
            </Link>
          );
        })}
      </div>

      <div className="sidebar-foot">
        <AccountBox />
      </div>
    </nav>
  );
}
