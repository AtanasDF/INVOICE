import type { ScanEngine } from "@/lib/extractors";
import type { ScanDetailKey, ScanDetails, ScanResult } from "@/lib/scanExtraction";
import type { DocumentDetails } from "@/lib/storage";
import { supabase } from "@/lib/supabaseClient";
import { countPages } from "@/lib/splitDocuments";
import { SIGNED_OUT } from "@/lib/errorText";

// Vercel rejects request bodies over 4.5MB, so a multi-page scan is sent
// to /api/scan in batches and the per-batch results merged here. Batches
// only split between pages: a single page over this limit (a big PDF)
// can't be sent at all and is refused up front in extractPages.
export const MAX_BATCH_CHARS = 3_500_000;

export function batchPages<T extends { dataUrl: string }>(pages: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const page of pages) {
    if (current.length && size + page.dataUrl.length > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(page);
    size += page.dataUrl.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

// Every document the reader found, in page order. Page numbers count every
// page of a PDF from the first page sent.
export async function extractPages(
  pages: { dataUrl: string; mediaType: string }[],
  categories: string[],
  engine: ScanEngine = "claude"
): Promise<ScanResult[]> {
  if (!pages.length) throw new Error("There's nothing to read.");
  if (pages.some((p) => p.dataUrl.length > MAX_BATCH_CHARS)) {
    throw new Error(
      "This PDF is too large to scan (about 3MB max). Export it at a lower resolution or photograph the pages instead."
    );
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(SIGNED_OUT);
  const batches = batchPages(pages);
  const found: ScanResult[][] = [];
  for (const batch of batches) {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ images: batch.map((p) => p.dataUrl), categories, engine }),
    });
    const json = (await res.json().catch(() => ({}))) as { result?: ScanResult; documents?: ScanResult[]; error?: string; limit?: { reason: string; topUpAvailable?: boolean } };
    if (!res.ok || !json.result) {
      const err = new Error(json.error || `Scanning failed (${res.status}).`);
      // A refusal is not a failure: it carries what to offer next, and the
      // page shows a button rather than just the sentence.
      if (json.limit) (err as Error & { limit?: unknown }).limit = json.limit;
      throw err;
    }
    found.push(json.documents?.length ? json.documents : [json.result]);
  }
  if (found.every((docs) => docs.length === 1)) return [mergeScanResults(found.map((docs) => docs[0]))];

  // Each batch numbers its pages from 1.
  const out: ScanResult[] = [];
  let offset = 0;
  for (const [i, docs] of found.entries()) {
    const count = (await countPages(batches[i])).reduce<number>((sum, c) => sum + (c ?? 1), 0);
    const all = Array.from({ length: count }, (_, p) => offset + p + 1);
    out.push(...docs.map((d) => ({ ...d, pages: d.pages?.length ? d.pages.map((p) => p + offset) : all })));
    offset += count;
  }
  return out;
}

type Conf = "high" | "low";

// Header fields come from the first batch that read them (they're on
// page 1), line items are concatenated in page order, and the totals come
// from the LAST batch that read them (the grand total is on the last
// page). A "low" from any batch that actually read a value wins. A paid
// mark on any page (a stamp on the last one, say) counts.
export function mergeScanResults(results: ScanResult[]): ScanResult {
  if (results.length === 1) return results[0];

  const first = <K extends keyof ScanResult>(key: K): ScanResult[K] =>
    (results.find((r) => r[key] !== null)?.[key] ?? results[0][key]) as ScanResult[K];
  const firstWith = (key: keyof ScanResult): ScanResult =>
    results.find((r) => r[key] !== null) ?? results[0];
  const lastWith = (key: keyof ScanResult): ScanResult | undefined =>
    [...results].reverse().find((r) => r[key] !== null);
  const conf = (valueKey: keyof ScanResult, confKey: keyof ScanResult): Conf =>
    results.some((r) => r[valueKey] !== null && r[confKey] === "low") ? "low" : "high";

  const vendorSrc = firstWith("vendor");
  const dateSrc = firstWith("date");
  const dueSrc = firstWith("dueDate");
  const totalSrc = lastWith("totalAmount");
  const vatSrc = lastWith("vatAmount");

  const details = Object.fromEntries(
    (Object.keys(results[0].details).filter((k) => k !== "other") as ScanDetailKey[]).map((k) => [
      k,
      results.find((r) => r.details[k] !== null)?.details[k] ?? null,
    ])
  ) as Record<ScanDetailKey, string | null>;
  const seen = new Set<string>();
  const other = results
    .flatMap((r) => r.details.other)
    .filter((o) => {
      const key = `${o.label}\u0000${o.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const notes = [...new Set(results.map((r) => r.notes).filter((n): n is string => !!n))];

  return {
    documentType: results.find((r) => r.documentType !== "other")?.documentType ?? results[0].documentType,
    vendor: vendorSrc.vendor,
    vendorConfidence: vendorSrc.vendor === null ? "low" : conf("vendor", "vendorConfidence"),
    date: dateSrc.date,
    dateAsPrinted: dateSrc.dateAsPrinted,
    dateConfidence: dateSrc.date === null ? "low" : conf("date", "dateConfidence"),
    dateAmbiguous: dateSrc.dateAmbiguous,
    dateAlternative: dateSrc.dateAlternative,
    invoiceNumber: first("invoiceNumber"),
    dueDate: dueSrc.dueDate,
    dueDateAsPrinted: dueSrc.dueDateAsPrinted,
    dueDateAmbiguous: dueSrc.dueDateAmbiguous,
    dueDateAlternative: dueSrc.dueDateAlternative,
    creditedInvoiceNumber: first("creditedInvoiceNumber"),
    totalAmount: totalSrc?.totalAmount ?? null,
    totalAmountConfidence: totalSrc ? conf("totalAmount", "totalAmountConfidence") : "low",
    currency: first("currency"),
    vatAmount: vatSrc?.vatAmount ?? null,
    vatAmountConfidence: vatSrc ? conf("vatAmount", "vatAmountConfidence") : "low",
    vatRate: results.find((r) => r.vatRate != null)?.vatRate ?? null,
    category: first("category"),
    lineItems: results.flatMap((r) => r.lineItems),
    details: { ...details, other },
    contactPerson: first("contactPerson"),
    contactEmail: first("contactEmail"),
    notes: notes.length ? notes.join("\n") : null,
    pages: [],
    box: null,
    paidOnDocument: results.some((r) => r.paidOnDocument) ? true : results.some((r) => r.paidOnDocument === false) ? false : null,
  };
}

// The tool returns every detail key, null when absent; the stored shape
// only keeps what was actually found.
// Both engines pass their output through conformToSchema, so `details`
// arrives in the schema's shape and the fallbacks below should never be
// needed. They cost a character each and the alternative, if that ever
// stops being true, is Object.entries(undefined) throwing on the scan
// screen -- a dead page while he's standing in the yard with the receipt.
export function documentDetailsFromScan(details: ScanDetails | null | undefined): DocumentDetails {
  const out: DocumentDetails = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (key === "other" || typeof value !== "string" || !value.trim()) continue;
    out[key as ScanDetailKey] = value.trim();
  }
  const other = (details?.other ?? []).filter((o) => o.label.trim() && o.value.trim());
  if (other.length) out.other = other;
  return out;
}
