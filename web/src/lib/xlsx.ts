import { unzipSync, strFromU8 } from "fflate";

// The first sheet of an Excel file as rows of text, so a customer list kept
// in Excel can be brought in as it is, without "Save as CSV" first. Only
// .xlsx: it is a zip of XML. The old .xls and Apple's .numbers are other
// formats altogether and still get told to export a CSV.
//
// Read with patterns rather than an XML parser, so the same code runs in the
// browser and in the harness. Only what a list of names needs is understood:
// shared, inline and formula strings, numbers and true/false.

export const NOT_EXCEL = "That Excel file couldn't be opened. Save it as CSV and choose that instead.";

const unescapeXml = (s: string) =>
  s
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// All the <t> runs inside one string, joined: rich text splits a name into
// several when part of it is bold.
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

const columnIndex = (ref: string) => {
  const letters = ref.replace(/\d+$/, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

function firstSheetPath(files: Record<string, Uint8Array>): string | null {
  const book = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const id = book.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const target = id ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${id}"`))?.match(/Target="([^"]+)"/)?.[1] : undefined;
  if (target) {
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    if (files[path]) return path;
  }
  return Object.keys(files).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0] ?? null;
}

export function readXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") && f.name.endsWith(".xml") || f.name.endsWith(".rels") });
  } catch {
    throw new Error(NOT_EXCEL);
  }
  const sheet = firstSheetPath(files);
  if (!sheet) throw new Error(NOT_EXCEL);
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];
  const xml = strFromU8(files[sheet]);
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const at = Number(row[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1) - 1;
    const cells: string[] = [];
    let next = 0;
    for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+\d+)"/i)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = c[1].match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const inner = c[2] ?? "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const value =
        type === "s" ? (shared[Number(v)] ?? "") :
        type === "inlineStr" ? textOf(inner) :
        type === "b" ? (v === "1" ? "TRUE" : "FALSE") :
        v !== undefined ? unescapeXml(v) : "";
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < at) rows.push([]);
    rows[at] = cells;
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
