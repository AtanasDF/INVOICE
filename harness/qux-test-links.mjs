import puppeteer from "puppeteer-core";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, newId, sleep, bodyText } from "./mockdb-qux.mjs";
const BASE = "http://localhost:3300";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
const UID = "00000000-0000-4000-8000-000000000001";
const C = newId(), I = newId(), D = newId();
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Plastering Ltd", address: "1 Test St", vat_registered: false, bank_details: "Sort code: 00-00-00", inbox_token: "SECRET-INBOX" });
db.tables.clients.push({ id: C, user_id: UID, name: "Jane Customer", email: "jane@example.com", address: "2 Road", kind: "client", archived: false, is_company: false, reminders_enabled: true });
db.tables.invoices.push({ id: I, user_id: UID, client_id: C, date: "2026-09-10", number: "INV-1001", items: [{ description: "Skim coat", quantity: 1, unitPrice: 450, vatRate: "standard" }], notes: "Thanks", due_date: "2026-10-10", payment_terms: "30 days", status: "sent", tags: [], vat_registered: false });
db.tables.invoices.push({ id: D, user_id: UID, client_id: C, date: "2026-09-10", number: "DRAFT-x", items: [], notes: null, due_date: null, payment_terms: null, status: "draft", tags: [], vat_registered: null });
db.tables.invoice_links = []; db.tables.credit_notes = []; db.tables.invoice_payments = []; db.tables.invoice_reminders_sent = []; db.tables.push_subscriptions = []; db.tables.quotes = [];
const { server } = startMockServer(5555, db);

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} };
const session = { access_token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, exp, role: "authenticated" })}.x`, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user };
try {
  const owner = await browser.newPage();
  await owner.setViewport({ width: 375, height: 900 });
  const emails = [];
  await owner.setRequestInterception(true);
  owner.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/send-invoice") { emails.push(JSON.parse(req.postData() || "{}")); return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ sent: true, to: "jane@example.com" }) }); }
    req.continue();
  });
  owner.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await owner.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await owner.evaluate((s) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
  await owner.goto(`${BASE}/invoices/${I}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("View online"), { timeout: 60000 });
  await owner.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Make and copy the link").click());
  await owner.waitForFunction(() => document.body.innerText.includes("Not opened yet."), { timeout: 15000 });
  const link = db.tables.invoice_links[0];
  check("owner makes a link: 43-char token stored for the invoice", link && link.invoice_id === I && /^[A-Za-z0-9_-]{43}$/.test(link.token), JSON.stringify(link));
  const url = `${BASE}/i/${link.token}`;
  check("link shown on the page", (await owner.$eval('input[aria-label="Invoice link"]', (e) => e.value)) === url);

  await owner.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send invoice").click());
  await owner.waitForFunction(() => document.body.innerText.includes("sent to"), { timeout: 30000 });
  check("email request carries the view link", emails[0]?.viewUrl === url, emails[0]?.viewUrl);

  const ctx = await browser.createBrowserContext();
  const customer = await ctx.newPage();
  await customer.setViewport({ width: 375, height: 900 });
  const resp = await customer.goto(url, { waitUntil: "networkidle0" });
  await sleep(1500);
  const ct = await bodyText(customer);
  check("customer sees the invoice without signing in", resp.status() === 200 && ct.includes("Invoice INV-1001") && ct.includes("Harness Plastering Ltd") && ct.includes("Amount due: £450.00") && ct.includes("Download PDF"), ct.slice(0, 300));
  check("no app menu, no feedback button", !ct.includes("Clients & suppliers") && !ct.includes("Sign in") && !ct.includes("Feedback"));
  const robots = await customer.$eval('meta[name="robots"]', (m) => m.content).catch(() => "");
  check("kept out of search engines", /noindex/.test(robots), robots);
  const html = await customer.content();
  check("nothing private leaks into the page (inbox token, record ids)", !html.includes("SECRET-INBOX") && !html.includes(I) && !html.includes(C) && !html.includes(UID), [html.includes(I), html.includes(C), html.includes(UID)]);
  check("opening it is recorded once, with the first-open time", link.view_count === 1 && !!link.first_viewed_at, JSON.stringify(link));
  await customer.reload({ waitUntil: "networkidle0" });
  await sleep(1200);
  check("the same visitor reloading doesn't count twice", link.view_count === 1, link.view_count);

  await owner.goto(`${BASE}/invoices/${I}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("Opened once"), { timeout: 15000 });
  check("owner sees 'Opened once'", true);
  const before = link.view_count;
  await owner.goto(url, { waitUntil: "networkidle0" });
  await sleep(1200);
  check("the owner opening their own link isn't counted", link.view_count === before, link.view_count);

  // The owner's own email copy links with #o: not counted even signed out.
  const ctx2 = await browser.createBrowserContext();
  const ownCopy = await ctx2.newPage();
  const beforeOwn = link.view_count;
  await ownCopy.goto(`${url}#o`, { waitUntil: "networkidle0" });
  await sleep(1200);
  check("the owner's copy (#o) isn't counted", link.view_count === beforeOwn, link.view_count);

  // Stopping a link: the old one dies, a new one works.
  const oldToken = link.token;
  await owner.goto(`${BASE}/invoices/${I}`, { waitUntil: "networkidle0" });
  await owner.waitForFunction(() => document.body.innerText.includes("Stop this link"), { timeout: 15000 });
  owner.once("dialog", (d) => d.accept());
  await owner.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Stop this link and make a new one").click());
  await sleep(1500);
  check("stopping makes a new token", link.token !== oldToken && /^[A-Za-z0-9_-]{43}$/.test(link.token), link.token);
  await customer.goto(`${BASE}/i/${oldToken}`, { waitUntil: "networkidle0" });
  check("the old link no longer shows the invoice", (await bodyText(customer)).includes("could not be found"));
  await customer.goto(`${BASE}/i/${link.token}`, { waitUntil: "networkidle0" });
  check("the new link works", (await bodyText(customer)).includes("Invoice INV-1001"));
  const long = await customer.goto(`${BASE}/i/${link.token}x`, { waitUntil: "networkidle0" });
  check("a 44-character code is refused", (await bodyText(customer)).includes("could not be found"), long.status());

  const bad = await customer.goto(`${BASE}/i/${"x".repeat(43)}`, { waitUntil: "networkidle0" });
  const badText = await bodyText(customer);
  check("unknown link: not-found page, nothing shown", badText.includes("could not be found") && !badText.includes("INV-"), bad.status());
  db.tables.invoice_links.push({ invoice_id: D, user_id: UID, token: "d".repeat(43), created_at: "2026-09-19", first_viewed_at: null, last_viewed_at: null, view_count: 0 });
  const draft = await customer.goto(`${BASE}/i/${"d".repeat(43)}`, { waitUntil: "networkidle0" });
  const draftText = await bodyText(customer);
  check("a draft's link shows nothing", draftText.includes("could not be found") && !draftText.includes("DRAFT") && !draftText.includes("Harness"), draft.status());
} catch (e) {
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  server.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }), "unhandled:", db.log.filter((l) => l.key.startsWith("UNHANDLED")).map((l) => l.key).slice(0, 5));
}
