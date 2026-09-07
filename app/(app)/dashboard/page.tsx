"use client";

/* ============================================================
   Dashboard — the admin/moderator home, now a widget host.

   The page reads one person's layout (ws.dashboard) and renders
   the widgets it lists, in that order, on a two-column grid. The
   widgets themselves live in components/dashboard/, one file
   each, behind the registry.

   Customise mode keeps a working copy of the layout in state and
   only sends it when the person presses Done — so the poll that
   refreshes the workspace every 8s cannot pull a half-arranged
   page out from under them. Reordering is native drag-and-drop
   with the arrow buttons as the fallback that actually works
   everywhere.
   ============================================================ */

import { useState, type DragEvent } from "react";
import { AddWidgetTray } from "@/components/dashboard/add-widget-tray";
import { jobsThisWeek } from "@/components/dashboard/derive";
import { WIDGET_REGISTRY } from "@/components/dashboard";
import { WidgetCard } from "@/components/dashboard/widget-card";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import { todayISO, unansweredRequests, widgetDef, widgetsFor } from "@/lib/domain";
import { firstName, fmtFull } from "@/lib/format";
import type { DashboardLayout, DashboardWidget, WidgetId, WidgetSize } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Move one item within a list, returning a new list. */
function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function DashboardView() {
  const { ws, can, mutate, toast } = useWorkspace();

  /* null while viewing; the working copy while customising. */
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [overId, setOverId] = useState<WidgetId | null>(null);

  const editing = draft !== null;
  const layout = draft ?? ws.dashboard;

  /* The server already normalises the layout against the role, but
     the role can change under a live session — never render a
     widget this person may not see. */
  const allowed = widgetsFor(ws.me.role);
  const allowedIds = new Set(allowed.map((w) => w.id));
  const widgets = layout.widgets.filter((w) => allowedIds.has(w.id));
  const available = allowed.filter((w) => !widgets.some((x) => x.id === w.id));

  /* — header — */
  const T = todayISO();
  const greeting = greetingFor(new Date(ws.now).getHours());
  const week = jobsThisWeek(ws.jobs, T).length;
  const waiting = can("createJob") ? unansweredRequests(ws.inquiries).length : null;
  const subline = [
    fmtFull(T),
    plural(week, "job") + " this week",
    waiting === null ? null : plural(waiting, "request") + " waiting",
  ]
    .filter(Boolean)
    .join(" · ");

  /* — customise mode — */
  const setWidgets = (next: DashboardWidget[]) =>
    setDraft((d) => (d ? { ...d, widgets: next } : d));

  function startEditing() {
    setDraft({
      widgets: widgets.map((w) => ({ ...w })),
      stats: [...ws.dashboard.stats],
      notes: ws.dashboard.notes,
    });
  }

  function cancel() {
    setDraft(null);
    setDragId(null);
    setOverId(null);
  }

  async function done() {
    if (!draft) return;
    setSaving(true);
    try {
      /* Notes are not part of arranging the page; send whatever the
         notes widget has most recently saved rather than the copy
         taken when editing began. */
      await mutate("/api/dashboard", { ...draft, notes: ws.dashboard.notes }, "PUT");
      toast("Dashboard saved", "check");
      cancel();
    } catch {
      /* mutate has already toasted why. */
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm("Put the dashboard back to the default for your role?")) return;
    try {
      await mutate("/api/dashboard", undefined, "DELETE");
      toast("Dashboard reset to default", "refresh");
      cancel();
    } catch {
      /* already toasted */
    }
  }

  const move = (from: number, to: number) => setWidgets(reorder(widgets, from, to));
  const resize = (id: WidgetId, size: WidgetSize) =>
    setWidgets(widgets.map((w) => (w.id === id ? { ...w, size } : w)));
  const hide = (id: WidgetId) => setWidgets(widgets.filter((w) => w.id !== id));
  const add = (id: WidgetId, size: WidgetSize) => setWidgets([...widgets, { id, size }]);

  /* — drag and drop — */
  const dragStart = (id: WidgetId) => (e: DragEvent<HTMLElement>) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    /* Firefox will not start a drag without some payload. */
    e.dataTransfer.setData("text/plain", id);
  };
  const dragOver = (id: WidgetId) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  };
  const drop = (id: WidgetId) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (dragId && dragId !== id) {
      const from = widgets.findIndex((w) => w.id === dragId);
      const to = widgets.findIndex((w) => w.id === id);
      move(from, to);
    }
    setDragId(null);
    setOverId(null);
  };
  const dragEnd = () => {
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="view-enter dash">
      <header className="dash-head">
        <div>
          <h1 className="dash-greeting">
            {greeting}, {firstName(ws.me.name)}
          </h1>
          <p className="dash-subline">{subline}</p>
        </div>

        {can("customizeDashboard") && (
          <div className="dash-head-actions">
            {editing ? (
              <>
                <button type="button" className="btn sm" onClick={() => void reset()}>
                  <Icon name="refresh" /> Reset to default
                </button>
                <button type="button" className="btn sm" onClick={cancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn sm primary"
                  disabled={saving}
                  onClick={() => void done()}
                >
                  <Icon name="check" /> {saving ? "Saving…" : "Done"}
                </button>
              </>
            ) : (
              <button type="button" className="btn sm" onClick={startEditing}>
                <Icon name="sliders" /> Customise
              </button>
            )}
          </div>
        )}
      </header>

      {editing && (
        <p className="dash-edit-note">
          <Icon name="grip" /> Drag a card to move it, or use the arrows. Nothing is kept until
          you press Done.
        </p>
      )}

      {widgets.length ? (
        <div className={`dash-grid ${editing ? "editing" : ""}`.trim()}>
          {widgets.map((w, i) => {
            const def = widgetDef(w.id);
            if (!def) return null;
            const entry = WIDGET_REGISTRY[w.id];
            const Body = entry.Body;
            return (
              <WidgetCard
                key={w.id}
                id={w.id}
                title={def.label}
                size={w.size}
                badge={entry.badge ? entry.badge(ws) : null}
                editing={editing}
                tools={
                  editing
                    ? {
                        canUp: i > 0,
                        canDown: i < widgets.length - 1,
                        onUp: () => move(i, i - 1),
                        onDown: () => move(i, i + 1),
                        onSize: (size) => resize(w.id, size),
                        onHide: () => hide(w.id),
                      }
                    : undefined
                }
                drag={
                  editing
                    ? {
                        dragging: dragId === w.id,
                        over: overId === w.id && dragId !== null && dragId !== w.id,
                        onDragStart: dragStart(w.id),
                        onDragOver: dragOver(w.id),
                        onDrop: drop(w.id),
                        onDragEnd: dragEnd,
                      }
                    : undefined
                }
              >
                <Body layout={layout} editing={editing} onLayout={editing ? setDraft : undefined} />
              </WidgetCard>
            );
          })}
        </div>
      ) : (
        !editing && (
          <Empty
            icon="dashboard"
            title="Nothing on your dashboard"
            sub={
              can("customizeDashboard")
                ? "Press Customise to add some widgets."
                : "There is nothing here for your role yet."
            }
          />
        )
      )}

      {editing && (
        <AddWidgetTray
          available={available}
          nothingShown={widgets.length === 0}
          onAdd={(def) => add(def.id, def.defaultSize)}
        />
      )}
    </div>
  );
}
