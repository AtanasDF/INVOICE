import puppeteer from "puppeteer-core";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, newId, sleep, bodyText } from "./mockdb.mjs";
const BASE = "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const UID = "00000000-0000-4000-8000-000000000001";
const C = newId(), Q1 = newId(), Q2 = newId(), Q3 = newId();
const today = new Date().toISOString().slice(0, 10);
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Plastering Ltd", vat_registered: false, inbox_token: "SECRET-INBOX" });
db.tables.clients.push({ id: C, user_id: UID, name: "Jane Customer", email: "jane@example.com", address: "2 Road", kind: "client", archived: false, is_company: false, reminders_enabled: true, payment_terms: "14 days" });
const quote = (id, number, status, valid) => ({ id, user_id: UID, client_id: C, number, date: today, valid_until: valid, items: [{ description: "Skim coat kitchen", quantity: 1, unitPrice: 900, vatRate: "standard" }], notes: "Two days", status, invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false });
db.tables.quotes.push(quote(Q1, "Q-0001", "sent", "2099-01-01"), quote(Q2, "Q-0002", "draft", "2099-01-01"), quote(Q3, "Q-0003", "sent", "2020-01-01"));
db.tables.quote_links = []; db.tables.invoices = []; db.tables.credit_notes = []; db.tables.push_subscriptions = []; db.tables.invoice_payments = [];
const { server } = startMockServer(5555, db);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const session = { access_token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, exp, role: "authenticated" })}.x`, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: UID, aud: "authenticated", role: "authenticated", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} } };
const clickBtn = (page, text) => page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t); if (!b) throw new Error("no button " + t); b.click(); }, text);
try {
  const owner = await browser.newPage();
  await owner.setViewport({ width: 375, height: 900 });
  const emails = [];
  await owner.setRequestInterception(true);
  owner.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/send-invoice") { emails.push(JSON.parse(req.postData() || "{}")); return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ sent: true, to: "jane@example.com" }) }); }
    req.continue();
  });
  owner.on("dialog", (d) => d.accept());
  await owner.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await owner.evaluate((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);

  await owner.goto(`${BASE}/quotes/${Q1}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("View and accept online"), { timeout: 60000 });
  await clickBtn(owner, "Make and copy the link");
  await owner.waitForFunction(() => document.body.innerText.includes("Not opened yet."), { timeout: 15000 });
  const l1 = db.tables.quote_links.find((l) => l.quote_id === Q1);
  check("owner makes a quote link", l1 && /^[A-Za-z0-9_-]{43}$/.test(l1.token), JSON.stringify(l1));
  await clickBtn(owner, "Send quote");
  await owner.waitForFunction(() => document.body.innerText.includes("sent to"), { timeout: 30000 });
  check("quote email carries the /q/ link", emails[0]?.viewUrl === `${BASE}/q/${l1.token}` && emails[0]?.docType === "quote", emails[0]?.viewUrl);

  await owner.goto(`${BASE}/quotes/${Q2}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("View and accept online"), { timeout: 30000 });
  await clickBtn(owner, "Make and copy the link");
  await owner.waitForFunction(() => document.body.innerText.includes("Not opened yet."), { timeout: 15000 });
  check("sharing a draft's link marks it sent", db.tables.quotes.find((q) => q.id === Q2).status === "sent");

  const ctx = await browser.createBrowserContext();
  const cust = await ctx.newPage();
  await cust.setViewport({ width: 375, height: 900 });
  const ownPage = await (await browser.createBrowserContext()).newPage();
  await ownPage.goto(`${BASE}/q/${l1.token}#o`, { waitUntil: "networkidle0" });
  await sleep(800);
  const ownText = await bodyText(ownPage);
  check("owner's copy: no Accept/Decline, not counted", ownText.includes("This is your copy of the link") && !ownText.includes("Accept quote") && (l1.view_count ?? 0) === 0, ownText.slice(0, 200));
  await cust.goto(`${BASE}/q/${l1.token}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  let t = await bodyText(cust);
  check("customer sees the quote and Accept / Decline", t.includes("Quote Q-0001") && t.includes("Accept quote") && t.includes("Decline") && !t.includes("Clients & suppliers"), t.slice(0, 300));
  check("nothing private in the page", !(await cust.content()).includes("SECRET-INBOX") && !(await cust.content()).includes(Q1));
  check("opening counted once", l1.view_count === 1, l1.view_count);
  await clickBtn(cust, "Accept quote");
  await sleep(300);
  await cust.evaluate(() => { const i = document.getElementById("responder-name"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Jane Smith"); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await clickBtn(cust, "Yes, accept the quote");
  await cust.waitForFunction(() => document.body.innerText.includes("You accepted this quote"), { timeout: 15000 });
  const q1 = db.tables.quotes.find((q) => q.id === Q1);
  check("accepting sets the quote accepted and records the name", q1.status === "accepted" && l1.response === "accepted" && l1.responder_name === "Jane Smith", JSON.stringify({ s: q1.status, l1 }));
  await cust.reload({ waitUntil: "networkidle0" });
  check("after reload it still says accepted, no buttons", (await bodyText(cust)).includes("You accepted this quote") && !(await bodyText(cust)).includes("Accept quote"));
  const again = await cust.evaluate(async (token) => (await fetch("/api/quote-links/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, response: "declined", name: "x" }) })).status, l1.token);
  check("a second answer is refused", again === 409 && q1.status === "accepted", again);

  db.tables.quote_links.push({ quote_id: Q3, user_id: UID, token: "e".repeat(43), created_at: today, first_viewed_at: null, last_viewed_at: null, view_count: 0, response: null, responded_at: null, responder_name: null });
  await cust.goto(`${BASE}/q/${"e".repeat(43)}`, { waitUntil: "networkidle0" });
  t = await bodyText(cust);
  check("an expired quote can't be accepted", t.includes("was valid until") && !t.includes("Accept quote"));
  const late = await cust.evaluate(async () => (await fetch("/api/quote-links/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "e".repeat(43), response: "accepted" }) })).status);
  check("and the server refuses it too", late === 409 && db.tables.quotes.find((q) => q.id === Q3).status === "sent", late);

  await owner.goto(`${BASE}/quotes/${Q1}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("Accepted online"), { timeout: 20000 });
  check("owner sees 'Accepted online by Jane Smith'", (await bodyText(owner)).includes("Accepted online by Jane Smith"));

  // The owner reopens it: the customer can answer again.
  await clickBtn(owner, "Not accepted after all");
  await owner.waitForFunction(() => document.body.innerText.includes("Waiting on the customer"), { timeout: 15000 });
  check("owner's page drops the old online answer once reopened", !(await bodyText(owner)).includes("Accepted online"));
  await cust.goto(`${BASE}/q/${l1.token}`, { waitUntil: "networkidle0" });
  await sleep(800);
  check("customer can answer again after the owner reopens", (await bodyText(cust)).includes("Accept quote"));
  await clickBtn(cust, "Decline");
  await sleep(200);
  await clickBtn(cust, "Yes, decline it");
  await cust.waitForFunction(() => document.body.innerText.includes("You declined this quote"), { timeout: 15000 });
  check("second, later answer applies", db.tables.quotes.find((q) => q.id === Q1).status === "declined");

  // A failed email leaves a draft a draft.
  const Q4 = newId();
  db.tables.quotes.push(quote(Q4, "Q-0004", "draft", "2099-01-01"));
  owner.removeAllListeners("request");
  owner.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/send-invoice") return req.respond({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "The email couldn't be sent. Try again in a minute." }) });
    req.continue();
  });
  await owner.goto(`${BASE}/quotes/${Q4}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("Send quote"), { timeout: 20000 });
  await clickBtn(owner, "Send quote");
  await owner.waitForFunction(() => document.body.innerText.includes("couldn't be sent"), { timeout: 20000 });
  check("a failed email doesn't mark the draft sent", db.tables.quotes.find((q) => q.id === Q4).status === "draft");

  const robots = await (await (await browser.createBrowserContext()).newPage()).goto(`${BASE}/q/${"z".repeat(43)}`).then((r) => r.text());
  check("unknown link: not found, noindex", robots.includes("could not be found") && robots.includes("noindex"));
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  server.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
