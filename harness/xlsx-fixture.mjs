// A real .xlsx, made here rather than kept as a binary in the repo: a zip of
// the XML Excel writes, deflated as Excel deflates it. The sheet is stored
// under a name other than sheet1.xml, and a second sheet is there to be
// ignored, because Excel only promises the workbook's own pointers.
import { zipSync, strToU8 } from "../web/node_modules/fflate/esm/index.mjs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const col = (i) => String.fromCharCode(65 + i);

export function makeXlsx(rows, { inline = false } = {}) {
  const shared = [];
  const sheet = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    if (v === null) return "";
    const ref = `${col(ci)}${ri + 1}`;
    if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
    if (inline) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
    shared.push(v);
    // Every other string as rich text, in two runs, as Excel saves a cell with part of it bold.
    return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
  }).join("")}</row>`).join("");
  const si = shared.map((s, i) => i % 2 && s.length > 2
    ? `<si><r><rPr><b/></rPr><t>${esc(s.slice(0, 2))}</t></r><r><t xml:space="preserve">${esc(s.slice(2))}</t></r></si>`
    : `<si><t>${esc(s)}</t></si>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Customers" sheetId="1" r:id="rId7"/><sheet name="Other" sheetId="2" r:id="rId8"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0"?><Relationships><Relationship Id="rId8" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Target="worksheets/sheet2.xml"/></Relationships>'),
    "xl/worksheets/sheet2.xml": strToU8(`<?xml version="1.0"?><worksheet><sheetData>${sheet}</sheetData></worksheet>`),
    "xl/worksheets/sheet1.xml": strToU8('<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Wrong sheet</t></is></c></row></sheetData></worksheet>'),
    ...(inline ? {} : { "xl/sharedStrings.xml": strToU8(`<?xml version="1.0"?><sst>${si}</sst>`) }),
  }, { level: 6 });
}
