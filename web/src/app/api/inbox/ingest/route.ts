import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_TYPES, MAX_FILE_BYTES, extractDocument } from "@/lib/scanExtraction";
import { documentDetailsFromScan } from "@/lib/scanClient";
import { getFxRate } from "@/lib/fx";
import type { DocumentType } from "@/lib/storage";
import { storeImageForUser } from "@/lib/receiptImagesServer";

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
  return `${label} read as ${printed} as ${iso ?? "unreadable"}${alt} — please confirm`;
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

    const usableAttachments = (body.attachments ?? [])
      .filter((a) => ALLOWED_TYPES.includes(a.mimeType as (typeof ALLOWED_TYPES)[number]))
      .filter((a) => (a.base64.length * 3) / 4 <= MAX_FILE_BYTES)
      .slice(0, MAX_ATTACHMENTS);

    const created: string[] = [];

    if (usableAttachments.length === 0) {
      // Nothing extractable -- still surface the email itself rather than
      // silently dropping it, so it's at least visible that something
      // came in and needs a manual look.
      const { data, error } = await admin
        .from("receipts")
        .insert({
          user_id: userId,
          client_id: null,
          date: new Date().toISOString().slice(0, 10),
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
      const result = await extractDocument([{ mediaType: attachment.mimeType, base64: attachment.base64 }], []);

      const documentType: DocumentType =
        result.documentType === "invoice" || result.documentType === "credit_note" ? result.documentType : "receipt";
      // A credit note is stored negative so it nets against spend.
      const sign = documentType === "credit_note" ? -1 : 1;
      const total = result.totalAmount ?? 0;
      const vat = result.vatAmount ?? 0;
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
          // Couldn't get a rate -- store the raw figures as GBP rather
          // than dropping the receipt; the amount will be visibly wrong
          // in the currency it's actually in, but that's exactly what
          // the review queue is for.
          amount = Math.max(0, total - vat);
          vatAmount = vat;
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
      const notes = [result.notes, ...cues].filter(Boolean).join("\n");

      const { data, error } = await admin
        .from("receipts")
        .insert({
          user_id: userId,
          client_id: null,
          date: result.date || new Date().toISOString().slice(0, 10),
          vendor: result.vendor || body.subject || null,
          category: result.category,
          amount: sign * amount,
          vat_amount: sign * vatAmount,
          original_amount: originalAmount,
          original_vat_amount: originalVatAmount,
          original_currency: originalCurrency,
          fx_rate: fxRate,
          image_data_url: await storeImageForUser(admin, userId, attachment.mimeType, attachment.base64),
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
          paid: documentType !== "invoice",
          details: documentDetailsFromScan(result.details),
        })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      created.push(data.id);
    }

    return NextResponse.json({ created: created.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error." }, { status: 500 });
  }
}
