// A white invoice on a pale surface -- light oak, an off-white worktop --
// is found and taken by itself. Every other camera clip is a white page on a
// dark table (gen-pale.py says why that was not enough).
import fs from "fs";
import { launch, openScanner, sleep } from "./camera3.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const HERE = new URL(".", import.meta.url).pathname;

for (const [clip, what] of [["pale-wood.mjpeg", "an invoice on light oak"], ["white-worktop.mjpeg", "an invoice on a white worktop"]]) {
  if (!fs.existsSync(HERE + clip)) { check(`${what}: clip is present`, false, `${clip} missing -- run gen-pale.py`); continue; }
  const { browser, page, posted } = await launch(clip);
  try {
    await openScanner(page, { auto: "on" });
    const t0 = Date.now();
    while (Date.now() - t0 < 9000 && !posted.length) await sleep(200);
    check(`${what} is taken by itself`, posted.length > 0, posted.length ? "" : "no capture in 9s");
  } catch (e) { check(`${what} is taken by itself`, false, e.message); } finally { await browser.close(); }
}
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
