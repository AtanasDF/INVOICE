import fs from "fs";
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3100";
const DL = new URL("./downloads/", import.meta.url).pathname;
fs.mkdirSync(DL, { recursive: true });
for (const f of fs.readdirSync(DL)) fs.unlinkSync(DL + f);

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const plus = (days) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const db = makeDb();
const C1 = newId(), C2 = newId(), S1 = newId();
const client = (o) => ({ user_id: "x", is_company: false, email: null, address: null, kind: "client", vat_number: null, payment_terms: null, default_currency: null, contact_person: null, phone: null, reminders_enabled: true, archived: false, ...o });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", address: "1 Test Street", vat_number: "GB123", vat_registered: true, bank_details: "Sort code: 00-00-00\nAccount: 12345678", invoice_prefix: "INV-", invoice_next_number: 1 });
db.tables.clients.push(client({ id: C1, name: "Jane Customer", email: "jane@example.com", address: "2 Road", payment_terms: "14 days" }));
db.tables.clients.push(client({ id: C2, name: "Old Client", archived: true }));
db.tables.clients.push(client({ id: S1, name: "Supplier Co", kind: "supplier" }));

const setField = (page, selector, value, index = 0) =>
  page.evaluate((sel, v, i) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) throw new Error("no field " + sel + " #" + i);
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  }, selector, value, index);
const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const { browser, page } = await launchSignedIn(db, { base: BASE });
try {
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  await signIn(page, BASE);

  await page.goto(BASE + "/quotes", { waitUntil: "networkidle0" });
  await waitText(page, "No quotes yet.");
  check("empty list says no quotes", true);
  check("nav has Quotes", await page.evaluate(() => [...document.querySelectorAll("header a")].some((a) => a.textContent === "Quotes")));

  await clickText(page, "New quote");
  await waitText(page, "Quote number");
  const number = await page.evaluate(() => [...document.querySelectorAll("input")].find((i) => i.previousElementSibling?.textContent === "Quote number")?.value);
  check("first number is Q-0001", number === "Q-0001", number);
  const options = await page.evaluate(() => [...document.querySelectorAll("select")[0].options].map((o) => o.textContent));
  check("only live clients offered (no archived, no suppliers)", JSON.stringify(options) === JSON.stringify(["Pick a client…", "Jane Customer"]), JSON.stringify(options));
  const validUntil = await page.evaluate(() => document.querySelectorAll('input[type="date"]')[1].value);
  check("valid until defaults to 30 days", validUntil === plus(30), validUntil);
  check("form fits 375px", await noHScroll(page));
  await shot(page, "quotes-new");

  await clickText(page, "Save quote");
  await waitText(page, "Pick who the quote is for.");
  check("save without client is refused", db.tables.quotes.length === 0);

  await setField(page, "select", C1, 0);
  await setField(page, 'input[placeholder="What the work or item is"]', "Skim coat kitchen", 0);
  await setField(page, 'input[aria-label="Quantity"]', "2", 0);
  await setField(page, 'input[aria-label="Unit price"]', "150.50", 0);
  await clickText(page, "Add line");
  await sleep(100);
  await setField(page, 'input[placeholder="What the work or item is"]', "Materials", 1);
  await setField(page, 'input[aria-label="Unit price"]', "80", 1);
  await setField(page, "textarea", "Start Monday. Skip included.", 0);
  await sleep(200);
  check("form total with VAT", (await bodyText(page)).includes("Total £457.20"), (await bodyText(page)).match(/Total £[\d.,]+/)?.[0]);
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const q1 = db.tables.quotes[0];
  check("quote saved as draft with lines", q1 && q1.number === "Q-0001" && q1.status === "draft" && q1.client_id === C1 && q1.items.length === 2 && q1.valid_until === plus(30) && q1.notes.startsWith("Start Monday"), JSON.stringify(q1));
  await waitText(page, "Total: £457.20");
  let t = await bodyText(page);
  check("quote page shows the document", t.includes("Quote Q-0001") && t.includes("Jane Customer") && t.includes("Valid until") && t.includes("Harness Plastering Ltd") && t.includes("Draft"), t.slice(0, 400));
  check("quote page fits 375px", await noHScroll(page));
  await shot(page, "quote-draft");

  await clickText(page, "Edit");
  await waitText(page, "Save changes");
  await setField(page, 'input[aria-label="Unit price"]', "100", 1);
  await clickText(page, "Save changes");
  await waitText(page, "Total: £481.20");
  check("edit saves and updates the total", db.tables.quotes[0].items[1].unitPrice === 100);

  await clickText(page, "Download PDF");
  let file = null;
  for (let i = 0; i < 60 && !file; i++) { await sleep(250); file = fs.readdirSync(DL).find((f) => f.endsWith(".pdf")); }
  const head = file ? fs.readFileSync(DL + file).subarray(0, 5).toString() : "";
  check("PDF downloads as Quote-Q-0001.pdf", file === "Quote-Q-0001.pdf" && head === "%PDF-", `${file} ${head}`);

  const to = await page.evaluate(() => document.querySelector("#send-to")?.value);
  check("send-to prefilled with the client's email", to === "jane@example.com", to);
  await clickText(page, "Send quote");
  await waitText(page, "Quote Q-0001 sent to jane@example.com");
  const mail = db.emails[0];
  check("email request is a quote without bank details", mail && mail.docType === "quote" && mail.bank.length === 0 && mail.total === "£481.20" && mail.number === "Q-0001" && /\d{1,2} \w+ \d{4}/.test(mail.dueDate) && mail.pdf?.length > 1000, JSON.stringify({ ...mail, pdf: mail?.pdf?.length }));
  await sleep(500);
  check("sending a draft marks it sent", db.tables.quotes[0].status === "sent", db.tables.quotes[0].status);
  t = await bodyText(page);
  check("sent quote can't be edited", !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Edit"))));

  await clickText(page, "Accepted");
  await sleep(500);
  check("mark accepted", db.tables.quotes[0].status === "accepted");

  db.fail["POST invoices"] = 1;
  await clickText(page, "Turn into invoice");
  await waitText(page, "mock failure on POST invoices");
  await sleep(300);
  check("invoice failure releases the claim", db.tables.quotes[0].status === "accepted" && db.tables.quotes[0].invoice_id === null && db.tables.invoices.length === 0, JSON.stringify(db.tables.quotes[0]));

  // Another device changes the quote; coming back to the tab shows it.
  db.tables.quotes[0].items[1].unitPrice = 120;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await waitText(page, "Total: £505.20");
  check("returning to the tab picks up changes from elsewhere", true);

  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Turn into invoice"); b.click(); b.click(); });
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/"), { timeout: 15000 });
  await sleep(500);
  const inv = db.tables.invoices[0];
  check("double tap makes exactly one invoice", db.tables.invoices.length === 1, db.tables.invoices.length);
  check("invoice copies the quote (latest version)", inv && inv.status === "draft" && JSON.stringify(inv.tags) === '["from Q-0001"]' && inv.items.length === 2 && inv.items[1].unitPrice === 120 && inv.client_id === C1 && inv.payment_terms === "14 days" && inv.due_date === plus(14) && inv.number.startsWith("DRAFT-") && inv.notes?.startsWith("Start Monday"), JSON.stringify(inv));
  check("quote linked to the invoice", db.tables.quotes[0].status === "invoiced" && db.tables.quotes[0].invoice_id === inv?.id, JSON.stringify(db.tables.quotes[0]));

  await page.goto(`${BASE}/quotes/${q1.id}`, { waitUntil: "networkidle0" });
  await waitText(page, "Turned into an invoice.");
  const href = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent === "Open the invoice")?.getAttribute("href"));
  check("invoiced quote links to its invoice", href === `/invoices/${inv?.id}`, href);
  check("invoiced quote has no send panel", !(await bodyText(page)).includes("Send quote"));

  const Q2 = newId(), INV2 = newId(), Q3 = newId(), Q4 = newId();
  db.tables.invoices.push({ id: INV2, user_id: "x", client_id: C1, date: today, number: "DRAFT-x", items: [], notes: null, due_date: null, payment_terms: null, status: "draft", tags: ["from Q-0002"] });
  db.tables.quotes.push({ id: Q2, user_id: "x", client_id: C1, number: "Q-0002", date: today, valid_until: null, items: [{ description: "a", quantity: 1, unitPrice: 10, vatRate: "standard" }], notes: "", status: "invoiced", invoice_id: null });
  db.tables.quotes.push({ id: Q3, user_id: "x", client_id: C1, number: "Q-0003", date: today, valid_until: null, items: [{ description: "b", quantity: 1, unitPrice: 10, vatRate: "standard" }], notes: "", status: "invoiced", invoice_id: null });
  db.tables.quotes.push({ id: Q4, user_id: "x", client_id: C1, number: "Q-0004", date: "2026-01-01", valid_until: "2026-01-31", items: [{ description: "c", quantity: 1, unitPrice: 10, vatRate: "standard" }], notes: "", status: "sent", invoice_id: null });

  await page.goto(`${BASE}/quotes/${Q2}`, { waitUntil: "networkidle0" });
  await waitText(page, "Turned into an invoice.");
  await sleep(300);
  check("unlinked invoice is found by its tag and linked", db.tables.quotes.find((q) => q.id === Q2).invoice_id === INV2);

  await page.goto(`${BASE}/quotes/${Q3}`, { waitUntil: "networkidle0" });
  await waitText(page, "Put it back to accepted");
  page.once("dialog", (d) => d.accept());
  await clickText(page, "Put it back to accepted");
  await waitText(page, "Accepted. Turn it into an invoice");
  check("stuck quote can be put back", db.tables.quotes.find((q) => q.id === Q3).status === "accepted");

  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0" });
  await waitText(page, "Q-0004");
  const rows = await page.evaluate(() => [...document.querySelectorAll("main a[href^='/quotes/']")].map((a) => a.innerText.replace(/\s+/g, " ")));
  const row = (n) => rows.find((r) => r.startsWith(n)) ?? "";
  check("list badges", row("Q-0001").includes("Invoiced") && row("Q-0003").includes("Accepted") && row("Q-0004").includes("Expired"), JSON.stringify(rows));
  check("list total incl. VAT", row("Q-0001").includes("£505.20"), row("Q-0001"));
  check("list fits 375px", await noHScroll(page));
  await shot(page, "quotes-list");

  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await waitText(page, "Quote number");
  const n5 = await page.evaluate(() => [...document.querySelectorAll("input")].find((i) => i.previousElementSibling?.textContent === "Quote number")?.value);
  check("next number follows the highest", n5 === "Q-0005", n5);
  await setField(page, "select", C1, 0);
  await setField(page, 'input[placeholder="What the work or item is"]', "x", 0);
  await setField(page, 'input[aria-label="Unit price"]', "5", 0);
  const numIdx = await page.evaluate(() => [...document.querySelectorAll("input")].findIndex((i) => i.previousElementSibling?.textContent === "Quote number"));
  await setField(page, "input", "Q-0001", numIdx);
  await clickText(page, "Save quote");
  await waitText(page, "already in use");
  check("duplicate number refused with a clear message", true);

  const Q6 = newId();
  db.tables.quotes.push({ id: Q6, user_id: "x", client_id: C1, number: "Q-0006", date: today, valid_until: null, items: [{ description: "d", quantity: 1, unitPrice: 10, vatRate: "standard" }], notes: "", status: "accepted", invoice_id: null });
  db.loseReply = { "POST invoices": 1 };
  await page.goto(`${BASE}/quotes/${Q6}`, { waitUntil: "networkidle0" });
  await waitText(page, "Turn into invoice");
  await clickText(page, "Turn into invoice");
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/"), { timeout: 15000 });
  await sleep(300);
  const made6 = db.tables.invoices.filter((i) => i.tags.includes("from Q-0006"));
  const q6 = db.tables.quotes.find((q) => q.id === Q6);
  check("lost reply: the invoice that was made is found and linked, no second one", made6.length === 1 && q6.status === "invoiced" && q6.invoice_id === made6[0].id, JSON.stringify({ made6: made6.length, q6 }));

  const sent = db.log.filter((l) => l.key.startsWith("DELETE"));
  check("no deletes attempted", sent.length === 0);
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "quotes-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
