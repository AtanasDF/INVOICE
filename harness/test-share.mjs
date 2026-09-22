import { launch, sleep, url, clickText, shot } from "./camera2.mjs";
import fs from "fs";
const DL = new URL("./downloads/", import.meta.url).pathname;
fs.mkdirSync(DL, { recursive: true });
for (const f of fs.readdirSync(DL)) fs.unlinkSync(DL + f);
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, d ?? ""); };
const setInput = (page, selector, value) =>
  page.evaluate((sel, v) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : null;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);
const { browser, page } = await launch("large.mjpeg");
try {
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  await page.goto(url("/free-invoice"), { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); for (const id of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + id, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Type it in");
  await sleep(500);
  await page.evaluate(() => {
    const setVal = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    const byLabel = (t) => [...document.querySelectorAll("p,label,span")].find((x) => x.textContent.trim() === t)?.closest("div")?.querySelector("input");
    setVal(byLabel("Business name"), "Share Test Ltd");
  });
  await sleep(100);
  await setInput(page, 'input[placeholder="INV-001"]', "INV-042");
  await sleep(100);
  await setInput(page, 'input[placeholder="Description of the work"]', "Kitchen plastering");
  await sleep(100);
  await page.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => x.placeholder === "0.00"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "450"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(200);
  await clickText(page, "Preview");
  await sleep(500);

  await clickText(page, "Download PDF");
  let file = null;
  for (let i = 0; i < 40 && !file; i++) { await sleep(250); file = fs.readdirSync(DL).find((f) => f.endsWith(".pdf")); }
  const head = file ? fs.readFileSync(DL + file).subarray(0, 5).toString() : "";
  check("Download PDF saves a PDF named after the invoice", file === "Invoice-INV-042.pdf" && head === "%PDF-", `${file} ${head} ${file ? fs.statSync(DL + file).size : 0} bytes`);

  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, text: d.text }; }; });
  await clickText(page, "Share (WhatsApp, Messages…)");
  await sleep(1500);
  const shared = await page.evaluate(() => window.__shared);
  check("Share hands over the PDF with a summary", !!shared && shared.name === "Invoice-INV-042.pdf" && shared.type === "application/pdf" && shared.size > 10000 && /INV-042.*Share Test Ltd.*£450\.00/.test(shared.text), JSON.stringify(shared));

  await page.evaluate(() => { let first = true; window.__shared2 = 0; navigator.share = async () => { if (first) { first = false; const e = new Error("no activation"); e.name = "NotAllowedError"; throw e; } window.__shared2++; }; });
  await clickText(page, "Edit");
  await sleep(200);
  await setInput(page, 'input[placeholder="INV-001"]', "INV-043");
  await clickText(page, "Preview");
  await sleep(300);
  await clickText(page, "Share (WhatsApp, Messages…)");
  await sleep(1500);
  const ready = await page.evaluate(() => document.body.innerText.includes("Ready — tap to share"));
  if (ready) await clickText(page, "Ready — tap to share");
  await sleep(500);
  check("expired tap: shows Ready, second tap shares at once", ready && (await page.evaluate(() => window.__shared2)) === 1, `ready=${ready}`);
  await shot(page, "share-panel");
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "share-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
