"use client";

/* ============================================================
   Time-off requests — the pending queue.

   Approve or deny from the row; the server notifies the crew
   member either way, so nothing else needs to happen here.
   ============================================================ */

import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import { fmtRange } from "@/lib/format";
import type { TimeOff } from "@/lib/types";

export function TimeOffWidget() {
  const { ws } = useWorkspace();
  const pending = ws.timeOff.filter((t) => t.status === "pending");

  if (!pending.length) {
    return (
      <Empty icon="palm" title="No requests waiting" sub="Time-off requests from the crew land here." />
    );
  }

  return (
    <div className="to-list">
      {pending.map((t) => (
        <TimeOffRow key={t.id} request={t} />
      ))}
    </div>
  );
}

function TimeOffRow({ request: t }: { request: TimeOff }) {
  const { person, mutate, toast } = useWorkspace();
  const p = person(t.personId);
  if (!p) return null;

  async function resolve(status: "approved" | "denied") {
    try {
      await mutate(`/api/time-off/${t.id}`, { status }, "PATCH");
      toast(
        status === "approved" ? "Time off approved" : "Time off denied",
        status === "approved" ? "check" : "x",
      );
    } catch {
      /* mutate has already toasted why the server refused. */
    }
  }

  return (
    <div className="to-item">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar person={p} size="sm" />
        <div>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div className="to-reason">{t.reason || "No reason given"}</div>
        </div>
      </div>
      <span className="to-dates">{fmtRange(t.start, t.end)}</span>
      <div className="to-actions">
        <button
          type="button"
          className="btn sm"
          aria-label={`Approve time off for ${p.name}`}
          onClick={() => void resolve("approved")}
        >
          <Icon name="check" /> Approve
        </button>
        <button
          type="button"
          className="btn sm danger"
          aria-label={`Deny time off for ${p.name}`}
          onClick={() => void resolve("denied")}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
