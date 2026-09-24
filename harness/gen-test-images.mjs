// Turn the 106 printed test documents into images the reader can be scored
// against, so the pile can be tried digitally before anybody prints 74
// pages of it. The answer key already exists (test-documents/expected.json,
// written by gen-test-documents.mjs); this shoots each document on its own
// and writes a manifest in the shape bench-engines.mjs reads.
//
//   node gen-test-images.mjs                 -> test-documents/images/
//   BENCH_DIR=.../images node bench-engines.mjs
//
// Each document sits in a .cut box carrying its own "FAKE TEST DOCUMENT ·
// D-001" stamp, which is what ties a picture to its answer.
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const HERE = new URL(".", import.meta.url).pathname;
const SRC = `${HERE}test-documents/`;
const OUT = `${SRC}images/`;
const expected = JSON.parse(fs.readFileSync(`${SRC}expected.json`, "utf8"));
const byId = new Map(expected.map((d) => [d.id, d]));

// The key prints dates the way the document does (day first) and money as
// three separate figures. The bench wants an ISO date and the fields its
// own manifest uses.
const iso = (printed) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(printed ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (printed ?? null);
};

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(OUT + f);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const page = await browser.newPage();
// Two-times scale: a receipt photographed on a phone is far higher
// resolution than a CSS pixel, and reading a 1x screenshot would measure
// the screenshot rather than the reader.
await page.setViewport({ width: 900, height: 1400, deviceScaleFactor: 2 });
await page.goto(`file://${SRC}documents.html`, { waitUntil: "networkidle0" });

const boxes = await page.$$(".cut");
const manifest = [];
let shot = 0;
for (const box of boxes) {
  const id = await box.evaluate((el) => (el.querySelector(".stamp")?.textContent ?? "").split("·").pop().trim());
  const want = byId.get(id);
  if (!want) { console.log(`skip: no answer for ${JSON.stringify(id)}`); continue; }
  const file = `${id}.jpg`;
  await box.screenshot({ path: OUT + file, type: "jpeg", quality: 88 });
  manifest.push({
    file,
    id,
    design: want.design,
    hard: want.hard,
    documentType: want.type,
    vendor: want.vendor,
    date: iso(want.date),
    invoiceNumber: want.invoiceNumber ?? null,
    totalAmount: want.gross,
    vatAmount: want.vat,
  });
  shot += 1;
}
fs.writeFileSync(`${OUT}manifest.json`, JSON.stringify(manifest, null, 1));
await browser.close();
console.log(JSON.stringify({ shot, expected: expected.length, out: OUT }));
