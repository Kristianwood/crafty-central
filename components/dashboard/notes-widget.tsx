"use client";

/* ============================================================
   My notes — a scratchpad that saves itself.

   The draft lives here, not in the workspace. The snapshot is
   re-fetched every 8s and after every mutation, and a textarea
   bound straight to it would lose keystrokes mid-sentence. So the
   polled copy is adopted only when the draft already matches what
   we last saved — that is, when the person is not in the middle of
   typing. Saves go out 900ms after typing stops, on blur, and on
   the way out if anything is still pending.
   ============================================================ */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import type { DashboardLayout } from "@/lib/types";
import type { WidgetProps } from "./widget";

const SAVE_DELAY_MS = 900;
/** normalizeDashboard trims past this; better not to let it. */
const MAX_NOTES = 4000;

type SaveState = "idle" | "saving" | "saved";

export function NotesWidget({ editing }: WidgetProps) {
  const { ws, mutate } = useWorkspace();
  const [draft, setDraft] = useState(ws.dashboard.notes);
  /** The last text we know the server has — loaded or saved by us. */
  const [saved, setSaved] = useState(ws.dashboard.notes);
  const [state, setState] = useState<SaveState>("idle");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Handlers and the unmount flush read through here so a stale
     closure never saves an old draft over a newer one. */
  const latest = useRef<{ draft: string; saved: string; layout: DashboardLayout }>({
    draft,
    saved,
    layout: ws.dashboard,
  });
  /* Two saves in flight resolve in whatever order the network
     likes; only the newest gets to say what "saved" is. */
  const seq = useRef(0);

  useEffect(() => {
    latest.current = { draft, saved, layout: ws.dashboard };
  });

  const dirty = draft !== saved;

  /* Adopt the polled copy only when we are not mid-edit. */
  if (ws.dashboard.notes !== saved && !dirty) {
    setSaved(ws.dashboard.notes);
    setDraft(ws.dashboard.notes);
  }

  const commit = useCallback(
    async (text: string) => {
      const mine = ++seq.current;
      setState("saving");
      try {
        await mutate("/api/dashboard", { ...latest.current.layout, notes: text }, "PUT");
        if (mine !== seq.current) return;
        setSaved(text);
        setState("saved");
      } catch {
        /* mutate has toasted; the draft stays so nothing is lost. */
        if (mine === seq.current) setState("idle");
      }
    },
    [mutate],
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const { draft: d, saved: s } = latest.current;
    if (d !== s) void commit(d);
  }, [commit]);

  /* Leaving the page with a pending edit still saves it. */
  useEffect(() => flush, [flush]);

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setDraft(v);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void commit(v);
    }, SAVE_DELAY_MS);
  }

  const hint =
    state === "saving" ? "Saving…" : !dirty && state === "saved" ? "Saved" : dirty ? "Unsaved" : "";

  return (
    <>
      <textarea
        className="notes-area"
        value={draft}
        maxLength={MAX_NOTES}
        readOnly={editing}
        placeholder="Anything you want to remember — only you can see this."
        aria-label="My notes"
        onChange={onChange}
        onBlur={flush}
      />
      <div className="notes-foot">
        <span>Only you can see this.</span>
        <span className={`notes-state ${state}`.trim()} aria-live="polite">
          {draft.length >= MAX_NOTES - 200 ? `${draft.length}/${MAX_NOTES} · ` : ""}
          {hint}
        </span>
      </div>
    </>
  );
}
