// Quotes UX (feature/quotes-ux): pick anyone from clients and suppliers,
// add a company or private customer inline, the document for each, and the
// Send card's text/WhatsApp with the quote link. Mocked DB, stubbed lookups.
import { makeDb, launchSignedIn, signIn, sleep, clickText, bodyText, shot, newId } from "./mockdb-qux.mjs";
const BASE = "http://localhost:3300";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const plus = (days) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const db = makeDb();
db.tables.quote_links = []; db.tables.invoice_payments = []; db.tables.invoice_reminders_sent = []; db.tables.invoice_links = [];
const client = (o) => ({ id: newId(), user_id: "x", is_company: false, email: null, address: null, kind: "client", vat_number: null, payment_terms: null, default_currency: null, contact_person: null, phone: null, reminders_enabled: true, archived: false, ...o });
const JANE = client({ name: "Jane Customer", email: "jane@example.com", phone: "07700 900123" });
const ACME = client({ name: "Acme Kitchens Ltd", is_company: true, contact_person: "Sam Patel", vat_number: "GB999", email: "acme@example.com" });
const MERCH = client({ name: "Builders Merchant Ltd", is_company: true, kind: "supplier", email: "sales@merchant.example" });
const CAROL = client({ name: "Carol White", phone: "07700 900999" });
const PRIVVAT = client({ name: "Priv With Vat", vat_number: "GB555", contact_person: "Should Not Show" });
db.tables.clients.push(JANE, ACME, MERCH, CAROL, PRIVVAT, client({ name: "Bob Brown" }), client({ name: "Dan Green" }), client({ name: "Old Client", archived: true }));
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", address: "1 Test Street", vat_number: "GB123", vat_registered: true });
const quote = (o) => ({ id: newId(), user_id: "x", date: today, valid_until: plus(30), items: [{ description: "Skim coat", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", status: "draft", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, ...o });
const QCAROL = quote({ client_id: CAROL.id, number: "Q-0090", status: "sent" });
const QPV = quote({ client_id: PRIVVAT.id, number: "Q-0091" });
const QDEP = quote({ client_id: JANE.id, number: "Q-0092", status: "sent", deposit_percent: 25 });
db.tables.quotes.push(QCAROL, QPV, QDEP);

const intercept = (req, u) => {
  if (u.pathname === "/api/company-search") {
    const q = u.searchParams.get("q");
    req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, items: q ? [{ name: "Patel Plumbing Ltd", number: "01234567", address: "1 Pipe Street\nLondon\nE1 1AA", status: "active", incorporated: "2015-03-01" }] : [] }) });
    return true;
  }
  if (u.pathname === "/api/address-search") {
    req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ source: "osm", items: [{ id: "a1", label: "10 Downing Street, London", detail: "SW1A 2AA", lines: ["10 Downing Street", "London", "SW1A 2AA"] }] }) });
    return true;
  }
  return false;
};

const waitText = (page, t, timeout = 15000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const setField = (page, selector, value, index = 0) =>
  page.evaluate((sel, v, i) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) throw new Error("no field " + sel + " #" + i);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value, index);
const byLabel = (page, label) => page.evaluate((l) => {
  const lab = [...document.querySelectorAll("label")].find((x) => x.textContent.trim() === l);
  const el = lab && document.getElementById(lab.htmlFor);
  if (!el) throw new Error("no field " + l);
  el.setAttribute("data-t", l);
  return `[data-t="${l}"]`;
}, label);
const typeInto = async (page, label, text) => { const sel = await byLabel(page, label); await page.click(sel); await page.type(sel, text); };
const hasLabel = (page, label) => page.evaluate((l) => [...document.querySelectorAll("label")].some((x) => x.textContent.trim() === l), label);
const pickCustomer = (page, name) => page.evaluate((n) => { const b = [...document.querySelectorAll('[role="radio"]')].find((x) => x.querySelector("span span")?.textContent.trim() === n); if (!b) throw new Error("no customer " + n); b.click(); }, name);
const listed = (page) => page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"][aria-labelledby] > div')].map((g) => [g.querySelector("p").textContent, ...[...g.querySelectorAll('[role="radio"]')].map((b) => b.querySelector("span span").textContent)]));
const addLine = async (page, price) => {
  await setField(page, 'input[placeholder="What the work or item is"]', "Replaster lounge", 0);
  await setField(page, 'input[aria-label="Unit price"]', String(price), 0);
};
const sendCard = (page) => page.evaluate(() => {
  const s = document.getElementById("send-quote");
  if (!s) return null;
  return {
    tabs: [...s.querySelectorAll('[role="tab"]')].map((t) => `${t.textContent}${t.getAttribute("aria-selected") === "true" ? "*" : ""}`),
    message: document.getElementById("text-customer-message")?.value ?? null,
    sms: s.querySelector('a[href^="sms:"]')?.getAttribute("href") ?? null,
    wa: s.querySelector('a[href^="https://wa.me"]')?.getAttribute("href") ?? null,
    visible: s.innerText,
  };
});
const tab = (page, label) => page.evaluate((l) => [...document.querySelectorAll('#send-quote [role="tab"]')].find((t) => t.textContent === l).click(), label);
const docText = (page) => page.evaluate(() => [...document.querySelectorAll(".rounded-xl")].pop().innerText);

const { browser, page } = await launchSignedIn(db, { base: BASE, intercept });
const pending = new Map();
page.on("request", (r) => pending.set(r, r.url()));
page.on("requestfinished", (r) => pending.delete(r));
page.on("requestfailed", (r) => pending.delete(r));
setTimeout(() => console.log("PENDING", [...pending.values()].slice(0, 10)), 40000);
try {
  await signIn(page, BASE);

  // Picker: everyone, clients first, then suppliers, no archived.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await waitText(page, "Who it's for");
  check("picker: clients then suppliers, sorted, no archived", JSON.stringify(await listed(page)) === JSON.stringify([["Clients", "Acme Kitchens Ltd", "Bob Brown", "Carol White", "Dan Green", "Jane Customer", "Priv With Vat"], ["Suppliers", "Builders Merchant Ltd"]]), JSON.stringify(await listed(page)));
  const kinds = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[role="radio"]')].map((b) => [b.querySelector("span span").textContent, b.lastElementChild.textContent])));
  check("picker marks company / private", kinds["Acme Kitchens Ltd"] === "Company" && kinds["Jane Customer"] === "Private" && kinds["Builders Merchant Ltd"] === "Company", JSON.stringify(kinds));
  check("search box shown for a long list", await page.$('input[aria-label="Search clients and suppliers"]') !== null);
  await page.type('input[aria-label="Search clients and suppliers"]', "merch");
  check("search filters to the supplier", JSON.stringify(await listed(page)) === JSON.stringify([["Suppliers", "Builders Merchant Ltd"]]), JSON.stringify(await listed(page)));
  await setField(page, 'input[aria-label="Search clients and suppliers"]', "sam pat");
  check("search matches a company's contact", JSON.stringify(await listed(page)) === JSON.stringify([["Clients", "Acme Kitchens Ltd"]]), JSON.stringify(await listed(page)));
  await setField(page, 'input[aria-label="Search clients and suppliers"]', "Patel Plumbing");
  await waitText(page, "No one matches");
  check("no match says so", true);
  await shot(page, "qux-ux-picker");

  // New company, from the search, with the Companies House lookup.
  await clickText(page, "+ New customer");
  await waitText(page, "New customer");
  check("new customer asks company or private first", (await page.$$('[aria-label="Company or private person"] [role="radio"]')).length === 2 && !(await hasLabel(page, "Company name")) && !(await hasLabel(page, "Full name")));
  await clickText(page, "Company");
  await sleep(300);
  const prefilled = await page.evaluate((s) => document.querySelector(s)?.value, await byLabel(page, "Company name"));
  check("name carried over from the search", prefilled === "Patel Plumbing", prefilled);
  check("company form: name, contact, email, mobile, VAT, address", (await hasLabel(page, "Company name")) && (await hasLabel(page, "Contact name (optional)")) && (await hasLabel(page, "Email")) && (await hasLabel(page, "Mobile")) && (await hasLabel(page, "VAT number (optional)")) && (await hasLabel(page, "Address")));
  const nameSel = await byLabel(page, "Company name");
  await page.click(nameSel);
  await page.type(nameSel, " L");
  await page.waitForSelector('[role="option"]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('[role="option"]').click());
  await sleep(200);
  const afterPick = await page.evaluate((s) => ({ name: document.querySelector(s).value, address: [...document.querySelectorAll("textarea")].find((t) => t.id.endsWith("-address"))?.value }), nameSel);
  check("Companies House pick fills the name and registered address", afterPick.name === "Patel Plumbing Ltd" && afterPick.address === "1 Pipe Street\nLondon\nE1 1AA", JSON.stringify(afterPick));
  await typeInto(page, "Contact name (optional)", "Raj Patel");
  await typeInto(page, "Email", "raj@patelplumbing.example");
  await typeInto(page, "Mobile", "07700 900456");
  await typeInto(page, "VAT number (optional)", "GB 123 4567 89");
  check("new company form fits 375px", await noHScroll(page));
  await shot(page, "qux-ux-new-company");
  await clickText(page, "Add customer");
  await waitText(page, "Company · VAT GB 123 4567 89");
  const patel = db.tables.clients.find((c) => c.name === "Patel Plumbing Ltd");
  check("company saved as a client with is_company, contact, VAT, phone, address", patel && patel.is_company === true && patel.kind === "client" && patel.contact_person === "Raj Patel" && patel.vat_number === "GB 123 4567 89" && patel.phone === "07700 900456" && patel.email === "raj@patelplumbing.example" && patel.address === "1 Pipe Street\nLondon\nE1 1AA", JSON.stringify(patel));
  check("and picked for the quote", (await bodyText(page)).includes("Attn: Raj Patel · raj@patelplumbing.example · 07700 900456"));
  await addLine(page, 1000);
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const qPatel = db.tables.quotes.find((q) => q.client_id === patel?.id);
  check("quote saved for the new company", !!qPatel, JSON.stringify(db.tables.quotes.map((q) => q.client_id)));
  await waitText(page, "Total: £1,200.00");
  let doc = await docText(page);
  check("company quote shows Attn and its VAT number", doc.includes("Attn: Raj Patel") && doc.includes("VAT: GB 123 4567 89") && doc.includes("1 Pipe Street"), doc.slice(0, 500));
  check("page summary: company, total, no deposit, valid until", (await bodyText(page)).includes("Company · VAT GB 123 4567 89") && (await bodyText(page)).includes("£1,200.00") && (await bodyText(page)).includes("None"));
  let card = await sendCard(page);
  check("Send card: Email, Text, WhatsApp, PDF; email first when there's an email", JSON.stringify(card?.tabs) === JSON.stringify(["Email*", "Text", "WhatsApp", "PDF"]), JSON.stringify(card?.tabs));
  await clickText(page, "Send quote");
  await waitText(page, "sent to raj@patelplumbing.example");
  check("email greets the company's contact by first name", db.emails.at(-1)?.customerName === "Raj", db.emails.at(-1)?.customerName);
  await shot(page, "qux-ux-company-quote");

  // New private person, with the address finder.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await waitText(page, "Who it's for");
  await clickText(page, "+ New customer");
  await clickText(page, "Private person");
  await sleep(200);
  check("private form: name, email, mobile, address; no VAT or contact", (await hasLabel(page, "Full name")) && (await hasLabel(page, "Email")) && (await hasLabel(page, "Mobile")) && (await hasLabel(page, "Address")) && !(await hasLabel(page, "VAT number (optional)")) && !(await hasLabel(page, "Contact name (optional)")));
  await clickText(page, "Add customer");
  await waitText(page, "Add their name.");
  check("a name is needed", !db.tables.clients.some((c) => c.name === ""));
  await typeInto(page, "Full name", "Mary O'Neill");
  await typeInto(page, "Email", "mary@");
  await clickText(page, "Add customer");
  await waitText(page, "That email address doesn't look right.");
  check("a bad email is caught", !db.tables.clients.some((c) => c.name === "Mary O'Neill"));
  await typeInto(page, "Email", "example.com");
  await typeInto(page, "Mobile", "07911 123456");
  await page.type('input[placeholder^="Find address"]', "SW1A 2AA");
  await page.waitForSelector('ul[aria-label="Addresses"] li', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('ul[aria-label="Addresses"] li').click());
  await sleep(200);
  const addr = await page.evaluate(() => [...document.querySelectorAll("textarea")].find((t) => t.id.endsWith("-address"))?.value);
  check("address finder fills the address", addr === "10 Downing Street\nLondon\nSW1A 2AA", addr);
  await clickText(page, "Add customer");
  await waitText(page, "Private customer");
  const mary = db.tables.clients.find((c) => c.name === "Mary O'Neill");
  check("private person saved: is_company false, no VAT or contact", mary && mary.is_company === false && mary.kind === "client" && mary.vat_number === null && mary.contact_person === null && mary.phone === "07911 123456" && mary.email === "mary@example.com", JSON.stringify(mary));
  await addLine(page, 250);
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const qMary = db.tables.quotes.find((q) => q.client_id === mary?.id);
  await waitText(page, "Total: £300.00");
  doc = await docText(page);
  check("private quote: name and address, no Attn", doc.includes("Mary O'Neill") && doc.includes("10 Downing Street") && !doc.includes("Attn:"), doc.slice(0, 400));
  check("quote page fits 375px", await noHScroll(page));
  await shot(page, "qux-ux-private-quote");

  // Send card: text and WhatsApp with the link, draft marked sent.
  await tab(page, "Text");
  await sleep(200);
  card = await sendCard(page);
  const validUntil = new Date(`${plus(30)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  check("Text: 'Here's your quote' first, no link yet", card.message === `Hi Mary, here's your quote for £300.00, valid until ${validUntil}.\nHarness Plastering Ltd` && !card.visible.includes("Send quote"), JSON.stringify(card.message));
  check("Text: sms link to her mobile only", card.sms?.startsWith("sms:+447911123456?&body=Hi%20Mary") && card.wa === null, `${card.sms} ${card.wa}`);
  check("opening the tab makes no link", !db.tables.quote_links.some((l) => l.quote_id === qMary.id));
  page.once("dialog", (d) => d.dismiss());
  await clickText(page, "Add the link to view and accept it");
  await sleep(500);
  card = await sendCard(page);
  check("backing out of the link keeps it a draft, no link", qMary.status === "draft" && !db.tables.quote_links.some((l) => l.quote_id === qMary.id) && !card.message.includes("/q/"), qMary.status);
  let dialog = "";
  page.once("dialog", (d) => { dialog = d.message(); d.accept(); });
  await clickText(page, "Add the link to view and accept it");
  await page.waitForFunction(() => document.getElementById("text-customer-message")?.value.includes("/q/"), { timeout: 15000 });
  card = await sendCard(page);
  const token = db.tables.quote_links.find((l) => l.quote_id === qMary.id)?.token;
  check("asks first: adding the link sends the quote", dialog.startsWith("Adding the link sends the quote"), dialog);
  check("draft marked sent when the link goes in", qMary.status === "sent", qMary.status);
  check("message carries the quote's own link", !!token && card.message.includes(`You can see it and accept it here: ${BASE}/q/${token}`), card.message);
  check("sms body carries the link", decodeURIComponent(card.sms ?? "").includes(`/q/${token}`), card.sms);
  await waitText(page, "Waiting on the customer");
  check("page shows it sent", (await page.evaluate(() => document.querySelector("h1").parentElement.innerText)).includes("Sent"));
  await tab(page, "WhatsApp");
  await sleep(200);
  card = await sendCard(page);
  check("WhatsApp: wa.me with her number and the link, same message", card.wa?.startsWith("https://wa.me/447911123456?text=Hi%20Mary") && decodeURIComponent(card.wa).includes(`/q/${token}`) && card.sms === null && card.visible.includes("Open in WhatsApp"), card.wa);
  check("Send card fits 375px", await noHScroll(page));
  await page.evaluate(() => document.getElementById("send-quote").scrollIntoView());
  await page.screenshot({ path: new URL("./qux-ux-send-whatsapp.png", import.meta.url).pathname });
  await tab(page, "Text");
  await sleep(150);
  await page.evaluate(() => document.getElementById("send-quote").scrollIntoView());
  await page.screenshot({ path: new URL("./qux-ux-send-text.png", import.meta.url).pathname });
  await tab(page, "PDF");
  await sleep(150);
  card = await sendCard(page);
  check("PDF tab: share, download, print", ["Share (WhatsApp, Messages…)", "Download PDF", "Print"].every((t) => card.visible.includes(t)), card.visible);
  check("link section in the card", card.visible.includes("View and accept online") && card.visible.includes("Not opened yet."));

  // Phone but no email: opens on Text; a sent quote adds the link without asking.
  await page.goto(`${BASE}/quotes/${QCAROL.id}`, { waitUntil: "networkidle0" });
  await waitText(page, "Q-0090");
  card = await sendCard(page);
  check("no email, has a mobile: opens on Text", JSON.stringify(card.tabs) === JSON.stringify(["Email", "Text*", "WhatsApp", "PDF"]) && card.sms?.startsWith("sms:+447700900999"), JSON.stringify(card.tabs));
  let asked = false;
  page.once("dialog", (d) => { asked = true; d.accept(); });
  await clickText(page, "Add the link to view and accept it");
  await page.waitForFunction(() => document.getElementById("text-customer-message")?.value.includes("/q/"), { timeout: 15000 });
  page.removeAllListeners("dialog");
  check("already sent: link added without a question", !asked && QCAROL.status === "sent" && db.tables.quote_links.some((l) => l.quote_id === QCAROL.id));

  // A private customer's stray VAT number and contact stay off the quote.
  await page.goto(`${BASE}/quotes/${QPV.id}`, { waitUntil: "networkidle0" });
  await waitText(page, "Q-0091");
  doc = await docText(page);
  check("private customer: no VAT number or Attn on the quote", !doc.includes("GB555") && !doc.includes("Should Not Show") && (await bodyText(page)).includes("Private customer"), doc.slice(0, 300));

  // Editing a draft: a customer added there shows on the page after saving.
  await clickText(page, "Edit");
  await waitText(page, "Save changes");
  await clickText(page, "Change");
  await clickText(page, "+ New customer");
  await clickText(page, "Private person");
  await sleep(150);
  await typeInto(page, "Full name", "Nina Newman");
  await clickText(page, "Add customer");
  await waitText(page, "Nina Newman");
  await clickText(page, "Save changes");
  await waitText(page, "Dated");
  const nina = db.tables.clients.find((c) => c.name === "Nina Newman");
  check("edit: new customer saved, linked and shown", nina && QPV.client_id === nina.id && (await bodyText(page)).includes("Nina Newman"), JSON.stringify({ nina: nina?.id, q: QPV.client_id }));

  // A quote to a supplier becomes an invoice that still shows them.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await waitText(page, "Who it's for");
  await pickCustomer(page, "Builders Merchant Ltd");
  await waitText(page, "Company · one of your suppliers");
  await addLine(page, 90);
  await clickText(page, "Save quote");
  await page.waitForFunction(() => /\/quotes\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 15000 });
  const qMerch = db.tables.quotes.find((q) => q.client_id === MERCH.id);
  check("quote to a supplier keeps their client_id", !!qMerch);
  await waitText(page, "Turn into invoice");
  await clickText(page, "Turn into invoice");
  await page.waitForFunction(() => location.pathname.startsWith("/invoices/"), { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("select")?.options.length > 1, { timeout: 15000 });
  const sel = await page.evaluate(() => { const s = document.querySelector("select"); return { value: s.value, text: s.selectedOptions[0]?.textContent }; });
  check("draft invoice from it shows the supplier in its picker", sel.value === MERCH.id && sel.text === "Builders Merchant Ltd", JSON.stringify(sel));

  // No one yet: the new customer form is there straight away.
  const saved = db.tables.clients;
  db.tables.clients = [];
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await waitText(page, "New customer");
  check("empty account: add a customer right in the form, no dead end", (await bodyText(page)).includes("Save quote") && !(await bodyText(page)).includes("Add the client first") && !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Cancel" && b.closest(".rounded-lg.border.p-4")))));
  db.tables.clients = saved;

  // The list: status, total, deposit and valid until at a glance.
  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0" });
  await waitText(page, "Q-0092");
  const rows = await page.evaluate(() => [...document.querySelectorAll("main a[href^='/quotes/']")].map((a) => a.innerText.replace(/\s+/g, " ")));
  const row = rows.find((r) => r.startsWith("Q-0092")) ?? "";
  check("list row: number, customer, badge, total, deposit, valid until", row.includes("Jane Customer") && row.includes("Sent") && row.includes("£600.00") && row.includes("£150.00 deposit") && row.includes("until"), row);
  check("list fits 375px", await noHScroll(page));
  await shot(page, "qux-ux-list");

  check("no deletes attempted", !db.log.some((l) => l.key.startsWith("DELETE")));
} catch (e) {
  console.log("ERROR", e.message);
  await shot(page, "qux-ux-error");
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
