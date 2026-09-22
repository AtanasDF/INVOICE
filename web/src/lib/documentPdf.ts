import { PDFDocument } from "pdf-lib";
import { SITE_NAME } from "@/lib/siteName";

// "Copy a document" (Atanas, 2026-09-22: "another scanner button which is
// going to scan files, no matter what files ... then they will be able to
// export them or send them to someone"): photos and PDFs, in order, into one
// PDF. Each photo gets an A4 page turned to match it, the photo fitted with a
// margin; a PDF's own pages are copied in as they are.
export type DocPage = { dataUrl: string; mediaType: string };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 18;

const bytesOf = (dataUrl: string) => {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function pagesToPdf(pages: DocPage[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer(SITE_NAME);
  for (const p of pages) {
    const bytes = bytesOf(p.dataUrl);
    if (p.mediaType === "application/pdf") {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      copied.forEach((pg) => doc.addPage(pg));
      continue;
    }
    const img = p.mediaType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const landscape = img.width > img.height;
    const [w, h] = landscape ? [A4[1], A4[0]] : A4;
    const page = doc.addPage([w, h]);
    const k = Math.min((w - 2 * MARGIN) / img.width, (h - 2 * MARGIN) / img.height);
    const dw = img.width * k;
    const dh = img.height * k;
    page.drawImage(img, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
  }
  return doc.save();
}

/** How many pages a finished file will have: a PDF counts its own pages. */
export async function pageCount(pages: DocPage[]): Promise<number> {
  let n = 0;
  for (const p of pages) {
    if (p.mediaType !== "application/pdf") n++;
    else n += (await PDFDocument.load(bytesOf(p.dataUrl), { ignoreEncryption: true })).getPageCount();
  }
  return n;
}

/** A file name from what was typed: letters, digits, spaces and dashes, ending .pdf. */
export function pdfName(typed: string, fallback: string): string {
  const base = (typed.trim() || fallback).replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N} _-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${base || "Document"}.pdf`;
}
