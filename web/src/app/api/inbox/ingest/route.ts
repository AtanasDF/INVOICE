import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_TYPES, MAX_FILE_BYTES, type ScanResult, extractDocuments } from "@/lib/scanExtraction";
import { documentDetailsFromScan } from "@/lib/scanClient";
import { getFxRate } from "@/lib/fx";
import type { DocumentType } from "@/lib/storage";
import { storeImageForUser } from "@/lib/receiptImagesServer";
import { pdfWithPages } from "@/lib/pdfPages";
import { todayISO } from "@/lib/today";
import { vatForReading, workedOutNote } from "@/lib/vatFromRate";

export const runtime = "nodejs";

// Called by the Cloudflare Worker (worker/) after it parses an inbound
// email at u-<token>@invoiceover.com. Every receipt this creates starts
// needs_review = true -- there's nobody watching the way there is on the
// live scan screen, so nothing from email becomes "real" data until the
// account holder has actually checked it (see /receipts/review).

const MAX_ATTACHMENTS = 5;

type IngestAttachment = { filename: string; mimeType: string; base64: string };
type IngestBody = { token?: string; from?: string; subject?: string; textBody?: string; attachments?: IngestAttachment[] };

function convertToGbp(total: number, vat: number, rate: number) {
  const totalGbp = total * rate;
  const vatGbp = vat * rate;
  return { netGbp: Math.max(0, totalGbp - vatGbp), vatGbp };
}

// Nobody sees the scan screen's "could also be ..." prompt for an emailed
// document, so the ambiguity has to travel with the row into the review
// queue or it's silently lost.
function dateCue(label: string, printed: string | null, iso: string | null, alternative: string | null): string {
  const alt = alternative ? `; could be ${alternative}` : "";
  return `${label} read as ${printed} as ${iso ?? "unreadable"}${alt} — check this one`;
}

// An attachment holding several documents gives a row for each: a PDF cut
// down to that document's pages where it can be, otherwise the whole
// attachment with a note saying which part is this one.
async function documentFile(attachment: IngestAttachment, documents: ScanResult[], index: number) {
  const result = documents[index];
  if (documents.length === 1) return { base64: attachment.base64, note: null };
  const where = `Document ${index + 1} of ${documents.length} in ${attachment.filename || "this attachment"}`;
  const shared = (page: number) => documents.some((d) => d !== result && (!d.pages.length || d.pages.includes(page)));
  if (attachment.mimeType === "application/pdf" && result.pages.length) {
    try {
      const { dataUrl } = await pdfWithPages(attachment.base64, result.pages.map((page) => ({ page, box: shared(page) ? result.box : null })));
      return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), note: `${where}.` };
    } catch {}
  }
  const pages = result.pages.length ? ` (page${result.pages.length > 1 ? "s" : ""} ${result.pages.join(", ")})` : "";
  return { base64: attachment.base64, note: `${where}${pages}.` };
}

export async function POST(req: Request) {
  const webhookSecret = process.env.INBOX_WEBHOOK_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anthropicKey) {
    return NextResponse.json({ error: "Inbox import isn't fully configured on this deployment." }, { status: 500 });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!body.token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Generic "not found" either way -- an unrecognized token shouldn't
    // reveal whether it's simply wrong vs. once-valid-now-regenerated.
    const { data: profile, error: profileErr } = await admin
      .from("business_profile")
      .select("user_id")
      .eq("inbox_token", body.token)
      .maybeSingle();
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Unknown import address." }, { status: 404 });
    }
    const userId = profile.user_id as string;

    // A PDF or photo a mail gateway labelled application/octet-stream is
    // still one; the Worker recovers the type the same way, this is for
    // anything else that posts here.
    const BY_EXTENSION: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    const typed = (a: IngestAttachment): IngestAttachment => {
      if (a.mimeType !== "application/octet-stream") return a;
      const ext = /\.([a-z0-9]+)$/i.exec(a.filename ?? "")?.[1]?.toLowerCase();
      return ext && BY_EXTENSION[ext] ? { ...a, mimeType: BY_EXTENSION[ext] } : a;
    };
    const usableAttachments = (body.attachments ?? [])
      .map(typed)
      .filter((a) => ALLOWED_TYPES.includes(a.mimeType as (typeof ALLOWED_TYPES)[number]))
      .filter((a) => (a.base64.length * 3) / 4 <= MAX_FILE_BYTES)
      .slice(0, MAX_ATTACHMENTS);

    const created: string[] = [];

    // A document that could not be read must still be visible. The reader
    // fails for ordinary reasons -- the model is busy (429), overloaded
    // (529), or the read runs past its token budget -- and until now that
    // unwound to a 500 and the attachment was simply gone: no retry, no
    // bounce to the sender, nothing in the app, and the only trace a line
    // in `wrangler tail` that nobody is watching. Filing it for review with
    // the document attached is the same promise the no-attachment path
    // above already makes.
    const fileUnread = async (attachment: { filename: string; mimeType: string; base64: string }, why: string) => {
      const stored = await storeImageForUser(admin, userId, attachment.mimeType, attachment.base64).catch(() => null);
      const { data, error } = await admin
        .from("receipts")
        .insert({
          user_id: userId,
          client_id: null,
          date: todayISO(),
          vendor: (attachment.filename || body.subject || body.from || "Emailed document").slice(0, 200),
          category: null,
          amount: 0,
          vat_amount: 0,
          image_data_url: stored,
          notes: `This came in by email and could not be read automatically (${why}). The document is attached — fill the figures in by hand, or discard it.\n\nFrom: ${body.from || "unknown"}\nSubject: ${body.subject || ""}`,
          starred: false,
          needs_review: true,
          warranty_months: null,
          tags: ["via-email", "unread"],
          line_items: [],
        })
        .select("id")
        .single();
      if (!error && data) created.push(data.id);
      return !error;
    };

    if (usableAttachments.length === 0) {
      // Nothing extractable -- still surface the email itself rather than
      // silently dropping it, so it's at least visible that something
      // came in and needs a manual look.
      const { data, error } = await admin
        .from("receipts")
        .insert({
          user_id: userId,
          client_id: null,
          date: todayISO(),
          vendor: (body.subject || body.from || "Emailed receipt").slice(0, 200),
          category: null,
          amount: 0,
          vat_amount: 0,
          image_data_url: null,
          notes: `From: ${body.from || "unknown"}\nSubject: ${body.subject || ""}\n\n${(body.textBody || "").slice(0, 2000)}`,
          starred: false,
          needs_review: true,
          warranty_months: null,
          tags: ["via-email"],
          line_items: [],
        })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      created.push(data.id);
      return NextResponse.json({ created: created.length, note: "no usable attachment, filed the email itself" });
    }

    for (const attachment of usableAttachments) {
      let documents;
      try {
        documents = await extractDocuments([{ mediaType: attachment.mimeType, base64: attachment.base64 }], []);
      } catch (err) {
        await fileUnread(attachment, err instanceof Error ? err.message.slice(0, 120) : "the reader failed");
        continue;
      }
      for (const [index, result] of documents.entries()) {
        const file = await documentFile(attachment, documents, index);
        const documentType: DocumentType =
          result.documentType === "invoice" || result.documentType === "credit_note" ? result.documentType : "receipt";
        // A credit note is stored negative so it nets against spend.
        const sign = documentType === "credit_note" ? -1 : 1;
        const total = result.totalAmount ?? 0;
        const vatRead = vatForReading(result);
        const vat = vatRead.vatAmount ?? 0;
        let amount: number;
        let vatAmount: number;
        let originalAmount: number | null = null;
        let originalVatAmount: number | null = null;
        let originalCurrency: string | null = null;
        let fxRate: number | null = null;

        if (result.currency && result.currency !== "GBP") {
          try {
            const rate = await getFxRate(result.currency, "GBP");
            const converted = convertToGbp(total, vat, rate);
            amount = converted.netGbp;
            vatAmount = converted.vatGbp;
            originalAmount = total;
            originalVatAmount = vat;
            originalCurrency = result.currency;
            fxRate = rate;
          } catch {
            // No rate (the lookup timed out, or the ECB set has none for
            // this currency -- AED is offered and isn't covered). Keep the
            // figures rather than drop the document, but record what
            // currency they are actually in: without that the review queue
            // shows a bare number in a box labelled "Total (£)", and a
            // EUR 1,450 invoice is approved as £1,450 with the VAT on it
            // reclaimed. With it, the reviewer is told the conversion is
            // missing and can put the right figure in.
            amount = Math.max(0, total - vat);
            vatAmount = vat;
            originalAmount = total;
            originalVatAmount = vat;
            originalCurrency = result.currency;
            fxRate = null;
          }
        } else {
          amount = Math.max(0, total - vat);
          vatAmount = vat;
        }

        // Day-first is certain on a UK document; only another currency's might
        // mean month-first (as on the scan page).
        const askOrder = !!result.currency && result.currency !== "GBP";
        const cues: string[] = [];
        if (askOrder && result.dateAmbiguous) cues.push(dateCue("Date", result.dateAsPrinted, result.date, result.dateAlternative));
        if (askOrder && result.dueDateAmbiguous) {
          cues.push(dateCue("Due date", result.dueDateAsPrinted, result.dueDate, result.dueDateAlternative));
        }
        if (originalCurrency && fxRate === null) {
          cues.push(`This document is in ${originalCurrency}, and no exchange rate could be fetched. The figures below are the ${originalCurrency} ones, NOT pounds — convert them before approving.`);
        }
        if (vatRead.workedOutFromRate !== null) cues.push(workedOutNote(vatRead.workedOutFromRate));
        const notes = [file.note, result.notes, ...cues].filter(Boolean).join("\n");

        const { data, error } = await admin
          .from("receipts")
          .insert({
            user_id: userId,
            client_id: null,
            date: result.date || todayISO(),
            vendor: result.vendor || body.subject || null,
            category: result.category,
            amount: sign * amount,
            vat_amount: sign * vatAmount,
            original_amount: originalAmount,
            original_vat_amount: originalVatAmount,
            original_currency: originalCurrency,
            fx_rate: fxRate,
            image_data_url: await storeImageForUser(admin, userId, attachment.mimeType, file.base64),
            notes,
            starred: false,
            needs_review: true,
            warranty_months: null,
            tags: ["via-email"],
            line_items: (result.lineItems ?? []).map(({ description, quantity, unitPrice }) => ({
              description,
              quantity,
              unitPrice,
              category: null,
            })),
            document_type: documentType,
            invoice_number: result.invoiceNumber,
            due_date: result.dueDate,
            paid: documentType !== "invoice" || result.paidOnDocument === true,
            details: documentDetailsFromScan(result.details),
          })
          .select("id")
          .single();
        if (error) {
          // One row refused must not abandon the attachments behind it.
          await fileUnread(attachment, `it could not be saved: ${error.message.slice(0, 100)}`);
          continue;
        }
        created.push(data.id);
      }
    }

    return NextResponse.json({ created: created.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
