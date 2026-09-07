/* ============================================================
   The invoice as a PDF.

   Sent and paid invoices come back as the archived copy — the
   bytes that actually went out. Drafts (and ?live=1 on anything)
   are rendered on the spot from the current data.

   Binary, so it does not go through handle(); the same 401/403
   mapping is done here by hand.
   ============================================================ */

import { NextResponse } from "next/server";
import { Forbidden, Unauthorized, requirePermission } from "@/lib/auth";
import { invoiceFilename, renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getJob } from "@/lib/repo/jobs";
import { getInvoice, getInvoiceDocument } from "@/lib/repo/invoices";
import { getSettings } from "@/lib/repo/misc";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requirePermission("finances");
    const { id } = await params;
    const url = new URL(req.url);
    const live = url.searchParams.get("live") === "1";
    const download = url.searchParams.get("download") === "1";

    const inv = await getInvoice(id);
    if (!inv) return NextResponse.json({ error: "That invoice is gone." }, { status: 404 });

    let filename = invoiceFilename(inv);
    let pdf: Buffer | null = null;

    if (!live && inv.hasDocument) {
      const doc = await getInvoiceDocument(id);
      if (doc) {
        pdf = doc.pdf;
        filename = doc.filename || filename;
      }
    }
    if (!pdf) {
      const [job, settings] = await Promise.all([getJob(inv.jobId), getSettings()]);
      pdf = await renderInvoicePdf({ invoice: inv, job, settings });
    }

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Unauthorized) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (err instanceof Forbidden) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Invoice PDF error:", err);
    return NextResponse.json({ error: "Could not build the PDF." }, { status: 500 });
  }
}
