// Change a file, without a browser (notes/audit-convert.md). The converter's
// own rules, compiled from the app's source into gen/, and the text paths run
// end to end through convertFiles: Node has File and pdf-lib, which is all
// they need. Pictures and PDFs need a canvas and pdf.js's worker, so those
// paths are test-convert's.
const C = await import("./gen/lib/convert.js");
const pdfjs = await import("./gen/node_modules/pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e?.message ?? String(e); } };
const file = (name, body, type = "") => new File([body], name, { type });
const one = async (files, target) => (await C.convertFiles(files, target))[0];
const pdfText = async (blob) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), verbosity: 0 }).promise;
  let out = "";
  for (let n = 1; n <= doc.numPages; n++) out += (await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(" ") + "\n";
  return { text: out, pages: doc.numPages };
};

// --- What a picture really is, by its bytes ---
const bytes = (...h) => Uint8Array.from(h);
check("PNG is known by its bytes", C.pictureFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)) === "png");
check("JPEG is known by its bytes", C.pictureFormat(bytes(0xff, 0xd8, 0xff, 0xe0)) === "jpeg");
check("WEBP, GIF and HEIC are neither, whatever the name says", ["RIFF", "GIF8", "\0\0\0\x18ftypheic"].every((s) => C.pictureFormat(Uint8Array.from(s, (c) => c.charCodeAt(0))) === "other"));

// A JPEG header: SOI, an APP0, then an APP1 holding EXIF with one tag.
const jpeg = (orientation, littleEndian) => {
  const u16 = (v) => (littleEndian ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v) => (littleEndian ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const tiff = [...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(2),
    ...u16(0x010f), ...u16(2), ...u32(4), ...u32(0x41424300),
    ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  return Uint8Array.from([0xff, 0xd8, ...app0, 0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif, 0xff, 0xda, 0, 2]);
};
check("an iPhone photo held upright says turn 6 (Intel byte order)", C.jpegOrientation(jpeg(6, true)) === 6, C.jpegOrientation(jpeg(6, true)));
check("...and in Motorola byte order", C.jpegOrientation(jpeg(8, false)) === 8, C.jpegOrientation(jpeg(8, false)));
check("an upright one says 1", C.jpegOrientation(jpeg(1, true)) === 1);
check("a JPEG with no EXIF is upright", C.jpegOrientation(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2)) === 1);
check("a header cut short is read as upright, not thrown over", C.jpegOrientation(jpeg(6, true).subarray(0, 30)) === 1);

// --- The size a canvas can be ---
const fit = (w, h) => C.fitCanvas(w, h);
check("a 12-megapixel photo is drawn at its own size", JSON.stringify(fit(4032, 3024)) === JSON.stringify({ width: 4032, height: 3024 }));
const iphone = fit(5712, 4284);
check("a 24-megapixel iPhone photo fits under iOS Safari's 16.7 million pixels", iphone.width * iphone.height <= 16_777_216, JSON.stringify(iphone));
check("...the same shape", Math.abs(iphone.width / iphone.height - 5712 / 4284) < 0.001, JSON.stringify(iphone));
const strip = fit(40000, 300);
check("a very long strip keeps every side under 16,384", strip.width <= 16384 && strip.height >= 1, JSON.stringify(strip));
check("an A4 PDF page at twice its size is untouched", fit(595.28 * 2, 841.89 * 2).width === Math.floor(595.28 * 2));

// --- A PDF's words ---
check("a page's words keep their lines", C.pageText([{ str: "Invoice" }, { str: " 7", hasEOL: true }, { str: "Total £40" }, { type: "beginMarkedContent" }]) === "Invoice 7\nTotal £40");
check("a PDF with no words at all is refused, not handed back as an empty file", (await fails(() => C.pdfWords(["", ""]))) === C.NO_WORDS);
const partial = C.pdfWords(["Page one words", "", "Page three"]);
check("a page with no words says so instead of vanishing", partial.includes("[Page 2 is a picture") && partial.startsWith("Page one words") && partial.includes("Page three"), JSON.stringify(partial));

// --- Rows ---
const inch = C.parseCsv('Item,Qty\nPipe 3" copper,2\nElbow,4\nTee,1\n');
check("an inch mark in a cell does not swallow the rows after it", inch.length === 4 && inch[1][0] === 'Pipe 3" copper' && inch[3][0] === "Tee", JSON.stringify(inch));
const tsv = C.parseCsv("Date\tItem\tAmount\n01/02\tBoard\t1,200.00\n");
check("a tab-separated file with a comma in the money stays three columns", tsv[1].length === 3 && tsv[1][2] === "1,200.00", JSON.stringify(tsv));
const quoted = C.parseCsv('a,b\r\n"Gyproc, or the same","say ""hi"""\r\n');
check("quoted cells, doubled quotes and Windows line ends still read", quoted[1][0] === "Gyproc, or the same" && quoted[1][1] === 'say "hi"' && quoted[0][1] === "b", JSON.stringify(quoted));

const nested = C.jsonRows([{ name: "Board", price: { net: 8.95, vat: 1.79 } }, { name: "Plaster", tags: ["bag"] }]);
check("a value holding more data is written out, not as [object Object]", nested[1][1] === '{"net":8.95,"vat":1.79}' && nested[2][2] === '["bag"]' && !JSON.stringify(nested).includes("[object Object]"), JSON.stringify(nested));
const mixed = C.jsonRows([{ a: 1 }, 5, "x"]);
check("a list mixing records and plain values loses none of them", JSON.stringify(mixed).includes("5") && JSON.stringify(mixed).includes('"x"'), JSON.stringify(mixed));
check("a list of lists becomes rows of cells", JSON.stringify(C.jsonRows([["a", 1], ["b", null]])) === '[["a","1"],["b",""]]');

const recs = C.rowsToRecords([["Item", "Amount", "Amount"], ["Board", "8", "9", "extra"]]);
check("a name used twice keeps both columns", recs[0].Amount === "8" && recs[0]["Amount 2"] === "9", JSON.stringify(recs));
check("a row longer than the first keeps its last cell", recs[0]["column 4"] === "extra", JSON.stringify(recs));

check("a note starting with [ is not taken for data", C.jsonIn("note.txt", "[Draft] call the supplier") === undefined);
check("...but real JSON is, by its look", JSON.stringify(C.jsonIn("x.txt", ' [{"a":1}]')) === '[{"a":1}]');

// --- Wrapping words onto a page ---
const w5 = (s) => s.length * 5;
const long = "x".repeat(100_000);
let t = Date.now();
const cut = C.wrapText(long, w5, 500);
const took = Date.now() - t;
check("one 100,000-letter word wraps in well under a second", took < 1000, `${took} ms`);
check("...into lines that fit, every letter kept", cut.every((l) => w5(l) <= 500) && cut.join("") === long && cut.length === 1000, `${cut.length} lines`);
check("ordinary words wrap at a space", JSON.stringify(C.wrapText("aaaa bbbb cccc", w5, 50)) === '["aaaa bbbb","cccc"]', JSON.stringify(C.wrapText("aaaa bbbb cccc", w5, 50)));

// --- Whole conversions ---
check("every sentence the converter can throw is one the page will show", [C.PDF_LOCKED, C.PDF_DAMAGED, C.NO_WORDS, C.NO_PDF_LETTERS, C.NOT_DATA].every((s) => C.WRITTEN_FOR_PEOPLE.has(s)));

const windows = file("prices.csv", "Item,Price\r\nPlasterboard,8.95\r\nPlaster,11.50\r\n", "text/csv");
const winErr = await fails(() => one([windows], "pdf"));
check("a file saved on Windows becomes a PDF (a carriage return used to stop pdf-lib)", winErr === null, winErr);
if (pdfjs && winErr === null) {
  const { text } = await pdfText((await one([windows], "pdf")).blob);
  check("...with its words in it", text.includes("Plasterboard,8.95") && text.includes("Plaster,11.50"), text.slice(0, 200));
}
check("letters the PDF font can't write are refused in words, not dropped", (await fails(() => one([file("names.txt", "Иван Петров paid £40")], "pdf"))) === C.NO_PDF_LETTERS);
check("...and the same file still becomes plain text and a web page", (await fails(() => one([file("names.txt", "Иван ✓")], "txt"))) === null && (await fails(() => one([file("names.txt", "Иван ✓")], "html"))) === null);

const minified = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: i, item: "Plasterboard", price: 8.95 })));
t = Date.now();
const minPdf = await one([file("export.json", minified, "application/json")], "pdf");
const minTook = Date.now() - t;
check("a minified JSON file (one 93,000-letter word) becomes a PDF in seconds, not never", minTook < 15000, `${minTook} ms, ${minified.length} letters`);
if (pdfjs) {
  const { text } = await pdfText(minPdf.blob);
  check("...with the end of the file still in it", text.replace(/\s/g, "").includes('"id":1999'), text.slice(-120));
}

const csvBlob = (await one([file("lines.json", JSON.stringify([{ item: "=HYPERLINK(\"http://x\")", price: { net: 8 } }, { item: "Plaster £", price: -5 }]))], "csv")).blob;
// Blob.text() drops a byte-order mark as it reads, so it is looked for in the bytes.
const csvHead = Buffer.from(await csvBlob.arrayBuffer()).subarray(0, 3).toString("hex");
const csvOut = await csvBlob.text();
check("data to a spreadsheet starts with a byte-order mark, so Excel shows £", csvHead === "efbbbf", csvHead);
check("...a cell that would run as a formula in Excel is made text", csvOut.includes(`"'=HYPERLINK(""http://x"")"`), csvOut);
check("...a plain negative number is left a number", /,-5\n/.test(csvOut), csvOut);
check("...and nested data is written out", csvOut.includes('"{""net"":8}"'), csvOut);

check("a note that starts with [ becomes a spreadsheet (it used to fail as broken data)", (await fails(() => one([file("note.txt", "[Draft] call the supplier, Tuesday")], "csv"))) === null);
check("a broken .json file asked for as data says so", (await fails(() => one([file("bad.json", '{"a":1,')], "csv"))) === C.NOT_DATA);
check("...but its words still come out as text", (await fails(() => one([file("bad.json", '{"a":1,')], "txt"))) === null);


const letter = await (await one([file("letter.txt", "Dear Sam, thanks for the work.\nRegards, Atanas\n", "text/plain")], "html")).blob.text();
check("a letter with commas becomes a web page of words, not a table", !letter.includes("<table>") && letter.includes("Dear Sam, thanks for the work."), letter.slice(0, 300));
const sheet = await (await one([file("prices.csv", "Item,Price\nBoard,8.95\n", "text/csv")], "html")).blob.text();
check("...while a spreadsheet still becomes a table", sheet.includes("<table>") && sheet.includes("<td>Board</td>"));

const longName = "Quarterly statement for Hidefield Plastering Ltd, all sites, January to March 2026, final copy.csv";
const named = await C.convertFiles([file(longName, "a,b\n1,2\n", "text/csv"), file("two.csv", "a\n1\n", "text/csv")], "pdf");
check("a long name still ends .pdf within the 90 letters the email route keeps", named.every((m) => m.name.length <= 90 && m.name.endsWith(".pdf")), JSON.stringify(named.map((m) => m.name)));
const odd = await one([file("bad\nname.txt", "words")], "txt");
check("a newline in a file name does not reach the file made", odd.name === "bad name.txt", JSON.stringify(odd.name));

const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
