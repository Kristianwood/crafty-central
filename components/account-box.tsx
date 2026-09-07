"use client";

/* The signed-in account, with a way out. The old build put a demo
   role-switcher here when Firebase was not configured; with real
   accounts there is nothing to switch between, so this is just
   who you are. */

import { api } from "@/lib/client";
import { ROLE_LABELS } from "@/lib/domain";
import { Avatar } from "./avatar";
import { Icon } from "./icons";
import { useWorkspace } from "./workspace-provider";

export async function signOut() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    // Hard navigation on purpose: it drops every scrap of client state
    // along with the session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

export function AccountBox() {
  const { ws } = useWorkspace();
  return (
    <div className="account-box">
      <Avatar person={ws.me} size="sm" />
      <div className="ab-meta">
        <span className="ab-name">{ws.me.name}</span>
        <span className="ab-role">{ROLE_LABELS[ws.me.role]}</span>
      </div>
      <button
        className="icon-btn"
        title="Sign out"
        aria-label="Sign out"
        style={{ width: 30, height: 30 }}
        onClick={() => void signOut()}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}
