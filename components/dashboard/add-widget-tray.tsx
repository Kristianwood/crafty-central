"use client";

/* The tray under the grid while customising: every widget this
   role may see that is not on the page yet, as a pill to put back.
   Adding one drops it at the end at its default width; the arrows
   on the card take it from there. */

import { Icon } from "@/components/icons";
import type { WidgetDef } from "@/lib/domain";

export function AddWidgetTray({
  available,
  nothingShown,
  onAdd,
}: {
  available: WidgetDef[];
  /** True when every widget has been hidden — worth a warning. */
  nothingShown: boolean;
  onAdd: (def: WidgetDef) => void;
}) {
  return (
    <div className="dash-tray">
      <div className="dash-tray-head">
        <span className="dash-tray-title">Add a widget</span>
        <span className="section-hint">
          {available.length
            ? "Hidden widgets wait here — tap one to put it back."
            : "Everything you can see is already on the page."}
        </span>
      </div>

      {available.length > 0 && (
        <div className="dash-tray-list">
          {available.map((w) => (
            <button
              type="button"
              key={w.id}
              className="tray-pill"
              aria-label={`Add ${w.label}`}
              onClick={() => onAdd(w)}
            >
              <Icon name="plus" />
              <span className="tp-text">
                <span className="tp-label">{w.label}</span>
                <span className="tp-hint">{w.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {nothingShown && (
        /* It used to say the default came back on save. It does not:
           an empty dashboard is now taken at face value, so the warning
           has to describe what actually happens. */
        <p className="dash-tray-warn">
          <Icon name="alert" /> Nothing is showing. Save it that way if you like — the tray stays
          here, and &ldquo;Reset to default&rdquo; brings everything back.
        </p>
      )}
    </div>
  );
}
