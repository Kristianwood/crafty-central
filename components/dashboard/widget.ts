/* ============================================================
   Dashboard widgets — the contract.

   The host hands every widget the layout it is showing: the saved
   one normally, the working copy while the person is customising.
   A widget that has settings of its own (the stat row) reads and
   writes them through here rather than reaching into the workspace,
   so an unsaved arrangement is never half-applied.
   ============================================================ */

import type { ComponentType } from "react";
import type { DashboardLayout, Workspace } from "@/lib/types";

export interface WidgetProps {
  layout: DashboardLayout;
  /** True while the page is being arranged; bodies go inert. */
  editing: boolean;
  /** Only while editing: replace the working copy. */
  onLayout?: (next: DashboardLayout) => void;
}

export interface WidgetBadge {
  count: number;
  /** "alert" is the clay red — things that are owed a reply. */
  tone: "alert" | "neutral";
}

export interface WidgetEntry {
  Body: ComponentType<WidgetProps>;
  /** The count in the card header; null or zero hides it. */
  badge?: (ws: Workspace) => WidgetBadge | null;
}
