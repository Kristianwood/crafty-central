"use client";

/* ============================================================
   Job requests — the outreach inbox.

   Every enquiry nobody has answered yet, oldest first, because the
   oldest is the one most owed a reply. The age chip goes clay once
   a request has sat past STALE_REQUEST_HOURS, the same threshold
   the server nags about, and the whole row tints with it so a
   stale one cannot hide in a long list.
   ============================================================ */

import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import { inquiryAgeHours, isStaleRequest, unansweredRequests } from "@/lib/domain";
import { fmtRange } from "@/lib/format";
import type { Inquiry, Job } from "@/lib/types";

/** "waiting 3h" / "waiting 2d" — coarse on purpose; it is a nudge, not a clock. */
function waitingLabel(hours: number): string {
  if (hours < 1) return "just in";
  if (hours < 48) return `waiting ${Math.floor(hours)}h`;
  return `waiting ${Math.floor(hours / 24)}d`;
}

export function RequestsWidget() {
  const { ws } = useWorkspace();
  const open = unansweredRequests(ws.inquiries);

  if (!open.length) {
    return <Empty icon="mail" title="Inbox zero" sub="Every request has been answered." />;
  }

  return (
    <div className="req-list">
      {open.map((q) => (
        <RequestRow key={q.id} inquiry={q} />
      ))}
    </div>
  );
}

function RequestRow({ inquiry: q }: { inquiry: Inquiry }) {
  const { ws, mutate, toast, openJobPanel } = useWorkspace();
  const days = q.shootDays.slice().sort();
  const contact = [q.email, q.phone].filter(Boolean).join(" · ");
  const stale = isStaleRequest(q, ws.now);
  const age = waitingLabel(inquiryAgeHours(q, ws.now));

  const replyHref = q.email
    ? `mailto:${q.email}?subject=${encodeURIComponent(
        `Re: your craft service enquiry for ${q.company}`,
      )}`
    : null;

  async function convert() {
    try {
      const out = await mutate<{ job: Job }>(
        `/api/inquiries/${q.id}`,
        { action: "convert" },
        "PATCH",
      );
      toast("Hold created — it is on the calendar", "check");
      openJobPanel(out.job.id);
    } catch {
      /* mutate has already toasted why the server refused. */
    }
  }

  async function dismiss() {
    try {
      await mutate(`/api/inquiries/${q.id}`, { action: "dismiss" }, "PATCH");
      toast("Inquiry dismissed", "x");
    } catch {
      /* already toasted */
    }
  }

  return (
    <div className={`inq-row req-row ${stale ? "stale" : ""}`.trim()}>
      <div className="inq-main">
        <span className="req-top">
          <span className="inq-co">{q.company}</span>
          <span className={`req-age ${stale ? "stale" : ""}`.trim()} title={stale ? "Past the reply window" : undefined}>
            <Icon name="clock" />
            {age}
          </span>
        </span>
        <span className="inq-meta">
          {days.length ? `${fmtRange(days[0], days[days.length - 1])} · ` : ""}
          {q.intExt || "?"} · {q.dayNight || "?"} · ~{q.headcount || "?"} on set
          {q.pm ? ` · PM: ${q.pm}` : ""}
        </span>
        <span className="inq-contact">
          {contact}
          {q.notes ? ` — “${q.notes}”` : ""}
        </span>
      </div>
      <div className="to-actions">
        <button type="button" className="btn sm" onClick={() => void convert()}>
          <Icon name="check" /> Create hold
        </button>
        {replyHref && (
          <a className="btn sm" href={replyHref} aria-label={`Reply to ${q.company} by email`}>
            <Icon name="mail" /> Reply
          </a>
        )}
        <button type="button" className="btn sm danger" onClick={() => void dismiss()}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
