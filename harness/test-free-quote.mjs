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
  // launchSignedIn only opens the browser; signIn is what puts the session
  // in place, and this suite did that half way down. That was fine while
  // /free-invoice was public -- it stopped being so on 2026-09-22 ("nothing
  // should work before the user register"), so everything above that point
  // had been running against /login, and the button it could not find was
  // never the point.
  await signIn(page, BASE);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  // Clear the draft and the tips, NOT the whole of localStorage: the session
  // lives there too.
  await page.evaluate(() => {
    for (const k of ["free-invoice-draft", "free-invoice-signature"]) localStorage.removeItem(k);
    for (const t of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + t, "3");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText(page, "Start a quote");
  // Wait for the editor rather than guessing at it: a fixed 500ms was enough
  // when this was written and is not now, and what it read instead was an
  // empty page, failing every check for a reason that is not the app's.
  await page.waitForFunction(() => document.body.innerText.includes("Customer name"), { timeout: 15000 });
  // The quote number and the valid-until date moved behind "Add more
  // details" after this was written. They are still there; they are just
  // no longer the first thing anybody is asked for.
  await clickText(page, "Add more details");
  await page.waitForFunction(() => document.body.innerText.includes("Quote number"), { timeout: 15000 });
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
  // It used to check the signed-out wording ("This quote stays as it is").
  // Nobody signed out can reach this page any more, so what matters is that
  // the panel a signed-in person sees names a quote, not an invoice.
  const sendPanel = (await bodyText(page)).replace(/\s+/g, " ");
  const draftMessage = await page.evaluate(() => document.querySelector("#send-by-email textarea")?.placeholder ?? "");
  check("send panel talks about a quote, not an invoice",
    /Send quote/.test(sendPanel) && !/Send invoice/.test(sendPanel) &&
    // The quote/invoice difference in this panel: a quote carries no bank
    // details, so the line about them must not appear.
    /goes as a PDF\./.test(sendPanel) && !/payment details in the email/.test(sendPanel) &&
    /Please find attached quote/.test(draftMessage),
    JSON.stringify({ draftMessage, tail: sendPanel.slice(-400) }));

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
  // The import used to offer "Add <name> as a client" and create the contact
  // on the spot. Quotes are written through CustomerPicker now: a name that
  // is nobody yet opens the new-customer panel prefilled, and the contact is
  // created when the quote is saved. Same outcome, one screen fewer.
  await page.waitForFunction(() => document.body.innerText.includes("New customer"), { timeout: 20000 });
  const field = (label) => page.evaluate((l) => [...document.querySelectorAll("input")].find((i) => (i.previousElementSibling?.textContent ?? "") === l)?.value ?? null, label);
  // "Company name" rather than a person's name is the Ltd being read off the
  // end of it, which is what the old check meant by "company, from the Ltd".
  check("the customer comes across, on the company form because of the Ltd",
    (await field("Company name")) === "Acme Kitchens Ltd", JSON.stringify({ company: await field("Company name") }));
  check("form prefilled with the quote's number", (await field("Quote number")) === "Q-007", await field("Quote number"));
  check("and with its line, priced", (await page.evaluate(() =>
    [...document.querySelectorAll("input")].some((i) => i.value === "Fit kitchen") &&
    [...document.querySelectorAll("input")].some((i) => i.value === "2400"))));
  // Saving with the new-customer panel still open must not quietly do
  // nothing -- the half-typed contact would be lost and the button would
  // look broken.
  await clickText(page, "Save quote");
  await sleep(1200);
  const refused = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()));
  check("saving before the new customer is added says so, and saves nothing",
    refused.some((m) => /Finish adding the new customer/.test(m)) && db.tables.quotes.length === 0,
    JSON.stringify({ refused, quotes: db.tables.quotes.length }));

  await clickText(page, "Add customer");
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="alert"]')].some((e) => /Finish adding the new customer/.test(e.textContent)), { timeout: 10000 });
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const client = db.tables.clients[0];
  check("adding the customer creates it as a company", client?.name === "Acme Kitchens Ltd" && client.is_company === true, JSON.stringify(client));
  const q = db.tables.quotes[0];
  check("quote saved with its line and customer", q?.number === "Q-007" && q.items.length === 1 && q.items[0].unitPrice === 2400 && q.client_id === client.id, JSON.stringify(q));
  check("Free page draft cleared after saving", (await page.evaluate(() => localStorage.getItem("free-invoice-draft"))) === null);
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
