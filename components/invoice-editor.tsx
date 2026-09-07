"use client";

/* ============================================================
   The invoice builder.

   Opened as a modal for one invoice id and reads that invoice
   back out of the workspace on every render, so each save (which
   re-fetches the whole snapshot) shows up here with no
   bookkeeping. If the id ever vanishes — deleted from another
   tab, say — the modal lets itself out.

   A draft is edited in local form state and pushed up whole on
   "Save draft", the way a job's days are: dates, HST, bill-to,
   every line, notes. Numbers stay as the typed string while the
   cursor is in them and are coerced on the way out, so "12." is
   never snapped to 12 mid-keystroke and NaN never reaches state.

   Once an invoice has gone out it is shown as the document it
   became — priced from its own frozen lines, exactly like the
   archived PDF — with the few things that can still happen to it.
   ============================================================ */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  catalogLine,
  invoiceEditable,
  invoiceLines,
  invoiceState,
  invoiceSubtotal,
  invoiceTax,
  invoiceTotal,
  kitLines,
  kitTotal,
  lineAmount,
  type InvoiceState,
} from "@/lib/domain";
import { fmtMoney, fmtShort } from "@/lib/format";
import type { BillTo, Invoice, InvoiceLine, Job, Settings } from "@/lib/types";
import { InvoiceDoc } from "./finances/invoice-doc";
import { InvoiceStatePill, serverToday } from "./finances/invoice-pill";
import { Icon } from "./icons";
import { useWorkspace } from "./workspace-provider";

export function InvoiceEditor({ invoiceId }: { invoiceId: string }) {
  const { ws, job, closeModal } = useWorkspace();
  const inv = ws.invoices.find((i) => i.id === invoiceId);

  /* Gone from the snapshot means gone for good; nothing to edit. */
  useEffect(() => {
    if (!inv) closeModal();
  }, [inv, closeModal]);

  if (!inv) return null;
  const j = job(inv.jobId);

  /* Keyed on the id so a different invoice never inherits this
     one's half-edited form. */
  return invoiceEditable(inv) ? (
    <DraftEditor key={inv.id} inv={inv} job={j} />
  ) : (
    <SentView key={inv.id} inv={inv} job={j} />
  );
}

const pdfUrl = (id: string, q = "") => `/api/invoices/${id}/pdf${q}`;

/* ---------- header, shared by both views ---------- */

function EditorHead({
  inv,
  job,
  state,
  onClose,
}: {
  inv: Invoice;
  job: Job | undefined;
  state: InvoiceState;
  onClose: () => void;
}) {
  return (
    <div className="modal-head inv-head">
      <div>
        <div className="modal-title">Invoice {inv.number}</div>
        <div className="modal-sub">
          {job ? `${job.productionName} · ${job.productionCompany}` : "Job no longer on the books"}
        </div>
      </div>
      <div className="inv-head-side">
        <InvoiceStatePill state={state} />
        <button className="panel-close" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Draft: the builder
   ============================================================ */

interface LineDraft {
  key: number;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  catalogItemId: string | null;
  kitId: string | null;
}

interface Form {
  issuedOn: string;
  dueOn: string;
  /** Percent, as typed — "13", not 0.13. Stored as a fraction. */
  taxPct: string;
  billTo: BillTo;
  notes: string;
  lines: LineDraft[];
}

/** 0.13 → "13", 0.0825 → "8.25". */
const pctOf = (rate: number): string => String(Math.round(rate * 10000) / 100);

const toDraft = (l: InvoiceLine, key: number): LineDraft => ({
  key,
  description: l.description,
  qty: String(l.qty),
  unit: l.unit,
  unitPrice: String(l.unitPrice),
  catalogItemId: l.catalogItemId ?? null,
  kitId: l.kitId ?? null,
});

const toLine = (d: LineDraft): InvoiceLine => ({
  description: d.description,
  qty: Number(d.qty) || 0,
  unit: d.unit,
  unitPrice: Number(d.unitPrice) || 0,
  catalogItemId: d.catalogItemId,
  kitId: d.kitId,
});

/* An invoice drafted before lines existed has none; the form starts
   from what the domain would print for it, and the first save makes
   those lines its own. */
const fromInvoice = (inv: Invoice, job: Job | undefined, settings: Settings): Form => ({
  issuedOn: inv.issuedOn,
  dueOn: inv.dueOn,
  taxPct: pctOf(inv.taxRate),
  billTo: { ...inv.billTo },
  notes: inv.notes,
  lines: invoiceLines(inv, job, settings).map(toDraft),
});

const nextKey = (lines: LineDraft[]) => lines.reduce((m, l) => Math.max(m, l.key), -1) + 1;

function DraftEditor({ inv, job }: { inv: Invoice; job: Job | undefined }) {
  const { ws, mutate, toast, closeModal } = useWorkspace();
  const [form, setForm] = useState<Form>(() => fromInvoice(inv, job, ws.settings));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kitId, setKitId] = useState("");
  const [catId, setCatId] = useState("");
  const [catQty, setCatQty] = useState("1");

  const activeItems = ws.catalog
    .filter((c) => c.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const kits = ws.kits.slice().sort((a, b) => a.name.localeCompare(b.name));

  /* Every edit goes through here so dirty can never drift from the form. */
  const patch = (fn: (f: Form) => Form) => {
    setForm(fn);
    setDirty(true);
  };
  const setField = <K extends keyof Form>(k: K, v: Form[K]) => patch((f) => ({ ...f, [k]: v }));
  const setBill = (k: keyof BillTo, v: string) =>
    patch((f) => ({ ...f, billTo: { ...f.billTo, [k]: v } }));
  const setLine = (key: number, p: Partial<LineDraft>) =>
    patch((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  const removeLine = (key: number) =>
    patch((f) => ({ ...f, lines: f.lines.filter((l) => l.key !== key) }));
  const appendLines = (added: InvoiceLine[]) =>
    patch((f) => {
      let k = nextKey(f.lines);
      return { ...f, lines: [...f.lines, ...added.map((l) => toDraft(l, k++))] };
    });

  /* Live totals: the form as an Invoice, through the same helpers
     the PDF uses. invoiceLines() prices an empty draft from the job
     and the server refuses to save one, so an empty table is shown
     as zero rather than as a phantom quote. */
  const lines = form.lines.map(toLine);
  const taxRate = (Number(form.taxPct) || 0) / 100;
  const tmp: Invoice = { ...inv, taxRate, lines };
  const priceJob = lines.length ? job : undefined;
  const subtotal = invoiceSubtotal(tmp, priceJob, ws.settings);
  const tax = invoiceTax(tmp, priceJob, ws.settings);
  const total = invoiceTotal(tmp, priceJob, ws.settings);

  function addKit() {
    const kit = kits.find((k) => k.id === kitId);
    if (!kit) return;
    const added = kitLines(kit, ws.catalog);
    if (!added.length) {
      toast("That kit has no items left in the catalogue", "alert");
      return;
    }
    appendLines(added);
    setKitId("");
    toast(`${kit.name} added — ${added.length} line${added.length === 1 ? "" : "s"}`, "box");
  }

  function addCatalog() {
    const item = activeItems.find((c) => c.id === catId);
    if (!item) return;
    const qty = Number(catQty);
    appendLines([catalogLine(item, Number.isFinite(qty) && qty > 0 ? qty : 1)]);
    setCatId("");
    setCatQty("1");
  }

  const addCustom = () =>
    appendLines([{ description: "", qty: 1, unit: "", unitPrice: 0, catalogItemId: null, kitId: null }]);

  function problem(): string | null {
    if (!form.issuedOn || !form.dueOn) return "Set the issue and due dates";
    if (form.dueOn < form.issuedOn) return "The due date is before the issue date";
    if (!form.lines.length) return "An invoice needs at least one line";
    if (form.lines.some((l) => !l.description.trim())) return "Give every line a description, or remove it";
    if (lines.some((l) => l.qty < 0 || l.unitPrice < 0)) return "Quantities and rates cannot be negative";
    return null;
  }

  /** Save the draft; the invoice as the server stored it, or null. */
  async function save(): Promise<Invoice | null> {
    const why = problem();
    if (why) {
      toast(why, "alert");
      return null;
    }
    setBusy(true);
    try {
      const out = await mutate<{ invoice: Invoice }>("/api/invoices", {
        id: inv.id,
        jobId: inv.jobId,
        issuedOn: form.issuedOn,
        dueOn: form.dueOn,
        taxRate,
        notes: form.notes,
        lines: lines.map((l) => ({ ...l, description: l.description.trim() })),
        billTo: form.billTo,
      });
      /* Re-seed from what was stored — cents rounded, blanks dropped —
         so the form and the record agree from here on. */
      setForm(fromInvoice(out.invoice, job, ws.settings));
      setDirty(false);
      return out.invoice;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (await save()) toast("Draft saved", "check");
  }

  async function onPreview() {
    if (!dirty) {
      window.open(pdfUrl(inv.id, "?live=1"), "_blank", "noopener");
      return;
    }
    /* Open the tab before the await, while this still counts as the
       click that asked for it; the popup blocker sees nothing else. */
    const w = window.open("", "_blank");
    const saved = await save();
    if (!saved) {
      w?.close();
      return;
    }
    if (w) w.location.href = pdfUrl(inv.id, "?live=1");
    else window.open(pdfUrl(inv.id, "?live=1"), "_blank", "noopener");
  }

  async function onSend() {
    if (dirty && !(await save())) return;
    if (
      !confirm(
        `Mark ${inv.number} as sent? The PDF is archived exactly as it is now and the lines lock.`,
      )
    )
      return;
    setBusy(true);
    try {
      await mutate(`/api/invoices/${inv.id}`, { status: "sent" }, "PATCH");
      toast(`Invoice ${inv.number} sent — PDF archived`, "send");
    } catch {
      /* mutate() has already toasted the reason */
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete draft ${inv.number}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await mutate(`/api/invoices/${inv.id}`, undefined, "DELETE");
      closeModal();
      toast("Draft deleted", "x");
    } catch {
      setBusy(false);
    }
  }

  /* Leaving with edits pending asks first; the scrim and Escape are
     the host's and do not, so this is the one polite exit. */
  function onClose() {
    if (dirty && !confirm("Discard unsaved changes to this draft?")) return;
    closeModal();
  }

  return (
    <div className="inv-editor">
      <EditorHead inv={inv} job={job} state="draft" onClose={onClose} />

      <div className="inv-meta">
        <div className="field">
          <label>Issued on</label>
          <input
            type="date"
            value={form.issuedOn}
            onChange={(e) => setField("issuedOn", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Due on</label>
          <input type="date" value={form.dueOn} onChange={(e) => setField("dueOn", e.target.value)} />
        </div>
        <div className="field">
          <label>HST %</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            value={form.taxPct}
            onChange={(e) => setField("taxPct", e.target.value)}
          />
        </div>
      </div>

      <div className="inv-billto">
        <div className="inv-block-label" style={{ gridColumn: "1 / -1" }}>
          Bill to
        </div>
        <div className="field">
          <label>Company</label>
          <input
            type="text"
            value={form.billTo.name}
            onChange={(e) => setBill("name", e.target.value)}
            placeholder={job?.productionCompany || "Production company"}
          />
        </div>
        <div className="field">
          <label>Attn</label>
          <input
            type="text"
            value={form.billTo.attn}
            onChange={(e) => setBill("attn", e.target.value)}
            placeholder="Who reads it"
          />
        </div>
        <div className="field">
          <label>Billing address</label>
          <textarea
            rows={3}
            value={form.billTo.address}
            onChange={(e) => setBill("address", e.target.value)}
            placeholder={"Street\nCity, Province  Postal"}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={form.billTo.email}
            onChange={(e) => setBill("email", e.target.value)}
            placeholder="accounts@production.com"
          />
        </div>
      </div>

      <div>
        <div className="inv-block-label">Lines</div>
        {form.lines.length ? (
          <table className="inv-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num col-qty">Qty</th>
                <th className="col-unit">Unit</th>
                <th className="num col-rate">Rate</th>
                <th className="num col-amt">Amount</th>
                <th className="col-x" />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l) => (
                <tr key={l.key}>
                  <td data-label="Description">
                    <input
                      type="text"
                      value={l.description}
                      onChange={(e) => setLine(l.key, { description: e.target.value })}
                      placeholder="What was provided"
                    />
                  </td>
                  <td data-label="Qty" className="num">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    />
                  </td>
                  <td data-label="Unit">
                    <input
                      type="text"
                      value={l.unit}
                      onChange={(e) => setLine(l.key, { unit: e.target.value })}
                      placeholder="each"
                    />
                  </td>
                  <td data-label="Rate" className="num">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={l.unitPrice}
                      onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                    />
                  </td>
                  <td data-label="Amount" className="num inv-amount">
                    {fmtMoney(lineAmount(toLine(l)))}
                  </td>
                  <td className="inv-remove">
                    <button
                      type="button"
                      className="crew-remove"
                      aria-label="Remove line"
                      onClick={() => removeLine(l.key)}
                    >
                      <Icon name="x" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="inv-lines-empty">
            No lines yet — add a kit, pick from the catalogue, or write one in.
          </div>
        )}
      </div>

      <div className="inv-add-row">
        <div className="inv-add">
          <label>Add a kit</label>
          <div className="inv-add-ctl">
            <select value={kitId} onChange={(e) => setKitId(e.target.value)} disabled={!kits.length}>
              <option value="">{kits.length ? "Choose a kit…" : "No kits yet"}</option>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} — {fmtMoney(kitTotal(k, ws.catalog))}
                </option>
              ))}
            </select>
            <button type="button" className="btn sm" onClick={addKit} disabled={!kitId}>
              <Icon name="box" /> Add
            </button>
          </div>
          {!kits.length && (
            <div className="hint">
              No kits yet —{" "}
              <Link
                href="/finances?tab=kits"
                onClick={(e) => {
                  if (dirty && !confirm("Discard unsaved changes to this draft?")) {
                    e.preventDefault();
                    return;
                  }
                  closeModal();
                }}
              >
                build one under Kits &amp; catalogue
              </Link>
              .
            </div>
          )}
        </div>

        <div className="inv-add">
          <label>Add from catalogue</label>
          <div className="inv-add-ctl">
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              disabled={!activeItems.length}
            >
              <option value="">{activeItems.length ? "Choose an item…" : "Nothing active"}</option>
              {activeItems.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {fmtMoney(c.unitPrice)} / {c.unit || "each"}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={catQty}
              aria-label="Quantity"
              onChange={(e) => setCatQty(e.target.value)}
              disabled={!activeItems.length}
            />
            <button type="button" className="btn sm" onClick={addCatalog} disabled={!catId}>
              <Icon name="plus" /> Add
            </button>
          </div>
        </div>

        <div className="inv-add">
          <label>Or</label>
          <button type="button" className="btn sm" onClick={addCustom}>
            <Icon name="edit" /> Add custom line
          </button>
        </div>
      </div>

      <div className="inv-bottom">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Notes on the invoice</label>
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="Payment terms, PO number, a thank-you — printed under the totals."
          />
        </div>
        <div className="inv-totals">
          <div>
            <span>Subtotal</span>
            <b>{fmtMoney(subtotal)}</b>
          </div>
          <div>
            <span>HST ({form.taxPct.trim() || "0"}%)</span>
            <b>{fmtMoney(tax)}</b>
          </div>
          <div className="grand">
            <span>Total</span>
            <b>{fmtMoney(total)}</b>
          </div>
        </div>
      </div>

      <div className="modal-foot inv-foot">
        <button
          type="button"
          className="btn danger"
          style={{ marginRight: "auto" }}
          onClick={onDelete}
          disabled={busy}
        >
          <Icon name="x" /> Delete draft
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={onPreview} disabled={busy}>
          <Icon name="external" /> Preview PDF
        </button>
        <button type="button" className="btn" onClick={onSave} disabled={busy || !dirty}>
          <Icon name="check" /> {dirty ? "Save draft" : "Saved"}
        </button>
        <button type="button" className="btn primary" onClick={onSend} disabled={busy}>
          <Icon name="send" /> Mark sent
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Sent / overdue / paid: the document, and what is left to do
   ============================================================ */

function Step({ done, label, when }: { done: boolean; label: string; when: string }) {
  return (
    <div className={`inv-step ${done ? "done" : ""}`.trim()}>
      <span className="st-dot">{done && <Icon name="check" />}</span>
      <span className="st-label">{label}</span>
      <span className="st-when">{when}</span>
    </div>
  );
}

function SentView({ inv, job }: { inv: Invoice; job: Job | undefined }) {
  const { ws, mutate, toast, closeModal } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const state = invoiceState(inv, serverToday(ws.now));

  async function markPaid() {
    if (!confirm(`Mark ${inv.number} as paid? A paid invoice cannot be reopened.`)) return;
    setBusy(true);
    try {
      await mutate(`/api/invoices/${inv.id}`, { status: "paid" }, "PATCH");
      toast(`${inv.number} marked paid`, "check");
    } catch {
      /* toasted by mutate() */
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (
      !confirm(
        `Reopen ${inv.number} as a draft? The archived PDF is discarded and the lines unlock — the next "Mark sent" archives a fresh copy.`,
      )
    )
      return;
    setBusy(true);
    try {
      await mutate(`/api/invoices/${inv.id}`, { status: "draft" }, "PATCH");
      toast(`${inv.number} is a draft again`, "refresh");
    } catch {
      /* toasted by mutate() */
    } finally {
      setBusy(false);
    }
  }

  const sentOn = inv.sentAt ? fmtShort(inv.sentAt.slice(0, 10)) : "—";
  const paidOn = inv.paidAt ? fmtShort(inv.paidAt.slice(0, 10)) : "—";

  return (
    <div className="inv-editor">
      <EditorHead inv={inv} job={job} state={state} onClose={closeModal} />

      <div className="inv-timeline">
        <Step done label="Drafted" when={fmtShort(inv.issuedOn)} />
        <Step done={inv.status !== "draft"} label="Sent" when={sentOn} />
        <Step done={inv.status === "paid"} label="Paid" when={paidOn} />
      </div>

      <InvoiceDoc job={job} invoice={inv} />

      <div className="modal-foot inv-foot">
        <a className="btn" href={pdfUrl(inv.id, "?download=1")} target="_blank" rel="noopener">
          <Icon name="download" /> Download PDF{inv.hasDocument ? " (as sent)" : ""}
        </a>
        <span className="inv-hint" style={{ marginRight: "auto" }}>
          {inv.hasDocument ? "The archived copy — the bytes that went out." : "Rendered live."}
        </span>
        {state !== "paid" && (
          <button type="button" className="btn" onClick={reopen} disabled={busy}>
            <Icon name="refresh" /> Reopen as draft
          </button>
        )}
        {state !== "paid" && (
          <button type="button" className="btn primary" onClick={markPaid} disabled={busy}>
            <Icon name="check" /> Mark paid
          </button>
        )}
        <button type="button" className="btn" onClick={closeModal}>
          Close
        </button>
      </div>
    </div>
  );
}
