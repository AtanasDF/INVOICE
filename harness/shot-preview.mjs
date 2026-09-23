import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1100, height: 1500, deviceScaleFactor: 1.5 });
await p.goto(new URL("./test-documents/documents.html", import.meta.url).href, { waitUntil: "networkidle0" });
const out = process.argv[2];
for (const id of process.argv.slice(3)) {
  const h = await p.evaluateHandle((wid) => [...document.querySelectorAll(".cut")].find((c) => c.textContent.includes(wid)), id);
  const el = h.asElement();
  if (el) await el.screenshot({ path: `${out}/${id}.png` }); else console.log("missing", id);
}
await b.close();
console.log("done");
