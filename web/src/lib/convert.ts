// The sentences below are written for the person reading them, so the page may
// show them as they are. Everything else a conversion throws is pdf-lib's or
// the browser's -- "Invalid PDF structure", a bare DOMException -- and saying
// that to somebody who just dropped a file in tells them nothing about what to
// do with it. Same rule as the reader routes' RELAYED_ERRORS.
export const NO_CANVAS = "This browser can't change pictures.";
export const NO_PICTURE = "That picture couldn't be made.";
export const NO_PAGES = "This browser can't draw the pages.";
export const UNREADABLE = "That file couldn't be read.";
export const PDF_LOCKED = "That PDF is locked with a password. Open it, save a copy without the password, and use that.";
export const PDF_DAMAGED = "That PDF is damaged, so not all of it could be read.";
export const NO_WORDS = "That PDF has no words to take out: its pages are pictures, like a scan. Turn it into a picture instead.";
export const NO_PDF_LETTERS = "That file has letters or symbols a PDF can't be made with here. Plain text or Web page will keep them.";
export const NOT_DATA = "That data file has a mistake in it, so it couldn't be read.";
export const WRITTEN_FOR_PEOPLE: ReadonlySet<string> = new Set([NO_CANVAS, NO_PICTURE, NO_PAGES, UNREADABLE, PDF_LOCKED, PDF_DAMAGED, NO_WORDS, NO_PDF_LETTERS, NOT_DATA]);

// Turning one kind of file into another (Atanas, 2026-09-22: "every file
// needs to be able to be turned into every other file so the app works as a
// file transformer too"). Everything happens on the device: nothing is
// uploaded, nothing is read by anyone, and nothing costs anything.

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocPage } from "@/lib/documentPdf";
import { CSV_BOM, csvCell } from "@/lib/csv";

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

// Kept short: /api/send-document cuts a name at 90 letters before it checks
// for ".pdf", so a long one, or one with "and 3 more" added, couldn't be emailed.
const baseName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 60).trim() || "file";

export async function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(UNREADABLE));
    reader.readAsDataURL(blob);
  });
}

/** What the bytes say a picture is, whatever its name or type claims. */
export function pictureFormat(b: Uint8Array): "png" | "jpeg" | "other" {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return "other";
}

/** The turn a JPEG's EXIF asks for: 1 is upright, and so is saying nothing. */
export function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 10)) === "Exif\0\0") {
      const t = i + 10;
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      for (let k = 0, n = u16(ifd); k < n && ifd + 14 + k * 12 <= b.length; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 1;
}

// iOS Safari draws nothing on a canvas over 16.7 million pixels (4096 x 4096),
// and the iPhone's own 24 and 48 megapixel photos are over it.
const MAX_AREA = 16_777_216;
const MAX_SIDE = 16_384;

/** The size to draw a picture at so every browser will: its own, or smaller to the same shape. */
export function fitCanvas(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, Math.sqrt(MAX_AREA / (w * h)), MAX_SIDE / w, MAX_SIDE / h);
  return { width: Math.max(1, Math.floor(w * k)), height: Math.max(1, Math.floor(h * k)) };
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  // Safari keeps a canvas's memory until it is collected, and a PDF of many
  // pages runs out of it part way through.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error(NO_PICTURE);
  return blob;
}

async function imageAs(file: Blob, type: "image/png" | "image/jpeg" | "image/webp"): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(UNREADABLE);
  });
  const { width, height } = fitCanvas(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(NO_CANVAS);
  // A picture with see-through parts goes onto white, or a JPEG turns it black.
  if (type !== "image/png") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvasBlob(canvas, type);
}

async function pdfjs() {
  // The legacy build: the modern one calls Map.prototype.getOrInsertComputed
  // while drawing a page, which only the newest browsers have, so a PDF
  // turned into pictures failed in a Chromium a few months old.
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // The worker is a file of its own, copied into public/vendor at build time.
  lib.GlobalWorkerOptions.workerSrc = `/vendor/pdf.worker-legacy-${lib.version}.mjs`;
  return lib;
}

async function openPdf(file: Blob): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  try {
    return await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "PasswordException") throw new Error(PDF_LOCKED);
    if (name === "InvalidPDFException") throw new Error(PDF_DAMAGED);
    throw err;
  }
}

async function pdfPagesAsImages(doc: PDFDocumentProxy, type: "image/png" | "image/jpeg"): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    // Twice the page's own size, so the words stay sharp, unless that is more
    // than the browser will draw.
    const own = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: fitCanvas(own.width * 2, own.height * 2).width / own.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(NO_PAGES);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    // A page that couldn't be made used to be skipped, so page 8 came out
    // named page 7 and nothing said one was missing.
    out.push(await canvasBlob(canvas, type));
    page.cleanup();
  }
  return out;
}

/** One page's words, a line where the PDF ends one. */
export function pageText(items: readonly object[]): string {
  let line = "";
  const lines: string[] = [];
  for (const item of items) {
    if (!("str" in item)) continue;
    line += String(item.str);
    if ("hasEOL" in item && item.hasEOL) {
      lines.push(line.trimEnd());
      line = "";
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n").trim();
}

/** Every page's words. A page with none says so, rather than vanishing, and a PDF with none at all is not an empty file. */
export function pdfWords(pages: string[]): string {
  if (!pages.some(Boolean)) throw new Error(NO_WORDS);
  return pages.map((p, i) => p || `[Page ${i + 1} is a picture, so it has no words to take out.]`).join("\n\n") + "\n";
}

async function pdfAsText(doc: PDFDocumentProxy): Promise<string> {
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    pages.push(pageText((await page.getTextContent()).items));
    page.cleanup();
  }
  return pdfWords(pages);
}

/** A file as pages for one PDF. */
async function pdfPagesOf(file: File): Promise<DocPage[]> {
  if (kindOf(file) === "pdf") {
    const doc = await openPdf(file);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const own = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption: true }).catch(() => null);
      // pdf-lib can't decrypt. A PDF with only a permissions password (a bank
      // statement, say) opens anywhere, but its pages copied across came out
      // as garbage. pdf.js reads it, so its pages go in as pictures.
      if (own?.isEncrypted) {
        const pictures = await pdfPagesAsImages(doc, "image/jpeg");
        return Promise.all(pictures.map(async (b) => ({ dataUrl: await readDataUrl(b), mediaType: "image/jpeg" })));
      }
      // pdf-lib reads what it can of a damaged file and carries on: a PDF cut
      // short gave one page of its five, and no error.
      if (!own || own.getPageCount() !== doc.numPages) throw new Error(PDF_DAMAGED);
      return [{ dataUrl: await readDataUrl(file), mediaType: "application/pdf" }];
    } finally {
      await doc.loadingTask.destroy();
    }
  }
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const format = pictureFormat(head);
  if (format === "png" || (format === "jpeg" && jpegOrientation(head) === 1)) return [{ dataUrl: await readDataUrl(file), mediaType: `image/${format}` }];
  // pdf-lib takes PNG and JPEG only, by their bytes rather than their name,
  // and lays a JPEG down as stored, ignoring the turn the camera wrote beside
  // it -- so a WEBP, GIF or HEIC failed every time and a phone photo came out
  // on its side. The browser draws all of them the right way up.
  return [{ dataUrl: await readDataUrl(await imageAs(file, "image/jpeg")), mediaType: "image/jpeg" }];
}

/** A row of a comma or tab separated file, quotes and all. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // Decided by the first line: a tab-separated file with "1,200.00" anywhere
  // in it used to be read as commas, splitting the money and keeping the tabs.
  const first = text.slice(0, 65536).split("\n").find((l) => l.trim()) ?? "";
  const sep = first.split("\t").length > first.split(",").length ? "\t" : ",";
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
    // Only a quote that opens a cell starts a quoted one: the inch mark in
    // `Pipe 3" copper` swallowed every row after it into one cell.
    if (c === '"' && cell === "") quoted = true;
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

const toCsv = (rows: string[][]) => CSV_BOM + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** A file's data, if it is JSON: named so, or looking so and reading as it. */
export function jsonIn(name: string, raw: string): unknown {
  if (!/\.json$/i.test(name) && !/^\s*[[{]/.test(raw)) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const cellOf = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Data as rows: a list of records is a table under their names; anything else, a row each. Nothing is left out. */
export function jsonRows(data: unknown): string[][] {
  const list: unknown[] = Array.isArray(data) ? data : [data];
  if (list.length && list.every(isRecord)) {
    const keys = [...new Set(list.flatMap((r) => Object.keys(r)))];
    if (keys.length) return [keys, ...list.map((r) => keys.map((k) => cellOf(r[k])))];
  }
  return list.map((r) => (Array.isArray(r) ? r.map(cellOf) : [cellOf(r)]));
}

/** Rows as records under the first row's names. A name used twice, or a row longer than the first, keeps every cell. */
export function rowsToRecords(rows: string[][]): unknown {
  const [head, ...rest] = rows;
  if (!head || !rest.length) return rows;
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const used = new Set<string>();
  const names = Array.from({ length: width }, (_, i) => {
    const base = head[i]?.trim() || `column ${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
    used.add(name);
    return name;
  });
  return rest.map((r) => Object.fromEntries(names.map((h, i) => [h, r[i] ?? ""])));
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // textContent reads a script's code as words, and runs <p>Total</p><p>£40</p>
  // together as "Total£40".
  doc.body.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());
  doc.body.querySelectorAll("br, p, div, li, tr, h1, h2, h3, h4, h5, h6, table, section, article, header, footer, blockquote, pre").forEach((el) => el.after("\n"));
  doc.body.querySelectorAll("td, th").forEach((el) => el.after("\t"));
  return (doc.body.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
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

/** Lines of words that fit `room`, a word wider than a line cut where it runs out. */
export function wrapText(text: string, widthOf: (s: string) => number, room: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of raw.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next) <= room) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // Measured from the front. Measuring the whole word and taking a letter
      // off at a time froze the page for 94 seconds on one 8,000-letter word,
      // which is a JSON file with no spaces in it.
      let rest = word;
      for (;;) {
        let cut = 1;
        while (cut < rest.length && widthOf(rest.slice(0, cut + 1)) <= room) cut++;
        if (cut >= rest.length) break;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
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
  const words = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, " ");
  // The built-in font writes Western European letters and no others, and
  // pdf-lib stops at the first it can't -- which was a carriage return, so
  // every file saved on Windows failed, as did a Cyrillic name or a tick.
  const writable = new Set(font.getCharacterSet());
  for (const ch of words) if (ch !== "\n" && !writable.has(ch.codePointAt(0)!)) throw new Error(NO_PDF_LETTERS);
  const lines = wrapText(words, (s) => font.widthOfTextAtSize(s, size), width - margin * 2);
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
    const pages: DocPage[] = [];
    for (const f of files) pages.push(...(await pdfPagesOf(f)));
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
      const doc = await openPdf(file);
      try {
        if (target === "txt") {
          made.push({ name: `${stem}.txt`, blob: new Blob([await pdfAsText(doc)], { type: "text/plain;charset=utf-8" }) });
          continue;
        }
        const pages = await pdfPagesAsImages(doc, target === "png" ? "image/png" : "image/jpeg");
        pages.forEach((blob, i) => made.push({ name: pages.length > 1 ? `${stem} page ${i + 1}.${target}` : `${stem}.${target}`, blob }));
      } finally {
        await doc.loadingTask.destroy();
      }
      continue;
    }
    // Words, rows or data.
    const raw = await file.text();
    const isHtml = /\.(html?)$/i.test(file.name) || /^\s*<(!doctype|html)/i.test(raw);
    const data = isHtml ? undefined : jsonIn(file.name, raw);
    const isJson = data !== undefined;
    if (!isJson && /\.json$/i.test(file.name) && (target === "csv" || target === "json")) throw new Error(NOT_DATA);
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
      // Only a spreadsheet becomes a table: a letter with a comma in every line
      // used to come out cut into cells.
      const rows = !isHtml && !isJson && (/\.(csv|tsv)$/i.test(file.name) || /csv|tab-separated/.test(file.type)) ? parseCsv(raw) : null;
      made.push({ name: `${stem}.html`, blob: new Blob([isHtml ? raw : rows && rows.length > 1 ? rowsToHtml(rows, stem) : textToHtml(words, stem)], { type: "text/html;charset=utf-8" }) });
      continue;
    }
    if (target === "csv") {
      made.push({ name: `${stem}.csv`, blob: new Blob([toCsv(isJson ? jsonRows(data) : parseCsv(words))], { type: "text/csv;charset=utf-8" }) });
      continue;
    }
    made.push({ name: `${stem}.json`, blob: new Blob([JSON.stringify(isJson ? data : rowsToRecords(parseCsv(words)), null, 2) + "\n"], { type: "application/json" }) });
  }
  return made;
}
