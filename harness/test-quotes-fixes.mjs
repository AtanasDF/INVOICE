// Review fixes on feature/quotes-ux: no save over a half-added customer,
// Clear form on a new quote, invoiced suppliers' reminder switch, the draft
// invoice picker keeping a supplier, and no draft link in shared text.
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, newId } from "./mockdb-qux.mjs";
const BASE = process.env.BASE ?? "http://localhost:3300";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const db = makeDb();
db.tables.quote_links = []; db.tables.invoice_payments = []; db.tables.invoice_reminders_sent = []; db.tables.invoice_links = []; db.tables.credit_notes = [];
const client = (o) => ({ id: newId(), user_id: "x", is_company: false, email: null, address: null, kind: "client", vat_number: null, payment_terms: null, default_currency: null, contact_person: null, phone: null, reminders_enabled: true, archived: false, ...o });
const JANE = client({ name: "Jane Customer", email: "jane@example.com", phone: "07700 900123" });
const MERCH = client({ name: "Builders Merchant Ltd", is_company: true, kind: "supplier", email: "sales@merchant.example" });
const OTHERSUP = client({ name: "Timber Yard Ltd", is_company: true, kind: "supplier" });
db.tables.clients.push(JANE, MERCH, OTHERSUP);
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", address: "1 Test Street", vat_number: "GB123", vat_registered: true });
const DRAFTINV = { id: newId(), user_id: "x", client_id: MERCH.id, date: today, number: "DRAFT-1", items: [{ description: "Skim coat", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", due_date: today, payment_terms: "", status: "draft", tags: ["from Q-0001"], vat_registered: null, cis_rate: null };
const SENTINV = { ...DRAFTINV, id: newId(), number: "INV-9", status: "sent", tags: [] };
db.tables.invoices.push(DRAFTINV, SENTINV);
const Q = { id: newId(), user_id: "x", client_id: JANE.id, number: "Q-0100", date: today, valid_until: today, items: [{ description: "Skim coat", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", status: "draft", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false };
db.tables.quotes.push(Q);

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-quotes-fixes" });
page.on("dialog", (d) => d.accept());
const setField = (sel, v) => page.evaluate((s, x) => { const el = document.querySelector(s); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, x); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v);
try {
  await signIn(page, BASE);

  // New quote: half-added customer blocks Save; Clear form empties it.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Who it's for"), { timeout: 15000 });
  check("Clear form shown and off while empty", await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Clear form")?.disabled === true));
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes("Jane Customer")).click());
  await setField('input[placeholder="What the work or item is"]', "Skim coat");
  await sleep(200);
  await clickText(page, "Change");
  await clickText(page, "+ New customer");
  await clickText(page, "Private person");
  await setField('input[placeholder="e.g. Jane Smith"]', "Half Typed");
  await clickText(page, "Save quote");
  await sleep(400);
  check("Save quote refused while a new customer is being added", (await bodyText(page)).includes("Finish adding the new customer") && db.tables.quotes.length === 1);
  await clickText(page, "Cancel");
  await sleep(200);
  await clickText(page, "Clear form");
  await sleep(300);
  const after = await page.evaluate(() => ({ desc: document.querySelector('input[placeholder="What the work or item is"]').value, forCard: document.body.innerText.includes("For\n"), num: [...document.querySelectorAll("input")].find((i) => i.previousElementSibling?.textContent === "Quote number")?.value }));
  check("Clear form: lines and customer gone, number kept", after.desc === "" && !after.forCard && !!after.num, JSON.stringify(after));

  // Draft invoice to a supplier keeps the supplier in the picker after a change.
  await page.goto(`${BASE}/invoices/${DRAFTINV.id}`, { waitUntil: "networkidle0" });
  await sleep(800);
  const opts = async () => page.evaluate((m) => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === m)); return s ? [...s.options].map((o) => o.value) : null; }, MERCH.id);
  const before = await opts();
  if (before) {
    await page.evaluate((m, j) => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === m)); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, j); s.dispatchEvent(new Event("change", { bubbles: true })); }, MERCH.id, JANE.id);
    await sleep(300);
    const afterOpts = await page.evaluate((j) => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === j) && x.value === j); return s ? [...s.options].map((o) => o.value) : null; }, JANE.id);
    check("draft invoice: the supplier it's for stays pickable after changing", !!afterOpts && afterOpts.includes(MERCH.id), JSON.stringify(afterOpts));
    check("draft invoice: other suppliers aren't offered", !afterOpts?.includes(OTHERSUP.id));
  } else {
    const text = await bodyText(page);
    console.log("no picker on the draft page; text:", text.slice(0, 300));
    check("draft invoice picker found", false);
  }

  // A supplier with an invoice gets the reminders switch on the Suppliers tab.
  await page.goto(`${BASE}/clients?tab=supplier`, { waitUntil: "networkidle0" });
  await sleep(600);
  const cards = await page.evaluate(() => [...document.querySelectorAll(".rounded-xl.border")].map((c) => c.innerText));
  const merchCard = cards.find((t) => t.includes("Builders Merchant Ltd")) ?? "";
  check("invoiced supplier shows Payment history", merchCard.includes("Payment history"), merchCard);
  check("supplier without invoices doesn't", !(cards.find((t) => t.includes("Timber Yard Ltd")) ?? "").includes("Payment history"));
  await page.evaluate(() => { const card = [...document.querySelectorAll(".rounded-xl.border")].find((c) => c.innerText.includes("Builders Merchant Ltd")); [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit").click(); });
  await sleep(300);
  const box = await page.evaluate(() => [...document.querySelectorAll("label")].some((l) => l.textContent.includes("Send automatic payment reminders")));
  check("invoiced supplier: reminders switch in Edit", box);
  await page.evaluate(() => { const l = [...document.querySelectorAll("label")].find((x) => x.textContent.includes("Send automatic payment reminders")); l.querySelector("input").click(); });
  await clickText(page, "Save");
  await sleep(800);
  check("switch saves reminders_enabled false on the supplier", db.tables.clients.find((c) => c.id === MERCH.id).reminders_enabled === false);

  // Invoice page: 'Edit the client' opens the Suppliers tab for a supplier.
  await page.goto(`${BASE}/invoices/${SENTINV.id}`, { waitUntil: "networkidle0" });
  await sleep(800);
  const href = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Edit the client")?.getAttribute("href"));
  check("Edit the client goes to the Suppliers tab", href === "/clients?tab=supplier", String(href));

  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  if (!fits) console.log("wide:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)} r=${Math.round(e.getBoundingClientRect().right)} ${e.innerText?.slice(0, 40)}`))));
  check("fits 375px", fits);
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
