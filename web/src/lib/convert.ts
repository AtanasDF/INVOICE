// The sentences below are written for the person reading them, so the page may
// show them as they are. Everything else a conversion throws is pdf-lib's or
// the browser's -- "Invalid PDF structure", a bare DOMException -- and saying
// that to somebody who just dropped a file in tells them nothing about what to
// do with it. Same rule as the reader routes' RELAYED_ERRORS.
export const NO_CANVAS = "This browser can't change pictures.";
export const NO_PICTURE = "That picture couldn't be made.";
export const NO_PAGES = "This browser can't draw the pages.";
export const UNREADABLE = "That file couldn't be read.";
export const WRITTEN_FOR_PEOPLE: ReadonlySet<string> = new Set([NO_CANVAS, NO_PICTURE, NO_PAGES, UNREADABLE]);

// Turning one kind of file into another (Atanas, 2026-09-22: "every file
// needs to be able to be turned into every other file so the app works as a
// file transformer too"). Everything happens on the device: nothing is
// uploaded, nothing is read by anyone, and nothing costs anything.

export type Kind = "image" | "pdf" | "text" | "other";
export type Target = "pdf" | "png" | "jpg" | "webp" | "txt" | "csv" | "json" | "html";

export const TARGETS: { target: Target; label: string; ending: string; note: string }[] = [
  { target: "pdf", label: "PDF", ending: ".pdf", note: "One file, good for sending and printing" },
  { target: "png", label: "Picture", ending: ".png", note: "Sharp, bigger file" },
  { target: "jpg", label: "Smaller picture", ending: ".jpg", note: "Smaller, good for a message" },
  { target: "webp", label: "Web picture", ending: ".webp", note: "Smallest of the three" },
  { target: "txt", label: "Plain text", ending: ".txt", note: "The words on their own" },
  { target: "csv", label: "Spreadsheet", ending: ".csv", note: "Rows and columns for Excel or Numbers" },
  { target: "json", label: "Data", ending: ".json", note: "For another program to read" },
  { target: "html", label: "Web page", ending: ".html", note: "Opens in any browser" },
];

export function kindOf(file: { name: string; type?: string }): Kind {
  const type = file.type ?? "";
  const name = file.name.toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/.test(name)) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("text/") || type === "application/json" || /\.(txt|csv|tsv|json|html?|md|log|xml|yml|yaml)$/.test(name)) return "text";
  return "other";
}

const CAN: Record<Kind, Target[]> = {
  image: ["pdf", "png", "jpg", "webp"],
  pdf: ["pdf", "png", "jpg", "txt"],
  text: ["pdf", "txt", "csv", "json", "html"],
  other: [],
};

/** What every one of the chosen files can be turned into. */
export function targetsFor(kinds: Kind[]): Target[] {
  if (!kinds.length) return [];
  return TARGETS.map((t) => t.target).filter((t) => kinds.every((k) => CAN[k].includes(t)));
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "file";

export async function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(UNREADABLE));
    reader.readAsDataURL(blob);
  });
}

async function imageAs(file: Blob, type: "image/png" | "image/jpeg" | "image/webp"): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(NO_CANVAS);
  // A picture with see-through parts goes onto white, or a JPEG turns it black.
  if (type !== "image/png") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error(NO_PICTURE);
  return blob;
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  // The worker is a file of its own, copied into public/vendor at build time.
  lib.GlobalWorkerOptions.workerSrc = `/vendor/pdf.worker-${lib.version}.mjs`;
  return lib;
}

async function pdfPagesAsImages(file: Blob, type: "image/png" | "image/jpeg"): Promise<Blob[]> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: Blob[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    // Twice the page's own size, so the words stay sharp.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(NO_PAGES);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
    if (blob) out.push(blob);
  }
  await doc.cleanup();
  return out;
}

async function pdfAsText(file: Blob): Promise<string> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line.trimEnd());
        line = "";
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    pages.push(lines.join("\n").trim());
  }
  await doc.cleanup();
  return pages.filter(Boolean).join("\n\n").trim() + "\n";
}

/** A row of a comma or tab separated file, quotes and all. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const sep = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function textToHtml(text: string, title: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;margin:40px;max-width:760px;color:#171717;line-height:1.5}pre{white-space:pre-wrap;font:inherit}table{border-collapse:collapse}td,th{border:1px solid #e5e5e5;padding:4px 8px;text-align:left}</style></head>
<body><pre>${esc(text)}</pre></body></html>
`;
}

function rowsToHtml(rows: string[][], title: string): string {
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;margin:40px;color:#171717}table{border-collapse:collapse}td{border:1px solid #e5e5e5;padding:4px 8px;font-size:14px}</style></head>
<body><table><tbody>${body}</tbody></table></body></html>
`;
}

/** Words laid onto A4 pages, wrapped where the line runs out. */
async function textToPdf(text: string, title: string): Promise<Blob> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const margin = 50;
  const width = 595.28;
  const height = 841.89;
  const room = width - margin * 2;
  const lines: string[] = [];
  for (const raw of text.replace(/\t/g, "    ").split("\n")) {
    if (!raw.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of raw.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= room) line = next;
      else {
        if (line) lines.push(line);
        // A word longer than the page is cut where it runs out.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > room) {
          let cut = rest.length;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > room) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    lines.push(line);
  }
  const step = size * 1.45;
  const perPage = Math.floor((height - margin * 2) / step);
  for (let i = 0; i < Math.max(1, Math.ceil(lines.length / perPage)); i++) {
    const page = doc.addPage([width, height]);
    lines.slice(i * perPage, (i + 1) * perPage).forEach((line, n) => {
      if (line) page.drawText(line, { x: margin, y: height - margin - step * (n + 1), size, font });
    });
  }
  return new Blob([await doc.save() as BlobPart], { type: "application/pdf" });
}

export type Made = { name: string; blob: Blob };

/**
 * Every chosen file as the kind asked for. Pictures and PDFs asked for as
 * one PDF come back as one file; everything else comes back one for one,
 * and a PDF's pages come back as a picture each.
 */
export async function convertFiles(files: File[], target: Target): Promise<Made[]> {
  if (!files.length) return [];
  const kinds = files.map((f) => kindOf(f));
  const name = baseName(files[0].name);

  if (target === "pdf" && kinds.every((k) => k === "image" || k === "pdf")) {
    const { pagesToPdf } = await import("@/lib/documentPdf");
    const pages = await Promise.all(
      files.map(async (f) => ({ dataUrl: await readDataUrl(f), mediaType: f.type || (kindOf(f) === "pdf" ? "application/pdf" : "image/jpeg") }))
    );
    const bytes = await pagesToPdf(pages, name);
    return [{ name: `${files.length > 1 ? `${name} and ${files.length - 1} more` : name}.pdf`, blob: new Blob([bytes as BlobPart], { type: "application/pdf" }) }];
  }

  const made: Made[] = [];
  for (const file of files) {
    const kind = kindOf(file);
    const stem = baseName(file.name);
    if (kind === "image") {
      const type = target === "png" ? "image/png" : target === "webp" ? "image/webp" : "image/jpeg";
      made.push({ name: `${stem}.${target}`, blob: await imageAs(file, type) });
      continue;
    }
    if (kind === "pdf") {
      if (target === "txt") {
        made.push({ name: `${stem}.txt`, blob: new Blob([await pdfAsText(file)], { type: "text/plain;charset=utf-8" }) });
        continue;
      }
      const type = target === "png" ? "image/png" : "image/jpeg";
      const pages = await pdfPagesAsImages(file, type);
      pages.forEach((blob, i) => made.push({ name: pages.length > 1 ? `${stem} page ${i + 1}.${target}` : `${stem}.${target}`, blob }));
      continue;
    }
    // Words, rows or data.
    const raw = await file.text();
    const isHtml = /\.(html?)$/i.test(file.name) || /^\s*<(!doctype|html)/i.test(raw);
    const isJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(raw);
    const words = isHtml ? htmlToText(raw) : raw;
    if (target === "txt") {
      made.push({ name: `${stem}.txt`, blob: new Blob([words], { type: "text/plain;charset=utf-8" }) });
      continue;
    }
    if (target === "pdf") {
      made.push({ name: `${stem}.pdf`, blob: await textToPdf(words, stem) });
      continue;
    }
    if (target === "html") {
      const rows = !isHtml && !isJson ? parseCsv(raw) : null;
      made.push({ name: `${stem}.html`, blob: new Blob([isHtml ? raw : rows && rows.length > 1 ? rowsToHtml(rows, stem) : textToHtml(words, stem)], { type: "text/html;charset=utf-8" }) });
      continue;
    }
    if (target === "csv") {
      let rows: string[][];
      if (isJson) {
        const data = JSON.parse(raw);
        const list: Record<string, unknown>[] = Array.isArray(data) ? data : [data];
        const keys = [...new Set(list.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])))];
        rows = keys.length ? [keys, ...list.map((r) => keys.map((k) => String((r as Record<string, unknown>)?.[k] ?? "")))] : list.map((r) => [String(r)]);
      } else {
        rows = parseCsv(words);
      }
      made.push({ name: `${stem}.csv`, blob: new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }) });
      continue;
    }
    // json
    let data: unknown;
    if (isJson) data = JSON.parse(raw);
    else {
      const rows = parseCsv(words);
      const [head, ...rest] = rows;
      data = head && rest.length ? rest.map((r) => Object.fromEntries(head.map((h, i) => [h || `column ${i + 1}`, r[i] ?? ""]))) : rows;
    }
    made.push({ name: `${stem}.json`, blob: new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }) });
  }
  return made;
}
