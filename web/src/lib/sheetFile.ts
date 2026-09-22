// An invoice, quote or statement as a file in other shapes than a PDF
// (Atanas, 2026-09-22: "I want to be able to save files in different
// formats - the more options the better even in the free version").
//
// Read from the printed sheet itself, the way the PDF is a photograph of
// it, so every format says exactly what the customer would see and no
// screen needs its own copy of the totals.

export type SheetTable = { head: string[]; rows: string[][] };
export type SheetBlock = { kind: "text"; lines: string[] } | { kind: "table"; table: SheetTable };
export type SheetDoc = { title: string; blocks: SheetBlock[] };

const text = (el: Element | null | undefined) => (el as HTMLElement | null)?.innerText?.replace(/\s+\n/g, "\n").trim() ?? "";
const cells = (row: Element, sel: string) => [...row.querySelectorAll(sel)].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());

function readTable(table: HTMLTableElement): SheetTable {
  const head = [...table.querySelectorAll("thead tr")].flatMap((r) => cells(r, "th"));
  const rows = [...table.querySelectorAll("tbody tr")].map((r) => cells(r, "td")).filter((r) => r.some(Boolean));
  return { head, rows };
}

/** The sheet's words and its item table, in the order they are printed. */
export function readSheet(sheet: HTMLElement): SheetDoc {
  const title = text(sheet.querySelector("h1")) || "Document";
  const blocks: SheetBlock[] = [];
  for (const child of [...sheet.children] as HTMLElement[]) {
    if (child.className.includes("print:hidden")) continue;
    const clone = child.cloneNode(true) as HTMLElement;
    for (const hidden of [...clone.querySelectorAll('[class*="print:hidden"], [class*="sr-only"]')]) hidden.remove();
    const tables = [...clone.querySelectorAll("table")] as HTMLTableElement[];
    for (const t of tables) t.remove();
    // innerText needs the node in the page to know what is on a line.
    clone.style.position = "fixed";
    clone.style.left = "-10000px";
    clone.style.width = `${child.offsetWidth || 794}px`;
    document.body.appendChild(clone);
    const lines = text(clone)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    clone.remove();
    if (lines.length) blocks.push({ kind: "text", lines });
    for (const t of [...child.querySelectorAll("table")] as HTMLTableElement[]) blocks.push({ kind: "table", table: readTable(t) });
  }
  return { title, blocks };
}

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

/** Plain text, the columns lined up so it reads in any editor or email. */
export function sheetText(doc: SheetDoc): string {
  const out: string[] = [doc.title, "=".repeat(doc.title.length), ""];
  for (const block of doc.blocks) {
    if (block.kind === "text") {
      out.push(...block.lines, "");
      continue;
    }
    const { head, rows } = block.table;
    const all = head.length ? [head, ...rows] : rows;
    const widths = all.reduce<number[]>((w, row) => row.map((c, i) => Math.max(w[i] ?? 0, c.length)), []);
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

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

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
      const at = line.lastIndexOf(": ");
      rows.push(at > 0 ? [line.slice(0, at), line.slice(at + 2)] : [line]);
    }
    rows.push([]);
  }
  return rows.map((r) => r.map(cell).join(",")).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
