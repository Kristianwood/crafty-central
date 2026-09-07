/* ============================================================
   Crafty Central — invoice repository

   An invoice is a header row plus its lines, handed around as one
   Invoice object. The lines are replaced wholesale on save, the
   same way a job's days are — small and obvious beats a diff.

   Two things worth knowing:

   - An invoice with NO lines was drafted before 1.2. The domain
     prices it from its job (lib/domain.ts invoiceLines) exactly
     as the old build did, so nothing on an older database changes
     value on upgrade.
   - The PDF that went out is archived in invoice_documents when
     the invoice is marked sent, and that copy is what "the invoice
     we sent" means from then on, whatever the job does later.
   ============================================================ */

import { execute, query, queryOne, transaction } from "../db";
import { invoiceNumber, todayISO } from "../domain";
import type { BillTo, Invoice, InvoiceLine, InvoiceStatus } from "../types";

interface InvoiceRow {
  id: string;
  job_id: string;
  number: string;
  issued_on: string;
  due_on: string;
  status: InvoiceStatus;
  tax_rate: string;
  notes: string;
  sent_at: string | null;
  paid_at: string | null;
  bill_to_name: string;
  bill_to_address: string;
  bill_to_email: string;
  attn: string;
  has_document: number | null;
}

interface LineRow {
  invoice_id: string;
  position: number;
  description: string;
  qty: string;
  unit: string;
  unit_price: string;
  catalog_item_id: string | null;
  kit_id: string | null;
}

/** 'yyyy-mm-dd hh:mm:ss' from the database → ISO 8601 for the client. */
const isoDateTime = (s: string | null): string | null =>
  s ? new Date(s.replace(" ", "T")).toISOString() : null;

const mysqlDateTime = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
};

const toLine = (r: LineRow): InvoiceLine => ({
  description: r.description,
  qty: Number(r.qty),
  unit: r.unit,
  unitPrice: Number(r.unit_price),
  catalogItemId: r.catalog_item_id,
  kitId: r.kit_id,
});

function assemble(rows: InvoiceRow[], lines: LineRow[]): Invoice[] {
  const byId = new Map<string, Invoice>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      jobId: r.job_id,
      number: r.number,
      issuedOn: r.issued_on,
      dueOn: r.due_on,
      status: r.status,
      taxRate: Number(r.tax_rate),
      lines: [],
      notes: r.notes ?? "",
      sentAt: isoDateTime(r.sent_at),
      paidAt: isoDateTime(r.paid_at),
      billTo: {
        name: r.bill_to_name ?? "",
        address: r.bill_to_address ?? "",
        email: r.bill_to_email ?? "",
        attn: r.attn ?? "",
      },
      hasDocument: !!r.has_document,
    });
  }
  for (const l of lines) byId.get(l.invoice_id)?.lines.push(toLine(l));
  return [...byId.values()];
}

const SELECT = `SELECT i.*, d.invoice_id IS NOT NULL AS has_document
                  FROM invoices i
                  LEFT JOIN invoice_documents d ON d.invoice_id = i.id`;

export async function listInvoices(): Promise<Invoice[]> {
  const [rows, lines] = await Promise.all([
    query<InvoiceRow>(`${SELECT} ORDER BY i.issued_on DESC, i.number DESC`),
    query<LineRow>("SELECT * FROM invoice_lines ORDER BY invoice_id, position, id"),
  ]);
  return assemble(rows, lines);
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const [rows, lines] = await Promise.all([
    query<InvoiceRow>(`${SELECT} WHERE i.id = ?`, [id]),
    query<LineRow>("SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position, id", [id]),
  ]);
  return assemble(rows, lines)[0] ?? null;
}

export async function invoicesForJob(jobId: string): Promise<Invoice[]> {
  const [rows, lines] = await Promise.all([
    query<InvoiceRow>(`${SELECT} WHERE i.job_id = ? ORDER BY i.issued_on DESC`, [jobId]),
    query<LineRow>(
      `SELECT l.* FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
        WHERE i.job_id = ? ORDER BY l.invoice_id, l.position, l.id`,
      [jobId],
    ),
  ]);
  return assemble(rows, lines);
}

/**
 * Write the header and replace the lines, in one transaction.
 * sentAt / paidAt are written as given, so callers that change
 * status go through markInvoice() rather than this.
 */
export async function saveInvoice(inv: Invoice): Promise<Invoice> {
  await transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO invoices
         (id, job_id, number, issued_on, due_on, status, tax_rate, notes, sent_at, paid_at,
          bill_to_name, bill_to_address, bill_to_email, attn)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         number=VALUES(number), issued_on=VALUES(issued_on), due_on=VALUES(due_on),
         status=VALUES(status), tax_rate=VALUES(tax_rate), notes=VALUES(notes),
         sent_at=VALUES(sent_at), paid_at=VALUES(paid_at),
         bill_to_name=VALUES(bill_to_name), bill_to_address=VALUES(bill_to_address),
         bill_to_email=VALUES(bill_to_email), attn=VALUES(attn)`,
      [
        inv.id,
        inv.jobId,
        inv.number,
        inv.issuedOn,
        inv.dueOn,
        inv.status,
        inv.taxRate,
        inv.notes ?? "",
        inv.sentAt ? mysqlDateTime(new Date(inv.sentAt)) : null,
        inv.paidAt ? mysqlDateTime(new Date(inv.paidAt)) : null,
        inv.billTo?.name ?? "",
        inv.billTo?.address ?? "",
        inv.billTo?.email ?? "",
        inv.billTo?.attn ?? "",
      ],
    );
    await conn.execute("DELETE FROM invoice_lines WHERE invoice_id = ?", [inv.id]);
    for (const [i, l] of (inv.lines ?? []).entries()) {
      await conn.execute(
        `INSERT INTO invoice_lines
           (invoice_id, position, description, qty, unit, unit_price, catalog_item_id, kit_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          inv.id,
          i,
          l.description,
          l.qty,
          l.unit ?? "",
          l.unitPrice,
          l.catalogItemId ?? null,
          l.kitId ?? null,
        ],
      );
    }
  });
  return inv;
}

/** Status transitions, stamping the matching timestamp. */
export async function markInvoice(id: string, status: InvoiceStatus, when = new Date()): Promise<void> {
  const ts = mysqlDateTime(when);
  if (status === "sent") {
    await execute(
      "UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, ?), paid_at = NULL WHERE id = ?",
      [ts, id],
    );
  } else if (status === "paid") {
    await execute(
      "UPDATE invoices SET status = 'paid', sent_at = COALESCE(sent_at, ?), paid_at = ? WHERE id = ?",
      [ts, ts, id],
    );
  } else {
    await execute("UPDATE invoices SET status = 'draft', sent_at = NULL, paid_at = NULL WHERE id = ?", [
      id,
    ]);
  }
}

export async function deleteInvoice(id: string): Promise<void> {
  await execute("DELETE FROM invoices WHERE id = ?", [id]);
}

export async function invoiceCount(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM invoices");
  return Number(rows[0]?.n ?? 0);
}

/**
 * CR-<year>-<nnn>. The counter carries on from where the old build
 * started it (41), and steps past any number already taken so a
 * deleted draft never causes a duplicate.
 */
export async function nextInvoiceNumber(year = todayISO().slice(0, 4)): Promise<string> {
  const taken = new Set(
    (await query<{ number: string }>("SELECT number FROM invoices")).map((r) => r.number),
  );
  let n = taken.size + 41;
  while (taken.has(invoiceNumber(year, n))) n++;
  return invoiceNumber(year, n);
}

export const emptyBillTo = (): BillTo => ({ name: "", address: "", email: "", attn: "" });

/* ---------- archived PDFs ---------- */

export interface InvoiceDocument {
  filename: string;
  pdf: Buffer;
  createdAt: string;
}

export async function storeInvoiceDocument(
  invoiceId: string,
  filename: string,
  pdf: Buffer,
): Promise<void> {
  await execute(
    `INSERT INTO invoice_documents (invoice_id, filename, byte_size, pdf, created_at)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE filename=VALUES(filename), byte_size=VALUES(byte_size),
       pdf=VALUES(pdf), created_at=VALUES(created_at)`,
    [invoiceId, filename, pdf.length, pdf, mysqlDateTime(new Date())],
  );
}

export async function getInvoiceDocument(invoiceId: string): Promise<InvoiceDocument | null> {
  const r = await queryOne<{ filename: string; pdf: Buffer; created_at: string }>(
    "SELECT filename, pdf, created_at FROM invoice_documents WHERE invoice_id = ?",
    [invoiceId],
  );
  if (!r) return null;
  return {
    filename: r.filename,
    pdf: Buffer.isBuffer(r.pdf) ? r.pdf : Buffer.from(r.pdf),
    createdAt: isoDateTime(r.created_at) ?? "",
  };
}

export async function deleteInvoiceDocument(invoiceId: string): Promise<void> {
  await execute("DELETE FROM invoice_documents WHERE invoice_id = ?", [invoiceId]);
}
