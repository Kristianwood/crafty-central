/* ============================================================
   The signed-in shell.

   Auth is checked here, on the server, once — every page inside
   this group is behind it. The workspace snapshot is loaded here
   too and handed to the client provider, so the first paint has
   real data rather than a spinner.

   The one failure worth catching by hand is a database older than
   the build: a deploy that skipped `npm run db:migrate` starts
   cleanly and passes both health checks, then fails on every
   screen. Rather than a generic error page, it says which command
   fixes it.
   ============================================================ */

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SchemaOutOfDate } from "@/lib/db";
import { loadWorkspace } from "@/lib/repo/workspace";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import type { Workspace } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (!me) redirect("/login");

  let workspace: Workspace;
  try {
    workspace = await loadWorkspace(me);
  } catch (err) {
    if (err instanceof SchemaOutOfDate) {
      console.error("Schema out of date:", err.detail);
      return <MigrationNeeded detail={err.detail} />;
    }
    throw err;
  }

  return <AppShell initial={workspace}>{children}</AppShell>;
}

function MigrationNeeded({ detail }: { detail: string }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <Icon name="menu" />
          </div>
          <div className="brand-text">
            <span className="brand-name">Crafty</span>
            <span className="brand-sub">Central</span>
          </div>
        </div>

        <h1 className="auth-title">The database needs updating</h1>
        <p className="auth-sub">
          This build expects tables and columns the database does not have yet, so nothing can
          load. It is one command on the server, and no data is lost:
        </p>

        <pre className="migrate-cmd">npm run db:migrate</pre>

        <p className="auth-sub" style={{ marginBottom: 0 }}>
          Then reload this page. Until it is run, everyone signing in will see this screen.
        </p>

        <p className="migrate-detail">{detail}</p>
      </div>
    </div>
  );
}
