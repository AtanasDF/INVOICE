import type { Client, Receipt, ReceiptPage } from "@/lib/storage";
import { inlineImage } from "@/lib/receiptImages";
import { pagesToPdf } from "@/lib/documentPdf";
import { makeZip, type ZipEntry } from "@/lib/zip";
import { tidyFileName } from "@/lib/saveFile";

// Taking a period of paperwork off the app and onto a device (Atanas,
// 2026-09-24: everything saved as files, "downloadable by period, as a zip,
// as pictures, as one PDF, or one PDF per supplier"). It matters more than
// it sounds: the photo-ageing job exists to let old pictures go, and nobody
// should be asked to allow that without a way to keep their own copy first.
//
// Every byte is read and written on the device. Nothing is uploaded.

export type ExportShape = "zip" | "pictures" | "pdf" | "pdf-per-supplier";

export type ExportFile = { name: string; blob: Blob };

const extOf = (dataUrl: string) => {
  const type = dataUrl.slice(5, dataUrl.indexOf(";"));
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
};

const bytesOf = (dataUrl: string) => {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const typeOf = (dataUrl: string) => dataUrl.slice(5, dataUrl.indexOf(";"));

// What a document is called on disk: the date first, so a folder of them
// sorts into the order they happened, then who it was from.
function baseName(r: Receipt, supplier: string): string {
  const who = tidyFileName(supplier || r.vendor || "Unknown", "Document");
  return `${r.date} ${who}`;
}

export type Gathered = { receipt: Receipt; supplier: string; pages: { dataUrl: string; mediaType: string }[] };

// Every page of every document, with its stored photograph fetched and
// inlined. inlineImage throws rather than skip one: an export missing a
// receipt without saying so is worse than one that failed.
export async function gather(
  receipts: Receipt[],
  clients: Client[],
  pagesOf: (id: string) => Promise<ReceiptPage[]>,
  onProgress?: (done: number, total: number) => void
): Promise<Gathered[]> {
  const nameById = new Map(clients.map((c) => [c.id, c.name]));
  const out: Gathered[] = [];
  for (const [i, r] of receipts.entries()) {
    const extra = await pagesOf(r.id);
    const sources = [r.imageDataUrl, ...extra.map((p) => p.imageDataUrl)].filter((s): s is string => !!s);
    const pages = [];
    for (const src of sources) {
      const inlined = await inlineImage(src);
      if (inlined) pages.push({ dataUrl: inlined, mediaType: typeOf(inlined) });
    }
    if (pages.length) out.push({ receipt: r, supplier: nameById.get(r.clientId ?? "") ?? "", pages });
    onProgress?.(i + 1, receipts.length);
  }
  return out;
}

export async function buildExport(items: Gathered[], shape: ExportShape, label: string): Promise<ExportFile> {
  if (!items.length) throw new Error("There are no photographs in this period to save.");

  if (shape === "zip" || shape === "pictures") {
    const entries: ZipEntry[] = [];
    for (const item of items) {
      const pages = shape === "pictures" ? item.pages.filter((p) => p.mediaType !== "application/pdf") : item.pages;
      pages.forEach((page, n) => {
        const suffix = item.pages.length > 1 ? ` p${n + 1}` : "";
        entries.push({ name: `${baseName(item.receipt, item.supplier)}${suffix}.${extOf(page.dataUrl)}`, bytes: bytesOf(page.dataUrl) });
      });
    }
    if (!entries.length) throw new Error("Every document in this period is a PDF, so there are no pictures to save. Save them as a zip or as one PDF instead.");
    return { name: `${label}.zip`, blob: makeZip(entries) };
  }

  if (shape === "pdf") {
    const pages = items.flatMap((i) => i.pages);
    const pdf = await pagesToPdf(pages, label);
    return { name: `${label}.pdf`, blob: new Blob([pdf as BlobPart], { type: "application/pdf" }) };
  }

  // One PDF per supplier, in a zip. A document with no supplier linked goes
  // under the name printed on it rather than into a bin marked "other":
  // "Unknown supplier" in a folder of forty PDFs helps nobody.
  const bySupplier = new Map<string, Gathered[]>();
  for (const item of items) {
    const who = item.supplier || item.receipt.vendor || "Unknown";
    bySupplier.set(who, [...(bySupplier.get(who) ?? []), item]);
  }
  const entries: ZipEntry[] = [];
  for (const [who, theirs] of [...bySupplier].sort((a, b) => a[0].localeCompare(b[0]))) {
    const pdf = await pagesToPdf(theirs.flatMap((i) => i.pages), `${who} — ${label}`);
    entries.push({ name: `${tidyFileName(who, "Unknown")}.pdf`, bytes: pdf as Uint8Array<ArrayBuffer> });
  }
  return { name: `${label} by supplier.zip`, blob: makeZip(entries) };
}

// What the period is called in the filename. A whole year or a whole month
// is said as such rather than as two dates, because that is what somebody
// asked for and what they will look for later.
export function periodLabel(from: string, to: string, supplier: string): string {
  const who = supplier ? `${tidyFileName(supplier, "Supplier")} ` : "";
  if (!from && !to) return `${who}documents`.trim();
  if (from && to) {
    const [fy, fm, fd] = from.split("-");
    const [ty, tm, td] = to.split("-");
    if (fy === ty && fm === "01" && fd === "01" && tm === "12" && td === "31") return `${who}${fy}`.trim();
    if (fy === ty && fm === tm && fd === "01") return `${who}${fy}-${fm}`.trim();
    return `${who}${from} to ${to}`.trim();
  }
  return `${who}${from ? `from ${from}` : `up to ${to}`}`.trim();
}
