"use client";

/* The frame every view sits in: sidebar, topbar, the scrolling
   content column, and the three things that float over all of it
   — the job side panel, the modal, and the toast rail. */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { mayVisit, firstViewFor } from "@/lib/nav";
import type { Workspace } from "@/lib/types";
import { JobPanel } from "./job-panel";
import { ModalHost } from "./modal-host";
import { Sidebar } from "./sidebar";
import { ToastRail } from "./toast-rail";
import { Topbar } from "./topbar";
import { WorkspaceProvider, useWorkspace } from "./workspace-provider";

export function AppShell({
  initial,
  children,
}: {
  initial: Workspace;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider initial={initial}>
      <Frame>{children}</Frame>
    </WorkspaceProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { ws, closePanel } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  /* A role that loses access to a view while standing on it gets
     moved somewhere it can be, rather than staring at an error. */
  useEffect(() => {
    if (!mayVisit(ws.me.role, pathname)) router.replace(firstViewFor(ws.me.role));
  }, [ws.me.role, pathname, router]);

  /* Escape closes the side panel, wherever focus happens to be. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closePanel]);

  return (
    <div className="app">
      <Sidebar unreadChat={ws.unreadChannels.length > 0} />

      <div className="main-col">
        <Topbar />
        <main className="content">{children}</main>
      </div>

      <JobPanel />
      <ModalHost />
      <ToastRail />
    </div>
  );
}
