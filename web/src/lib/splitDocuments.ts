import type { CapturedFile } from "@/components/DocumentCapture";
import { type DocumentBox, padded } from "@/lib/documentBox";
import type { ScanResult } from "@/lib/scanExtraction";

export type DocumentPart = { pages: CapturedFile[]; result: ScanResult };

const isPdf = (f: CapturedFile) => f.mediaType === "application/pdf";

// Pages per file as the reader numbers them (every page of a PDF); null for
// a PDF that can't be opened here.
export async function countPages(files: CapturedFile[]): Promise<(number | null)[]> {
  const pdf = files.some(isPdf) ? await import("@/lib/pdfPages") : null;
  return Promise.all(files.map((f) => (isPdf(f) ? pdf!.pdfPageCount(f.dataUrl).catch(() => null) : 1)));
}

function pageList(pages: number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    runs.push(j > i ? `${pages[i]}–${pages[j]}` : String(pages[i]));
    i = j;
  }
  return `page${pages.length > 1 ? "s" : ""} ${runs.join(", ")}`;
}

function noted(result: ScanResult, note: string): ScanResult {
  return { ...result, notes: [result.notes, note].filter(Boolean).join("\n") };
}

function cropImage(file: CapturedFile, box: DocumentBox): Promise<CapturedFile | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [top, left, bottom, right] = padded(box);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((right - left) * w));
      canvas.height = Math.max(1, Math.round((bottom - top) * h));
      canvas.getContext("2d")!.drawImage(img, left * w, top * h, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.9), mediaType: "image/jpeg" });
    };
    img.onerror = () => resolve(null);
    img.src = file.dataUrl;
  });
}

// A capture or file the reader found several documents in, as one set of
// pages per document: a photo shared with other documents is cropped to
// this one's box with the whole photo kept after it (so a box that's off
// loses nothing), and a PDF is cut down to the document's own pages. A PDF
// that can't be cut goes whole with each document, whose notes say which
// pages are its own.
export async function splitDocuments(files: CapturedFile[], documents: ScanResult[]): Promise<DocumentPart[]> {
  if (documents.length < 2) return [{ pages: files, result: documents[0] }];
  const counts = await countPages(files);
  const total = counts.reduce<number>((sum, c) => sum + (c ?? 1), 0);
  const pagesOf = documents.map((d) => {
    const own = (d.pages ?? []).filter((p) => p <= total);
    return own.length ? own : Array.from({ length: total }, (_, i) => i + 1);
  });
  const shared = (page: number) => pagesOf.filter((p) => p.includes(page)).length > 1;
  if (counts.includes(null)) {
    return documents.map((d, i) => ({ pages: files, result: noted(d, `On ${pageList(pagesOf[i])} of this file, which couldn't be split.`) }));
  }

  return Promise.all(
    documents.map(async (doc, i) => {
      const pages: CapturedFile[] = [];
      const unsplit: number[] = [];
      let start = 1;
      for (const [f, file] of files.entries()) {
        const first = start;
        const count = counts[f]!;
        start += count;
        const own = pagesOf[i].filter((p) => p >= first && p < first + count);
        if (!own.length) continue;
        if (!isPdf(file)) {
          const crop = doc.box && shared(first) ? await cropImage(file, doc.box) : null;
          pages.push(...(crop ? [crop, file] : [file]));
          continue;
        }
        const cuts = own.map((p) => ({ page: p - first + 1, box: doc.box && shared(p) ? doc.box : null }));
        if (own.length === count && cuts.every((c) => !c.box)) {
          pages.push(file);
          continue;
        }
        try {
          const { pdfWithPages } = await import("@/lib/pdfPages");
          pages.push({ dataUrl: await pdfWithPages(file.dataUrl, cuts), mediaType: "application/pdf" });
        } catch {
          pages.push(file);
          unsplit.push(...cuts.map((c) => c.page));
        }
      }
      const result = unsplit.length ? noted(doc, `On ${pageList(unsplit)} of the PDF, which couldn't be split.`) : doc;
      return { pages: pages.length ? pages : files, result };
    })
  );
}
