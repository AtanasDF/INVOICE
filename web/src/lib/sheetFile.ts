// An invoice, quote or statement as a file in other shapes than a PDF
// (Atanas, 2026-09-22: "I want to be able to save files in different
// formats - the more options the better even in the free version").
//
// Read from the printed sheet itself, the way the PDF is a photograph of
// it, so every format says exactly what the customer would see and no
// screen needs its own copy of the totals.

import { CSV_BOM, sheetCell } from "@/lib/csv";

export type SheetTable = { head: string[]; rows: string[][] };
export type SheetBlock = { kind: "text"; lines: string[] } | { kind: "table"; table: SheetTable };
export type SheetDoc = { title: string; blocks: SheetBlock[] };

const text = (el: Element | null | undefined) => (el as HTMLElement | null)?.innerText?.replace(/\s+\n/g, "\n").trim() ?? "";

// textContent, so a heading styled upper-case is read as written, with a space
// where a block sits inside the cell: "INV-001" over "3 days late" used to
// come out as "INV-0013 days late".
const BLOCK_TAGS = /^(ADDRESS|BLOCKQUOTE|DD|DIV|DL|DT|H[1-6]|LI|OL|P|SECTION|UL)$/;

// A cell read outside the page has no computed style, so its tags decide.
function startsLine(n: Element): boolean {
  if (!n.isConnected) return BLOCK_TAGS.test(n.tagName);
  const display = getComputedStyle(n).display;
  return !display.startsWith("inline") && display !== "contents";
}

function cellText(cell: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) return void parts.push(n.textContent ?? "");
    if (!(n instanceof Element)) return;
    if (n.tagName === "BR") return void parts.push(" ");
    const block = n !== cell && startsLine(n);
    if (block) parts.push(" ");
    n.childNodes.forEach(walk);
    if (block) parts.push(" ");
  };
  walk(cell);
  return parts.join("").replace(/\s+/g, " ").trim();
}
const cells = (row: Element, sel: string) => [...row.querySelectorAll(sel)].map(cellText);

function readTable(table: HTMLTableElement): SheetTable {
  const head = [...table.querySelectorAll("thead tr")].flatMap((r) => cells(r, "th"));
  // A labour/materials heading is a th spanning the row, and reading only
  // td left the lines with nothing to say which group they were in.
  const rows = [...table.querySelectorAll("tbody tr")].map((r) => cells(r, "td, th[scope=rowgroup]")).filter((r) => r.some(Boolean));
  return { head, rows };
}

// A figure on its own line belongs to the label above it: the statement
// prints "Total owing" and "£380.00" side by side as two spans, which reads
// as two lines and left the spreadsheet with nothing to pair.
const FIGURE = /^[−-]?(?:[A-Z]{3}\s)?[£€$]?[−-]?\d[\d,]*(?:\.\d+)?$/;
function pairFigures(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev !== undefined && FIGURE.test(line) && !FIGURE.test(prev) && !prev.includes(": ")) out[out.length - 1] = `${prev}: ${line}`;
    else out.push(line);
  }
  return out;
}

/** The sheet's words and its item table, in the order they are printed. */
export function readSheet(sheet: HTMLElement): SheetDoc {
  const title = (sheet.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim() || "Document";
  // A sheet wrapped in one element (the statement, the Free page's article)
  // was read as one block, every word before every table.
  // Only a wrapper that holds a table is looked inside, and a screen-only
  // button beside it does not count as a second block.
  const printed = (el: Element) => [...el.children].filter((c) => !c.classList.contains("print:hidden"));
  let root: Element = sheet;
  for (let only = printed(root); only.length === 1 && !(only[0] instanceof HTMLTableElement) && only[0].querySelector("table"); only = printed(root)) root = only[0];
  const blocks: SheetBlock[] = [];
  let titleDropped = false;
  for (const child of [...root.children] as HTMLElement[]) {
    if (child.classList.contains("print:hidden")) continue;
    const clone = child.cloneNode(true) as HTMLElement;
    for (const hidden of [...clone.querySelectorAll('[class*="print:hidden"], [class*="sr-only"]')]) hidden.remove();
    // innerText needs the node in the page to know what is on a line.
    clone.style.position = "fixed";
    clone.style.left = "-10000px";
    clone.style.width = `${child.offsetWidth || 794}px`;
    document.body.appendChild(clone);
    // Read from the clone, so what is hidden inside a table stays hidden.
    const tables: SheetBlock[] = [];
    // Read one level down, a table can be the child itself, which
    // querySelectorAll never returns.
    const found = clone instanceof HTMLTableElement ? [clone] : ([...clone.querySelectorAll("table")] as HTMLTableElement[]);
    for (const t of found) {
      tables.push({ kind: "table", table: readTable(t) });
      // The Free page prints every total in the footer, a label and a figure
      // a row: read as "Total due: £480.00", the way IssuedInvoice prints them.
      const foot = [...t.querySelectorAll("tfoot tr")].map((r) => cells(r, "td, th").filter(Boolean)).filter((r) => r.length);
      if (foot.length) tables.push({ kind: "text", lines: foot.map((r) => (r.length > 1 ? `${r.slice(0, -1).join(" ")}: ${r[r.length - 1]}` : r[0])) });
      t.remove();
    }
    let lines = pairFigures(
      (clone instanceof HTMLTableElement ? "" : text(clone))
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    );
    clone.remove();
    // The title is printed once, above everything, by every format.
    if (!titleDropped && lines.length && lines[0].toLowerCase() === title.toLowerCase()) {
      lines = lines.slice(1);
      titleDropped = true;
    }
    if (lines.length) blocks.push({ kind: "text", lines });
    blocks.push(...tables);
  }
  return { title, blocks };
}

// Columns line up by what an editor shows, not by UTF-16 units: a CJK
// character takes two columns, an accent none, an emoji two.
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (/\p{Mn}|\p{Me}|\u200d|\ufe0f/u.test(ch)) continue;
    w += /\p{Extended_Pictographic}/u.test(ch) ||
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x20000 && c <= 0x3fffd)
      ? 2
      : 1;
  }
  return w;
}

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - displayWidth(s)));

/** Plain text, the columns lined up so it reads in any editor or email. */
export function sheetText(doc: SheetDoc): string {
  const out: string[] = [doc.title, "=".repeat(displayWidth(doc.title)), ""];
  for (const block of doc.blocks) {
    if (block.kind === "text") {
      out.push(...block.lines, "");
      continue;
    }
    const { head, rows } = block.table;
    const all = head.length ? [head, ...rows] : rows;
    const widths = all.reduce<number[]>((w, row) => row.map((c, i) => Math.max(w[i] ?? 0, displayWidth(c))), []);
    for (const [i, row] of all.entries()) {
      out.push(row.map((c, j) => (j === row.length - 1 ? c : pad(c, widths[j]))).join("  ").trimEnd());
      if (i === 0 && head.length) out.push(widths.map((w) => "-".repeat(w)).join("  "));
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A page anyone can open, and the same thing Word opens as a document it can edit. */
export function sheetHtml(doc: SheetDoc): string {
  const body: string[] = [`<h1>${esc(doc.title)}</h1>`];
  for (const block of doc.blocks) {
    if (block.kind === "text") {
      body.push(`<p>${block.lines.map(esc).join("<br />")}</p>`);
      continue;
    }
    const { head, rows } = block.table;
    const headRow = head.length ? `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : "";
    const bodyRows = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    body.push(`<table>${headRow}<tbody>${bodyRows}</tbody></table>`);
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>${esc(doc.title)}</title>
<style>
body { font-family: Helvetica, Arial, sans-serif; color: #171717; margin: 40px; max-width: 760px; }
h1 { font-size: 22px; margin: 0 0 16px; }
p { margin: 0 0 14px; line-height: 1.5; }
table { border-collapse: collapse; width: 100%; margin: 0 0 16px; }
th, td { border-bottom: 1px solid #e5e5e5; padding: 6px 8px; text-align: left; font-size: 14px; }
th { color: #525252; font-weight: 600; }
td:not(:first-child), th:not(:first-child) { text-align: right; }
</style></head>
<body>${body.join("\n")}</body></html>
`;
}

/** The lines and the totals as a spreadsheet. */
export function sheetCsv(doc: SheetDoc): string {
  const rows: string[][] = [];
  for (const block of doc.blocks) {
    if (block.kind === "table") {
      if (block.table.head.length) rows.push(block.table.head);
      rows.push(...block.table.rows);
      rows.push([]);
      continue;
    }
    for (const line of block.lines) {
      // Only a line with one label in it is a label and a value: "Registered
      // name: X. Company number: 123." is a sentence and stays one cell.
      const at = line.indexOf(": ");
      rows.push(at > 0 && at === line.lastIndexOf(": ") ? [line.slice(0, at), line.slice(at + 2)] : [line]);
    }
    rows.push([]);
  }
  return CSV_BOM + rows.map((r) => r.map(sheetCell).join(",")).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
