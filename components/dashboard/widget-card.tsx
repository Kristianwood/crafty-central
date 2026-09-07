"use client";

/* ============================================================
   The frame every widget sits in: a rounded card with a small
   header and, while customising, the toolbar that moves, resizes
   and hides it.

   Native drag-and-drop is wired here as well, but the arrow
   buttons are the real control — they work with a keyboard and a
   screen reader, which the drag never will. The grip is only a
   hint that the card moves.
   ============================================================ */

import type { DragEvent, ReactNode } from "react";
import { Icon } from "@/components/icons";
import type { WidgetId, WidgetSize } from "@/lib/types";
import type { WidgetBadge } from "./widget";

export interface CardTools {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onSize: (size: WidgetSize) => void;
  onHide: () => void;
}

export interface CardDrag {
  dragging: boolean;
  over: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function WidgetCard({
  id,
  title,
  size,
  badge,
  editing,
  tools,
  drag,
  children,
}: {
  id: WidgetId;
  title: string;
  size: WidgetSize;
  badge: WidgetBadge | null;
  editing: boolean;
  tools?: CardTools;
  drag?: CardDrag;
  children: ReactNode;
}) {
  const cls = [
    "dash-widget",
    id,
    size,
    editing ? "editing" : "",
    drag?.dragging ? "dragging" : "",
    drag?.over ? "drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={cls}
      aria-label={title}
      draggable={editing && drag ? true : undefined}
      onDragStart={editing ? drag?.onDragStart : undefined}
      onDragOver={editing ? drag?.onDragOver : undefined}
      onDrop={editing ? drag?.onDrop : undefined}
      onDragEnd={editing ? drag?.onDragEnd : undefined}
    >
      <header className="dw-head">
        {editing && (
          <span className="dw-grip" aria-hidden="true">
            <Icon name="grip" />
          </span>
        )}
        <h2 className="dw-title">{title}</h2>
        {badge && badge.count > 0 && (
          <span className={`dw-badge ${badge.tone}`} aria-label={`${badge.count} in ${title}`}>
            {badge.count}
          </span>
        )}

        {editing && tools && (
          <div className="dw-tools" role="group" aria-label={`Arrange ${title}`}>
            <button
              type="button"
              className="dw-tool"
              aria-label={`Move ${title} up`}
              disabled={!tools.canUp}
              onClick={tools.onUp}
            >
              <Icon name="arrowUp" />
            </button>
            <button
              type="button"
              className="dw-tool"
              aria-label={`Move ${title} down`}
              disabled={!tools.canDown}
              onClick={tools.onDown}
            >
              <Icon name="arrowDown" />
            </button>
            <div className="seg-toggle dw-seg" role="group" aria-label={`${title} width`}>
              <button
                type="button"
                className={`seg ${size === "half" ? "active" : ""}`}
                aria-pressed={size === "half"}
                onClick={() => tools.onSize("half")}
              >
                Half
              </button>
              <button
                type="button"
                className={`seg ${size === "full" ? "active" : ""}`}
                aria-pressed={size === "full"}
                onClick={() => tools.onSize("full")}
              >
                Full
              </button>
            </div>
            <button
              type="button"
              className="dw-tool hide"
              aria-label={`Hide ${title}`}
              title="Hide"
              onClick={tools.onHide}
            >
              <Icon name="eyeOff" />
            </button>
          </div>
        )}
      </header>

      <div className="dw-body">{children}</div>
    </section>
  );
}
