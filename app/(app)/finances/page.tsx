"use client";

/* ============================================================
   Finances (admin only) — three tabs: the overview, invoice
   tracking, and the kits & catalogue an invoice is built from.

   The tab is component state seeded from ?tab= so a link can
   land on one directly (the invoice builder points at the Kits
   tab when there are none yet). A later change to ?tab= wins
   over the last click, which is the "derive from props with a
   memory of what they were" pattern rather than an effect.
   ============================================================ */

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { InvoicesTab } from "@/components/finances/invoices-tab";
import { KitsTab } from "@/components/finances/kits-tab";
import { OverviewTab } from "@/components/finances/overview-tab";
import { useWorkspace } from "@/components/workspace-provider";

type Tab = "overview" | "invoices" | "kits";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "invoices", label: "Invoices", icon: "receipt" },
  { id: "kits", label: "Kits & catalogue", icon: "box" },
];

function parseTab(v: string | null): Tab {
  if (v === "invoices") return "invoices";
  if (v === "kits" || v === "catalogue" || v === "catalog") return "kits";
  return "overview";
}

/* useSearchParams needs a suspense boundary above it; the view is
   nothing without knowing its tab, so the boundary lives here. */
export default function FinancesPage() {
  return (
    <Suspense fallback={null}>
      <FinancesView />
    </Suspense>
  );
}

function FinancesView() {
  const { can } = useWorkspace();
  const paramTab = parseTab(useSearchParams().get("tab"));
  const [picked, setPicked] = useState<{ from: Tab; tab: Tab }>({ from: paramTab, tab: paramTab });
  const tab = picked.from === paramTab ? picked.tab : paramTab;
  const show = (t: Tab) => setPicked({ from: paramTab, tab: t });

  /* The route is admin-gated by the shell too, but the view kept its
     own message and it is the one a demoted account would land on. */
  if (!can("finances")) {
    return (
      <div className="empty view-enter">
        <Icon name="finances" />
        <div className="e-title">Admins only</div>
        <div className="e-sub">Financials are only visible to admin accounts.</div>
      </div>
    );
  }

  return (
    <div className="view-enter">
      <div className="seg-toggle fin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`seg ${tab === t.id ? "active" : ""}`.trim()}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => show(t.id)}
          >
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab onShowInvoices={() => show("invoices")} />}
      {tab === "invoices" && <InvoicesTab />}
      {tab === "kits" && <KitsTab />}
    </div>
  );
}
