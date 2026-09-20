import fs from "fs";
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const DL = new URL("./downloads/", import.meta.url).pathname;
fs.mkdirSync(DL, { recursive: true });
for (const f of fs.readdirSync(DL)) fs.unlinkSync(DL + f);
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
db.tables.business_profile.push({ business_name: "Harness Ltd", vat_registered: false });
db.tables.clients = [];
const { browser, page } = await launchSignedIn(db, { base: BASE });
const setByLabel = (label, value, tag = "input") => page.evaluate((l, v, t) => {
  const f = [...document.querySelectorAll("label")].find((x) => x.querySelector("span")?.textContent.trim() === l)?.querySelector(t)
    ?? document.getElementById([...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l)?.id ?? "__")?.parentElement?.querySelector(t)
    ?? [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l)?.parentElement?.querySelector(t);
  const proto = t === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(f, v);
  f.dispatchEvent(new Event("input", { bubbles: true }));
}, label, value, tag);
try {
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.clear(); for (const t of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + t, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Start a quote");
  await sleep(500);
  let t = await bodyText(page);
  check("editor in quote mode: no payment terms, CIS or bank details", t.includes("Quote number") && t.includes("Valid until") && !t.includes("Payment terms") && !t.includes("CIS subcontractor") && !t.includes("Payment details") && t.includes("Free quote"), t.slice(0, 400));
  await setByLabel("Business name", "Harness Ltd");
  await setByLabel("Customer name", "Acme Kitchens Ltd");
  await page.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => x.placeholder === "Q-001"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Q-007"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => { const i = document.querySelector('input[placeholder="Description of the work"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Fit kitchen"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => x.placeholder === "0.00"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "2400"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await sleep(300);
  await clickText(page, "Preview");
  await sleep(600);
  t = await bodyText(page);
  const flags = { quoteWord: /\bQuote\b/.test(t), quoteNo: t.includes("Quote no."), valid: t.includes("Valid until"), forWord: /\bFor\b/i.test(t), total: t.includes("Total"), noTotalDue: !t.includes("Total due"), noBillTo: !t.includes("Bill to"), noDueDate: !t.includes("Due date") };
  check("preview reads as a quote: Quote, Quote no., Valid until, For, Total", Object.values(flags).every(Boolean), JSON.stringify(flags));
  await clickText(page, "Download PDF");
  let file = null;
  for (let i = 0; i < 40 && !file; i++) { await sleep(250); file = fs.readdirSync(DL).find((f) => f.endsWith(".pdf")); }
  check("PDF is named as a quote", file === "Quote-Q-007.pdf", file);
  check("send panel talks about a quote", (await bodyText(page)).includes("This quote stays as it is"));

  await clickText(page, "Edit");
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Invoice").click());
  await sleep(300);
  t = await bodyText(page);
  check("switching back to invoice brings terms and bank details back", t.includes("Payment terms") && t.includes("Payment details") && t.includes("Invoice number"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Quote").click());
  await sleep(300);

  // Save to your account: the quote carries over.
  // Signed in without clearing storage, so the Free page draft survives.
  const draftBefore = await page.evaluate(() => localStorage.getItem("free-invoice-draft"));
  await signIn(page, BASE);
  await page.evaluate((d) => localStorage.setItem("free-invoice-draft", d), draftBefore);
  const saved = await page.evaluate(() => localStorage.getItem("free-invoice-draft"));
  check("draft kept as a quote", JSON.parse(saved).docType === "quote");
  await page.goto(`${BASE}/quotes/new?import=1`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("isn't one of your clients yet"), { timeout: 20000 });
  await clickText(page, "Add Acme Kitchens Ltd as a client");
  await page.waitForFunction(() => !document.body.innerText.includes("isn't one of your clients yet"), { timeout: 10000 });
  const client = db.tables.clients[0];
  check("customer added as a client (company, from the Ltd)", client?.name === "Acme Kitchens Ltd" && client.is_company === true, JSON.stringify(client));
  const num = await page.evaluate(() => [...document.querySelectorAll("input")].find((i) => i.previousElementSibling?.textContent === "Quote number")?.value);
  check("form prefilled with the quote's number", num === "Q-007", num);
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const q = db.tables.quotes[0];
  check("quote saved with its line and client", q?.number === "Q-007" && q.items.length === 1 && q.items[0].unitPrice === 2400 && q.client_id === client.id, JSON.stringify(q));
  check("Free page draft cleared after saving", (await page.evaluate(() => localStorage.getItem("free-invoice-draft"))) === null);
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
