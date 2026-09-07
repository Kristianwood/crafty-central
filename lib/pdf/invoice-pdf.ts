/* ============================================================
   Crafty Central — the invoice PDF

   Renders an Invoice to a Letter-size PDF with pdfkit and hands
   back the bytes. Pure: the same invoice always renders the same
   document, which is what lets a draft be previewed live and a
   sent invoice be archived byte-for-byte.

   Only pdfkit's built-in Helvetica faces are used, so no font
   files ship with the app and nothing is read from disk but
   pdfkit's own metrics (see serverExternalPackages in
   next.config.ts for why that matters).
   ============================================================ */

import PDFDocument from "pdfkit";
import {
  invoiceLines,
  invoiceState,
  invoiceSubtotal,
  invoiceTax,
  invoiceTotal,
  lineAmount,
} from "../domain";
import { fmtDays, fmtMoney, fmtShort } from "../format";
import type { Invoice, Job, Settings } from "../types";

export interface InvoicePdfInput {
  invoice: Invoice;
  job: Job | null;
  settings: Settings;
}

/* Letter, 50pt margins → a 512pt-wide column. */
const PAGE_W = 612;
const MARGIN = 50;
const COL_W = PAGE_W - MARGIN * 2;
const BOTTOM = 742;

const INK = "#24221d";
const INK_2 = "#645c50";
const INK_3 = "#a19786";
const LINE = "#ddd2bf";
const ACCENT = "#2e6ba8";
const GREEN = "#56633f";
const RED = "#8c491a";
const SURFACE = "#f5efe2";

export const invoiceFilename = (inv: Invoice): string =>
  `${inv.number.replace(/[^A-Za-z0-9-]+/g, "_")}.pdf`;

export function renderInvoicePdf({ invoice: inv, job, settings }: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: MARGIN,
      info: {
        Title: `Invoice ${inv.number}`,
        Author: "Crafty",
        Subject: job ? `Craft service — ${job.productionName}` : "Craft service",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      draw(doc, inv, job, settings);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc: PDFKit.PDFDocument, inv: Invoice, job: Job | null, settings: Settings) {
  const state = invoiceState(inv);
  const lines = invoiceLines(inv, job ?? undefined, settings);
  const subtotal = invoiceSubtotal(inv, job ?? undefined, settings);
  const tax = invoiceTax(inv, job ?? undefined, settings);
  const total = invoiceTotal(inv, job ?? undefined, settings);

  /* ---- header ---- */
  let y = MARGIN;
  doc.font("Helvetica-Bold").fontSize(26).fillColor(INK).text("Crafty", MARGIN, y);
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(INK_3)
    .text("Craft service & catering · Toronto ON", MARGIN, y + 32);

  const title = state === "draft" ? "DRAFT INVOICE" : "INVOICE";
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(state === "draft" ? INK_3 : ACCENT)
    .text(title, MARGIN, y + 2, { width: COL_W, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(INK)
    .text(inv.number, MARGIN, y + 22, { width: COL_W, align: "right" });
  doc
    .fillColor(INK_2)
    .fontSize(9.5)
    .text(`Issued ${fmtShort(inv.issuedOn)} · Due ${fmtShort(inv.dueOn)}`, MARGIN, y + 37, {
      width: COL_W,
      align: "right",
    });

  if (state === "paid") {
    stamp(doc, "PAID", GREEN, y + 54);
  } else if (state === "overdue") {
    stamp(doc, "OVERDUE", RED, y + 54);
  }

  y += 78;
  rule(doc, y);
  y += 16;

  /* ---- bill to / job ---- */
  const half = COL_W / 2 - 10;
  const billTop = y;
  label(doc, "Bill to", MARGIN, y);
  y += 14;
  const billName = inv.billTo.name || job?.productionCompany || "—";
  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(billName, MARGIN, y, { width: half });
  y = doc.y + 2;
  if (inv.billTo.address) {
    doc.font("Helvetica").fontSize(10).fillColor(INK_2).text(inv.billTo.address, MARGIN, y, {
      width: half,
      lineGap: 1,
    });
    y = doc.y + 2;
  }
  if (inv.billTo.email) {
    doc.font("Helvetica").fontSize(9.5).fillColor(INK_2).text(inv.billTo.email, MARGIN, y, { width: half });
    y = doc.y + 2;
  }
  if (inv.billTo.attn) {
    doc.font("Helvetica").fontSize(9.5).fillColor(INK_2).text(`Attn: ${inv.billTo.attn}`, MARGIN, y, {
      width: half,
    });
    y = doc.y + 2;
  }
  const billBottom = y;

  /* right column: the job */
  let ry = billTop;
  const rx = MARGIN + COL_W / 2 + 10;
  label(doc, "Production", rx, ry);
  ry += 14;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(job?.productionName ?? "—", rx, ry, { width: half });
  ry = doc.y + 2;
  const facts: [string, string][] = [];
  if (job?.shootDays.length) facts.push(["Shoot days", fmtDays(job.shootDays)]);
  if (job?.location) facts.push(["Location", job.location]);
  if (job?.pm) facts.push(["Production manager", job.pm]);
  if (job?.agency) facts.push(["Agency", job.agency]);
  for (const [k, v] of facts) {
    doc.font("Helvetica").fontSize(9.5).fillColor(INK_3).text(`${k}: `, rx, ry, { continued: true });
    doc.fillColor(INK_2).text(v, { width: half });
    ry = doc.y + 1;
  }

  y = Math.max(billBottom, ry) + 18;

  /* ---- lines ---- */
  const cDesc = MARGIN;
  const cQty = MARGIN + COL_W - 260;
  const cRate = MARGIN + COL_W - 170;
  const cAmt = MARGIN + COL_W - 80;
  const wDesc = cQty - cDesc - 10;

  const header = () => {
    doc.rect(MARGIN, y, COL_W, 20).fill(SURFACE);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(INK_3);
    doc.text("DESCRIPTION", cDesc + 6, y + 6, { width: wDesc });
    doc.text("QTY", cQty, y + 6, { width: 80, align: "right" });
    doc.text("RATE", cRate, y + 6, { width: 80, align: "right" });
    doc.text("AMOUNT", cAmt, y + 6, { width: 80, align: "right" });
    y += 26;
  };
  header();

  for (const l of lines) {
    doc.font("Helvetica").fontSize(10);
    const h = Math.max(14, doc.heightOfString(l.description || "—", { width: wDesc }));
    if (y + h + 10 > BOTTOM) {
      doc.addPage();
      y = MARGIN;
      header();
    }
    doc.fillColor(INK).text(l.description || "—", cDesc + 6, y, { width: wDesc });
    const qty = `${trimNumber(l.qty)}${l.unit ? " " + l.unit : ""}`;
    doc.fillColor(INK_2).text(qty, cQty, y, { width: 80, align: "right" });
    doc.text(fmtMoney(l.unitPrice), cRate, y, { width: 80, align: "right" });
    doc.fillColor(INK).text(fmtMoney(lineAmount(l)), cAmt, y, { width: 80, align: "right" });
    y += h + 8;
    doc.moveTo(MARGIN, y - 3).lineTo(MARGIN + COL_W, y - 3).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  if (!lines.length) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(INK_3).text("No line items.", cDesc + 6, y);
    y += 20;
  }

  /* ---- totals ---- */
  if (y + 90 > BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }
  y += 6;
  const tLabelX = cRate - 60;
  const totalRow = (k: string, v: string, bold = false) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 12 : 10)
      .fillColor(bold ? INK : INK_2)
      .text(k, tLabelX, y, { width: cAmt - tLabelX - 6, align: "right" });
    doc.fillColor(INK).text(v, cAmt, y, { width: 80, align: "right" });
    y += bold ? 20 : 16;
  };
  totalRow("Subtotal", fmtMoney(subtotal));
  totalRow(`HST (${trimNumber(inv.taxRate * 100)}%)`, fmtMoney(tax));
  doc.moveTo(tLabelX, y + 1).lineTo(MARGIN + COL_W, y + 1).lineWidth(1).strokeColor(INK).stroke();
  y += 8;
  totalRow(state === "paid" ? "Total (paid)" : "Total due", fmtMoney(total), true);

  /* ---- payment line ---- */
  y += 6;
  const when =
    state === "paid" && inv.paidAt
      ? `Paid ${fmtShort(inv.paidAt.slice(0, 10))}. Thank you.`
      : `Payment due ${fmtShort(inv.dueOn)} · e-transfer or cheque payable to Crafty.`;
  doc.font("Helvetica").fontSize(9.5).fillColor(INK_2).text(when, MARGIN, y, { width: COL_W });
  y = doc.y + 14;

  /* ---- notes ---- */
  if (inv.notes.trim()) {
    if (y + 60 > BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
    label(doc, "Notes", MARGIN, y);
    y += 14;
    doc.font("Helvetica").fontSize(10).fillColor(INK_2).text(inv.notes.trim(), MARGIN, y, {
      width: COL_W,
      lineGap: 2,
    });
    y = doc.y + 10;
  }

  /* ---- footer on every page ---- */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(INK_3)
      .text(
        `Crafty · food truck & craft service for film · Toronto, ON        ${inv.number} · page ${
          i - range.start + 1
        } of ${range.count}`,
        MARGIN,
        PAGE_W === 612 ? 760 : 760,
        { width: COL_W, align: "center", lineBreak: false },
      );
  }
}

function label(doc: PDFKit.PDFDocument, text: string, x: number, y: number) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK_3).text(text.toUpperCase(), x, y, {
    characterSpacing: 1,
  });
}

function rule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(MARGIN, y).lineTo(MARGIN + COL_W, y).lineWidth(0.75).strokeColor(LINE).stroke();
}

function stamp(doc: PDFKit.PDFDocument, text: string, color: string, y: number) {
  const w = 74;
  const x = MARGIN + COL_W - w;
  doc.roundedRect(x, y, w, 18, 9).lineWidth(1.2).strokeColor(color).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(color)
    .text(text, x, y + 5, { width: w, align: "center", characterSpacing: 1 });
}

/** 2 → "2", 2.5 → "2.5", 62 → "62" — qty and rate columns without trailing .00. */
const trimNumber = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
