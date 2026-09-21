// Supplier quote requests, end to end against the dev server on 3305 with
// Supabase mocked (qr-mock-server.mjs on 5566). No email is ever sent: the
// dev server runs with RESEND_API_KEY empty and the send route is
// intercepted in the owner's browser.
import fs from "fs";
import puppeteer from "puppeteer-core";
import { startMockServer } from "./qr-mock-server.mjs";
import { makeDb, newId, sleep, bodyText } from "./qr-mockdb.mjs";
import { quoteRequestEmailHtml, quoteRequestEmailSubject, quoteRequestEmailText } from "/Users/nasko/Desktop/INVOICE/web/src/lib/quoteRequestEmail.ts";

const BASE = process.env.BASE ?? "http://localhost:3305";
const OUT = "/private/tmp/claude-501/-Users-nasko-Desktop-MM-INVOICES-AUTO/85090693-d203-4a4e-be6a-5911529c13ff/scratchpad/qr/";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : JSON.stringify(d ?? "").slice(0, 600)); };

const UID = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const db = makeDb();
const iso = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => iso(new Date(Date.now() + n * 86400000));
const NEEDED = inDays(20);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const userOf = (id, email) => ({ id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} });
const tokenOf = (id) => `${b64({ alg: "HS256" })}.${b64({ sub: id, exp, role: "authenticated" })}.x`;
const owner = userOf(UID, "owner@example.com");
const session = { access_token: tokenOf(UID), refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: owner };

const JEWSON = newId(), TRAVIS = newId(), MKM = newId(), BOB = newId(), SELCO = newId(), JANE = newId();
const supplier = (id, name, email, user_id = UID) => ({ id, user_id, name, email, address: "", kind: "supplier", archived: false, is_company: true, reminders_enabled: true, contact_person: null, vat_number: null });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Plastering Ltd", address: "1 Secret Lane", vat_registered: true, bank_details: "Sort code: 00-00-00", inbox_token: "SECRET-INBOX" });
db.tables.clients.push(
  supplier(JEWSON, "Jewson Bristol", "orders@jewson.example"),
  supplier(TRAVIS, "Travis Perkins", "quotes@travis.example"),
  supplier(MKM, "MKM Building", "sales@mkm.example"),
  supplier(BOB, "Bob's Builders", ""),
  supplier(SELCO, "Selco", "trade@selco.example"),
  { ...supplier(JANE, "Jane Customer", "jane@example.com"), kind: "client" }
);
db.tables.quote_requests = [];
db.tables.quote_request_suppliers = [];
db.tables.push_subscriptions = [];
const { server } = startMockServer(5566, db, { [UID]: owner, [OTHER]: userOf(OTHER, "other@example.com") });

const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
const sent = [];
const scanReply = {
  result: {
    lineItems: [
      { description: "Treated C24 4x2 3.6m", quantity: 20, unitPrice: 3.5, lineTotal: 70 },
      { description: "Multi Finish plaster 25kg bag", quantity: 10, unitPrice: 9, lineTotal: 90 },
      { description: "Delivery", quantity: 1, unitPrice: 0, lineTotal: 0 },
    ],
  },
};
let scans = 0;

// Waits (up to 10s) for the button to be there and enabled: a save in
// flight disables them.
const clickBtn = async (page, text) => {
  const h = await page.waitForFunction((t) => [...document.querySelectorAll("button,a")].find((x) => x.textContent.trim() === t && !x.disabled), { timeout: 60000 }, text).catch(() => null);
  if (!h) throw new Error("no button " + text);
  await h.evaluate((b) => b.click());
};
const clickInRow = async (page, name, text) => {
  const h = await page.waitForFunction((n, t) => {
    const row = [...document.querySelectorAll('[data-testid="supplier-row"]')].find((r) => r.querySelector("p")?.textContent.trim() === n);
    return row && [...row.querySelectorAll("button,a")].find((x) => x.textContent.trim() === t && !x.disabled);
  }, { timeout: 60000 }, name, text).catch(() => null);
  if (!h) throw new Error(`no button ${text} for ${name}`);
  await h.evaluate((b) => b.click());
};
const rowText = (page, name) => page.evaluate((n) => [...document.querySelectorAll('[data-testid="supplier-row"]')].find((r) => r.querySelector("p")?.textContent.trim() === n)?.innerText ?? "", name);
const setValue = (page, sel, v) => page.evaluate((s, val) => {
  const el = document.querySelector(s);
  if (!el) throw new Error("no field " + s);
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}, sel, v);
const waitText = (page, t, timeout = 30000) => waitTextRaw(page, t, Math.max(timeout, 90000));
const waitTextRaw = (page, t, timeout) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t);
const fits = async (page) => {
  const r = await page.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return true;
    const out = [`scrollWidth ${document.documentElement.scrollWidth}`];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.right > window.innerWidth + 1 && b.width > 0 && !el.closest(".overflow-x-auto")) out.push(`${el.tagName}.${String(el.className?.baseVal ?? el.className ?? "").slice(0, 60)} right=${Math.round(b.right)} text=${(el.innerText ?? "").slice(0, 30).replace(/\n/g, " ")}`);
    }
    return out.slice(0, 8).join(" | ");
  });
  if (r !== true) console.log("OVERFLOW", r);
  return r === true;
};
const until = async (fn, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end && !fn()) await sleep(100); return fn(); };
const rowFor = (supplierId) => db.tables.quote_request_suppliers.find((r) => r.supplier_id === supplierId);

async function fillPrices(page, lines, { delivery, vatIncluded, validUntil, name, note } = {}) {
  for (const [n, v] of lines.entries()) {
    if (v === "x") {
      await page.evaluate((i) => { const boxes = [...document.querySelectorAll("fieldset label")].filter((l) => l.textContent.includes("Can't supply")); boxes[i].querySelector("input").click(); }, n);
    } else if (v !== "") {
      await setValue(page, `input[aria-label$="for line ${n + 1}"][inputmode="decimal"]`, String(v));
    }
  }
  if (delivery !== undefined) await setValue(page, "#pf-delivery", String(delivery));
  if (vatIncluded) await clickBtn(page, "Prices include VAT");
  if (validUntil) await setValue(page, "#pf-valid", validUntil);
  if (note) await setValue(page, "#pf-note", note);
  if (name) await setValue(page, "#qr-name", name);
}

async function supplierPage(token, hash = "") {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(120000);
  await p.setViewport({ width: 375, height: 900 });
  // Each supplier is their own visitor: the answer route limits per address.
  await p.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  p.on("pageerror", (e) => console.log("SUPPLIER PAGEERROR", e.message));
  const res = await p.goto(`${BASE}/r/${token}${hash}`, { waitUntil: "networkidle0", timeout: 120000 });
  return { p, res };
}
const respond = (page, body) => page.evaluate(async (b) => { const r = await fetch("/api/quote-requests/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; }, body);

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 375, height: 900 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("dialog", (d) => d.accept());
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname === "/api/quote-requests/send" && req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      const row = db.tables.quote_request_suppliers.find((r) => r.id === body.id);
      const client = db.tables.clients.find((c) => c.id === row?.supplier_id);
      sent.push({ ...body, auth: req.headers().authorization ?? "", savedEmail: client?.email });
      const sentAt = new Date().toISOString();
      if (row) row.sent_at = sentAt;
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ sent: true, to: body.to, sentAt }) });
    }
    if (u.pathname === "/api/scan" && req.method() === "POST") {
      scans++;
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(scanReply) });
    }
    req.continue();
  });
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);

  // ── Gathered, clearly separated ──
  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0", timeout: 180000 });
  await waitText(page, "From suppliers", 120000);
  check("Quotes has My quotes / From suppliers tabs", (await bodyText(page)).includes("My quotes"));
  await clickBtn(page, "From suppliers");
  await waitText(page, "No requests yet", 120000);
  check("From suppliers tab lists requests (empty state)", page.url().endsWith("/quotes/requests"));

  // ── Create a request to 3 suppliers ──
  await clickBtn(page, "New request");
  await waitText(page, "Ask these suppliers", 120000);
  check("new request offers only suppliers (not clients)", await page.evaluate(() => {
    const t = document.body.innerText;
    return t.includes("Jewson Bristol") && t.includes("Bob's Builders") && !t.includes("Jane Customer");
  }));
  await setValue(page, "#qr-title", "Kitchen extension, 12 High St");
  await setValue(page, 'input[aria-label="Item 1"]', "4x2 C24 treated timber 3.6m");
  await setValue(page, 'input[aria-label="Quantity for item 1"]', "20");
  await setValue(page, 'input[aria-label="Unit for item 1"]', "lengths");
  await clickBtn(page, "Add item");
  await setValue(page, 'input[aria-label="Item 2"]', "Plasterboard 12.5mm 2400x1200");
  await setValue(page, 'input[aria-label="Quantity for item 2"]', "30");
  await setValue(page, 'input[aria-label="Unit for item 2"]', "sheets");
  await setValue(page, 'input[aria-label="Note for item 2"]', "Gyproc or equivalent");
  await clickBtn(page, "Add item");
  await setValue(page, 'input[aria-label="Item 3"]', "Multi-finish plaster 25kg");
  await setValue(page, 'input[aria-label="Quantity for item 3"]', "10");
  await setValue(page, 'input[aria-label="Unit for item 3"]', "bags");
  await setValue(page, "#qr-needed", inDays(-1));
  await clickBtn(page, "Save request");
  await waitText(page, "needed-by date is in the past", 5000);
  check("a needed-by date in the past is refused", db.tables.quote_requests.length === 0);
  await setValue(page, "#qr-needed", NEEDED);
  await setValue(page, 'input[aria-label="Site number and street"]', "12 High St");
  await setValue(page, 'input[aria-label="Town or city"]', "Bristol");
  await setValue(page, 'input[aria-label="Postcode"]', "BS1 4DJ");
  await setValue(page, "#qr-notes", "Site has a narrow lane, small lorry please.");
  await clickBtn(page, "Save request");
  await waitText(page, "Pick at least one supplier", 5000);
  check("saving without a supplier is refused", db.tables.quote_requests.length === 0);
  for (const name of ["Jewson Bristol", "Travis Perkins", "MKM Building"]) {
    await page.evaluate((n) => [...document.querySelectorAll("fieldset label")].find((l) => l.textContent.includes(n)).querySelector("input").click(), name);
  }
  await page.screenshot({ path: OUT + "qr-1-request-form.png", fullPage: true });
  check("375px: new request form fits", await fits(page));
  await clickBtn(page, "Save request");
  await page.waitForFunction(() => /\/quotes\/requests\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60000 });
  await waitText(page, "What you asked for", 60000);
  const R = db.tables.quote_requests[0];
  const ids = R?.items.map((i) => i.id) ?? [];
  check("request saved: title, 3 items with ids, needed by, site, open", R && R.title === "Kitchen extension, 12 High St" && R.items.length === 3 && new Set(ids).size === 3 && ids.every((x) => /^[A-Za-z0-9_-]{1,40}$/.test(x)) && R.needed_by === NEEDED && R.site_address.includes("BS1 4DJ") && R.status === "open", R);
  check("items keep qty, unit and note", R.items[0].quantity === 20 && R.items[0].unit === "lengths" && R.items[1].note === "Gyproc or equivalent", R.items);
  const rows0 = db.tables.quote_request_suppliers;
  check("one row per supplier, each with its own 43-char token, all waiting", rows0.length === 3 && new Set(rows0.map((r) => r.token)).size === 3 && rows0.every((r) => /^[A-Za-z0-9_-]{43}$/.test(r.token) && r.status === "waiting" && !r.sent_at && r.request_id === R.id), rows0);
  await clickBtn(page, "Edit");
  await waitText(page, "Edit the list", 30000);
  await setValue(page, 'input[aria-label="Note for item 3"]', "Any brand");
  await clickBtn(page, "Save changes");
  await waitText(page, "What you asked for", 30000);
  check("the list can be edited before it's sent (same item ids)", await until(() => R.items[2].note === "Any brand") && R.items.map((i) => i.id).join() === ids.join(), R.items);

  // ── Per-supplier sends ──
  for (const name of ["Jewson Bristol", "Travis Perkins", "MKM Building"]) {
    await clickInRow(page, name, "Email request");
    await waitText(page, `Request emailed to ${name}`, 20000);
  }
  check("three separate sends, each to that supplier's saved address", sent.length === 3 && sent.every((s) => s.to === s.savedEmail && s.auth.startsWith("Bearer ")) && new Set(sent.map((s) => s.id)).size === 3, sent);
  check("sent_at set on each row; badges now Waiting", db.tables.quote_request_suppliers.every((r) => r.sent_at) && (await rowText(page, "Jewson Bristol")).includes("Waiting"));
  check("the list can't be edited once sent", !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Edit"))));
  const lockTry = await page.evaluate(async (s) => (await fetch(`http://localhost:5566/rest/v1/quote_requests?id=eq.${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", apikey: "fake-anon" }, body: JSON.stringify({ items: [] }) })).status, R);
  check("(mock of the DB trigger) items change refused after sending", lockTry === 400);

  // What the server puts in each email, from the saved rows (the route's builder).
  for (const s of sent) {
    const row = db.tables.quote_request_suppliers.find((r) => r.id === s.id);
    const client = db.tables.clients.find((c) => c.id === row.supplier_id);
    const input = { issuerName: "Harness Plastering Ltd", supplierName: client.name, title: R.title, items: R.items, neededBy: "x", siteAddress: R.site_address, notes: R.notes, link: `${BASE}/r/${row.token}`, replyTo: "owner@example.com" };
    const html = quoteRequestEmailHtml(input), text = quoteRequestEmailText(input);
    check(`email for ${client.name}: subject, own link, reply-to, list`, quoteRequestEmailSubject(input) === "Quote request from Harness Plastering Ltd: Kitchen extension, 12 High St" && html.includes(`href="${BASE}/r/${row.token}"`) && text.includes(`${BASE}/r/${row.token}`) && text.includes("30 sheets × Plasterboard 12.5mm 2400x1200 (Gyproc or equivalent)") && html.includes("reach Harness Plastering Ltd") && text.includes("owner@example.com"));
  }
  const esc = quoteRequestEmailHtml({ issuerName: "<b>Evil</b>", supplierName: "", title: "<script>", items: [{ description: "\"><img>", quantity: 1, unit: "", note: "" }], neededBy: "", siteAddress: "", notes: "", link: "https://x/r/a", replyTo: null });
  check("email escapes every value", !esc.includes("<script>") && !esc.includes("<b>Evil") && !esc.includes("\"><img>"));

  // The real route (not intercepted): guards before it would send.
  const api = (body, token = session.access_token) => fetch(`${BASE}/api/quote-requests/send`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const jRow = rowFor(JEWSON);
  let r1 = await api({ id: jRow.id, to: "orders@jewson.example" });
  check("route: right row + saved address passes every check, then stops (RESEND_API_KEY empty)", r1.status === 503 && r1.body?.code === "not_configured", r1);
  r1 = await api({ id: jRow.id, to: "someone@else.example" });
  check("route: an address other than the saved one is refused", r1.status === 409 && /changed/.test(r1.body?.error), r1);
  r1 = await api({ id: jRow.id, to: "orders@jewson.example" }, "");
  check("route: signed out is refused", r1.status === 401, r1);
  r1 = await api({ id: jRow.id, to: "orders@jewson.example" }, tokenOf(OTHER));
  check("route: another account can't send this row", r1.status === 404, r1);

  // ── Supplier pages ──
  const J = rowFor(JEWSON), T = rowFor(TRAVIS), M = rowFor(MKM);
  let { p: sp, res } = await supplierPage(J.token);
  await waitText(sp, "Your prices", 120000);
  let st = await bodyText(sp);
  check("supplier page: the list, who it's from, needed by, deliver to, notes", res.status() === 200 && st.includes("Kitchen extension, 12 High St") && st.includes("Harness Plastering Ltd would like your prices") && st.includes("Deliver to") && st.includes("BS1 4DJ") && st.includes("narrow lane") && st.includes("20 lengths") && st.includes("Gyproc or equivalent"), st.slice(0, 500));
  const html = await sp.content();
  check("supplier page: nothing else about the owner, no ids, no other suppliers", !html.includes("SECRET-INBOX") && !html.includes("1 Secret Lane") && !html.includes("00-00-00") && !html.includes(UID) && !html.includes(R.id) && !html.includes(J.id) && !html.includes("Travis") && !html.includes("owner@example.com") && !st.includes("Clients & suppliers") && !st.includes("Feedback"));
  check("supplier page: noindex and no-referrer", /noindex/.test(await sp.$eval('meta[name="robots"]', (m) => m.content).catch(() => "")) && (await sp.$eval('meta[name="referrer"]', (m) => m.content).catch(() => "")) === "no-referrer");
  await clickBtn(sp, "Send prices");
  await waitText(sp, "Add a price for line 1", 5000);
  check("an unpriced line is refused before sending", J.status === "waiting");
  await fillPrices(sp, [4.2, 9, 11], { delivery: 25, validUntil: inDays(30), name: "Dave", note: "Can deliver Tuesday" });
  await sleep(200);
  check("editing clears the old error", !(await bodyText(sp)).includes("Add a price for line 1"));
  check("the form totals ex VAT with delivery", (await bodyText(sp)).includes("Total £489.00 ex VAT"));
  await sp.screenshot({ path: OUT + "qr-2-supplier-page.png", fullPage: true });
  check("375px: supplier page fits", await fits(sp));
  await clickBtn(sp, "Send prices");
  await waitText(sp, "your prices have gone to Harness Plastering Ltd", 20000);
  const jPrices = J.prices;
  check("Jewson's answer stored: online, per item id, VAT excluded, delivery, valid until, name", J.status === "replied" && J.source === "online" && J.responder_name === "Dave" && J.delivery === 25 && J.vat_included === false && J.valid_until === inDays(30) && jPrices[ids[0]]?.price === 4.2 && jPrices[ids[2]]?.price === 11 && J.note === "Can deliver Tuesday", J);
  await sp.reload({ waitUntil: "networkidle0" });
  st = await bodyText(sp);
  check("after reload: their prices shown back, no form", st.includes("You sent these prices") && st.includes("£489.00") && !st.includes("Send prices"));
  let again = await respond(sp, { token: J.token, prices: { [ids[0]]: { price: 1, unavailable: false, note: "" } } });
  check("submit once: a second answer is refused", again.status === 409 && J.prices[ids[0]].price === 4.2, again);
  const junk = await respond(sp, { token: J.token, prices: { [ids[0]]: { price: -5 } } });
  check("negative or bad prices refused before the database", junk.status === 400, junk);

  // Travis: VAT included, delivery £48 inc VAT.
  ({ p: sp } = await supplierPage(T.token));
  await waitText(sp, "Your prices", 60000);
  await fillPrices(sp, [4.8, 11.4, 12.6], { delivery: 48, vatIncluded: true });
  await sleep(200);
  check("VAT-inclusive form totals inc VAT", (await bodyText(sp)).includes("Total £612.00 inc VAT"));
  await clickBtn(sp, "Send prices");
  await waitText(sp, "your prices have gone to", 20000);
  check("Travis stored as VAT included", T.vat_included === true && T.delivery === 48 && T.prices[ids[1]].price === 11.4, T);

  // MKM: can't supply two lines.
  ({ p: sp } = await supplierPage(M.token));
  await waitText(sp, "Your prices", 60000);
  await fillPrices(sp, ["x", 8.9, "x"], { delivery: 30 });
  await sleep(100);
  check("can't supply disables that line's price", await sp.evaluate(() => document.querySelector('input[aria-label$="for line 1"][inputmode="decimal"]').disabled));
  await clickBtn(sp, "Send prices");
  await waitText(sp, "your prices have gone to", 20000);
  check("MKM stored with can't-supply lines", M.prices[ids[0]].unavailable === true && M.prices[ids[0]].price === null && M.prices[ids[1]].price === 8.9 && M.prices[ids[2]].unavailable === true, M.prices);

  // Owner's #o copy: no form.
  const oc = await supplierPage(M.token, "#o");
  await sleep(500);

  // ── Manual entry: Bob (no email) added later, prices typed in ──
  await page.goto(`${BASE}/quotes/requests/${R.id}`, { waitUntil: "networkidle0" });
  await waitText(page, "Add a supplier", 30000);
  await page.select('select[aria-label="Add a supplier"]', BOB);
  await clickBtn(page, "Add");
  await page.waitForFunction(() => document.body.innerText.includes("Bob's Builders") && document.body.innerText.includes("No email saved"), { timeout: 90000 });
  const B = rowFor(BOB);
  await clickInRow(page, "Bob's Builders", "Copy link");
  await page.waitForFunction(() => !!document.querySelector('input[aria-label="Bob\'s Builders\'s link"]'), { timeout: 90000 });
  const shownUrl = await page.$eval('input[aria-label="Bob\'s Builders\'s link"]', (e) => e.value);
  check("Copy link shows the link too and counts as sent", shownUrl === `${BASE}/r/${rowFor(BOB).token}` && !!(await until(() => rowFor(BOB).sent_at)), shownUrl);
  check("supplier added later; with no email there's no Email button", B && !(await rowText(page, "Bob's Builders")).includes("Email request") && /Copy link|Copied/.test(await rowText(page, "Bob's Builders")));
  await clickInRow(page, "Bob's Builders", "Enter prices");
  await waitText(page, "Prices from Bob's Builders", 20000);
  await fillPrices(page, [3.5, "", 9], { delivery: 60, note: "Phoned 19/9" });
  await clickBtn(page, "Save their prices");
  await waitText(page, "Bob's Builders's prices are saved", 20000);
  check("manual entry saved through the function: source manual, blank line missing, never £0", B.status === "replied" && B.source === "manual" && B.prices[ids[1]].price === null && !B.prices[ids[1]].unavailable && B.prices[ids[0]].price === 3.5 && B.delivery === 60, B);
  const patches = db.log.filter((l) => l.key === "PATCH quote_request_suppliers");
  check("the app never writes answer columns directly (only token / sent_at)", patches.every((l) => Object.keys(l.body ?? {}).every((k) => ["token", "sent_at"].includes(k))), patches);
  check("Bob's row says typed in by you", (await rowText(page, "Bob's Builders")).includes("Typed in by you"));

  // ── Compare, case 1: delivery makes the split not worth it ──
  await waitText(page, "Best value", 20000);
  let rec = await page.$eval('[data-testid="recommendation"]', (e) => e.innerText);
  check("case 1: best single Jewson £489 (Travis converted from inc VAT)", rec.includes("Best value: everything from Jewson Bristol") && rec.includes("£489.00 ex VAT"), rec);
  check("case 1: cheaper lines elsewhere not worth it once deliveries are paid", rec.includes("£517.00 once 2 deliveries are paid, so splitting isn't worth it"), rec);
  const table = await page.evaluate(() => {
    const t = document.querySelector("table");
    return { head: [...t.querySelectorAll("thead th")].map((th) => th.innerText.trim()), rows: [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, " ").trim())) };
  });
  check("table: items as rows, suppliers as columns", JSON.stringify(table.head) === JSON.stringify(["Item", "Jewson Bristol", "Travis Perkins", "MKM Building", "Bob's Builders"]), table.head);
  check("timber line: Bob cheapest (£70), MKM can't supply", table.rows[0][4].startsWith("£70.00 Cheapest") && table.rows[0][3] === "Can't supply" && table.rows[0][2] === "£80.00", table.rows[0]);
  check("board line: MKM cheapest £267, Bob's missing price shown as No price (not £0)", table.rows[1][3].startsWith("£267.00 Cheapest") && table.rows[1][4] === "No price", table.rows[1]);
  check("totals row: Jewson £489, Travis £510, MKM £297 (1 of 3), Bob £220 (2 of 3)", table.rows[4][1] === "£489.00" && table.rows[4][2] === "£510.00" && table.rows[4][3].startsWith("£297.00") && table.rows[4][3].includes("1 of 3") && table.rows[4][4].includes("2 of 3"), table.rows[4]);
  check("inc VAT row: Travis £612.00", table.rows[5][2] === "£612.00", table.rows[5]);
  check("the recommended cells are the ones picked (all Jewson)", await page.evaluate(() => [...document.querySelectorAll("table button[aria-pressed=true]")].map((b) => b.getAttribute("aria-label")).every((l) => l.includes("from Jewson Bristol"))));

  // ── Scan path: Bob's revised quote as a PDF, free delivery ──
  const pdfPath = OUT + "bob-quote.pdf";
  fs.writeFileSync(pdfPath, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await clickInRow(page, "Bob's Builders", "Change prices");
  await waitText(page, "Attach their quote", 20000);
  await (await page.$('input[type="file"][aria-label="Their quote document"]')).uploadFile(pdfPath);
  await waitText(page, "Read its lines", 10000);
  await clickBtn(page, "Read its lines");
  await waitText(page, "matched 2 of 3", 20000);
  const matched = await page.evaluate(() => [...document.querySelectorAll('select[id^="match-"]')].map((s) => s.options[s.selectedIndex].text));
  check("scanned lines matched by description, the unmatched one left for him", scans === 1 && matched[0].startsWith("Treated C24 4x2 3.6m") && matched[1] === "Not on their quote" && matched[2].startsWith("Multi Finish plaster"), matched);
  check("matched prices filled in", await page.evaluate(() => document.querySelector('input[aria-label$="for line 1"][inputmode="decimal"]').value === "3.5"));
  await setValue(page, "#pf-delivery", "");
  await clickBtn(page, "Save their prices");
  await waitText(page, "prices are saved", 20000);
  check("scan saved: source scan, document stored in the owner's folder, old answer kept in previous", B.source === "scan" && B.delivery === null && db.uploads.length === 1 && db.uploads[0].path.startsWith(`${UID}/quote-requests/${B.id}/`) && B.document_path === db.uploads[0].path && B.previous.length === 1 && B.previous[0].source === "manual" && B.previous[0].delivery === 60, { B, uploads: db.uploads });
  check("Bob's row offers his quote document", (await rowText(page, "Bob's Builders")).includes("Their quote document"));

  // ── Compare, case 2: split worth it ──
  await waitText(page, "split the order", 20000);
  rec = await page.$eval('[data-testid="recommendation"]', (e) => e.innerText);
  check("case 2: split Jewson + Bob £455, £34 less than all from Jewson", rec.includes("Best value: split the order between Jewson Bristol and Bob's Builders") && rec.includes("£455.00 ex VAT with 2 deliveries") && rec.includes("£34.00 less than everything from Jewson Bristol (£489.00)"), rec);
  let orders = await page.$$eval('[data-testid="order"]', (els) => els.map((e) => e.innerText));
  check("order lists follow the split: Jewson board, Bob timber + plaster", orders.length === 2 && orders[0].includes("Jewson Bristol") && orders[0].includes("30 sheets × Plasterboard 12.5mm 2400x1200 @ £9.00 = £270.00") && orders[1].includes("Bob's Builders") && orders[1].includes("20 lengths × 4x2 C24 treated timber 3.6m @ £3.50 = £70.00") && orders[1].includes("10 bags × Multi-finish plaster 25kg @ £9.00 = £90.00"), orders);
  check("order text carries delivery address and needed-by", orders[0].includes("Deliver to: 12 High St, Bristol, BS1 4DJ") && orders[0].includes("Needed by:") && orders[0].includes("Delivery: £25.00") && orders[0].includes("Total: £295.00 ex VAT"), orders[0]);
  check("Email button pre-addressed for a supplier with an email, none for Bob", await page.evaluate(() => {
    const o = [...document.querySelectorAll('[data-testid="order"]')];
    const a = o[0].querySelector('a[href^="mailto:"]');
    return !!a && a.getAttribute("href").startsWith("mailto:orders@jewson.example?subject=Order%3A%20Kitchen") && !o[1].querySelector('a[href^="mailto:"]');
  }));
  check("choice not saved while following the recommendation", R.choice === null);

  // ── Per-line override ──
  await page.evaluate(() => [...document.querySelectorAll("table button")].find((b) => b.getAttribute("aria-label").startsWith("Plasterboard") && b.getAttribute("aria-label").includes("MKM Building")).click());
  await page.waitForFunction(() => document.body.innerText.includes("Your picks come to"), { timeout: 90000 });
  check("override saved on the request: board from MKM", await until(() => R.choice && R.choice[ids[1]] === M.id && R.choice[ids[0]] === B.id && R.choice[ids[2]] === B.id), R.choice);
  orders = await page.$$eval('[data-testid="order"]', (els) => els.map((e) => e.innerText));
  check("order lists follow the override: MKM board (with its delivery), Bob the rest", orders.length === 2 && orders.some((o) => o.includes("MKM Building") && o.includes("£8.90 = £267.00") && o.includes("Delivery: £30.00")) && !orders.some((o) => o.includes("Jewson")), orders);
  const rec2 = await page.$eval('[data-testid="recommendation"]', (e) => e.innerText);
  check("the override is shown against the best value", rec2.includes("Use the best value") && rec2.includes("Your picks come to £457.00 ex VAT"), rec2);
  await page.evaluate(() => [...document.querySelectorAll("table button[aria-pressed=true]")].find((b) => b.getAttribute("aria-label").startsWith("Multi-finish")).click());
  await waitText(page, "Not ordering: Multi-finish plaster 25kg", 20000);
  check("tapping a picked price leaves that line out", await until(() => R.choice?.[ids[2]] === null));
  await (await page.$('section[aria-labelledby="compare-heading"]')).screenshot({ path: OUT + "qr-3b-compare-override.png" });
  await (await page.$('section[aria-labelledby="orders-heading"]')).screenshot({ path: OUT + "qr-4b-orders-override.png" });
  check("375px: request page fits (the table scrolls inside its card)", await fits(page));
  await clickBtn(page, "Use the best value");
  await page.waitForFunction(() => !document.body.innerText.includes("Not ordering") && !document.body.innerText.includes("Use the best value"), { timeout: 90000 });
  orders = await page.$$eval('[data-testid="order"]', (els) => els.map((e) => e.innerText));
  check("Use the best value clears his picks and follows the split again", (await until(() => R.choice === null)) && orders.length === 2 && orders[0].includes("Jewson Bristol") && orders[1].includes("Bob's Builders"), { choice: R.choice, orders });
  await page.evaluate(() => [...document.querySelectorAll("table button")].find((b) => b.getAttribute("aria-label").startsWith("4x2") && b.getAttribute("aria-label").includes("Jewson")).click());
  await page.waitForFunction(() => document.body.innerText.includes("Everything from Jewson Bristol instead") || document.body.innerText.includes("Your picks"), { timeout: 90000 });
  await clickBtn(page, "Everything from Jewson Bristol instead");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="order"]').length === 1, { timeout: 90000 });
  check("Everything from the best single supplier: one order, saved as his pick", await until(() => R.choice && Object.keys(R.choice).length === 3 && Object.values(R.choice).every((v) => v === J.id)), R.choice);
  await clickBtn(page, "Use the best value");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="order"]').length === 2, { timeout: 90000 });
  await until(() => R.choice === null);
  await sleep(1500);
  await (await page.$('section[aria-labelledby="compare-heading"]')).screenshot({ path: OUT + "qr-3-compare.png" });
  await (await page.$('section[aria-labelledby="orders-heading"]')).screenshot({ path: OUT + "qr-4-orders.png" });
  await page.setViewport({ width: 768, height: 900 });
  await sleep(800);
  await (await page.$('section[aria-labelledby="compare-heading"]')).screenshot({ path: OUT + "qr-3-compare-768.png" });
  await page.setViewport({ width: 375, height: 900 });
  await sleep(500);
  await page.screenshot({ path: OUT + "qr-5-request-page.png", fullPage: true });

  // ── Closed / reopened / declined online / ask again ──
  await page.select('select[aria-label="Add a supplier"]', SELCO);
  await clickBtn(page, "Add");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="supplier-row"]')].some((r) => r.innerText.includes("Selco")), { timeout: 90000 });
  const S = rowFor(SELCO);
  await clickBtn(page, "Close request");
  await waitText(page, "Reopen request", 20000);
  check("request closed", R.status === "closed");
  ({ p: sp } = await supplierPage(S.token));
  st = await bodyText(sp);
  check("closed request: supplier sees it's closed, no form", st.includes("This request is closed") && !st.includes("Send prices"), st.slice(0, 400));
  let late = await respond(sp, { token: S.token, prices: { [ids[0]]: { price: 1, unavailable: false, note: "" } } });
  check("closed request: the server refuses an answer", late.status === 409 && S.status === "waiting", late);
  await clickBtn(page, "Reopen request");
  await waitText(page, "Close request", 20000);
  await sp.reload({ waitUntil: "networkidle0" });
  await clickBtn(sp, "We can't quote for this");
  await setValue(sp, "#qr-decline-note", "Out of stock until November");
  await clickBtn(sp, "Yes, we can't quote");
  await waitText(sp, "You said you can't quote for this", 20000);
  check("declined online: status declined, reason kept", S.status === "declined" && S.source === "online" && S.note === "Out of stock until November", S);
  await page.reload({ waitUntil: "networkidle0" });
  await waitText(page, "Said they can't quote", 20000);
  check("owner sees Can't quote with the reason", (await rowText(page, "Selco")).includes("Can't quote") && (await rowText(page, "Selco")).includes("Out of stock until November"));
  await clickInRow(page, "Selco", "Ask them again");
  await page.waitForFunction(() => document.body.innerText.includes("Selco can answer again"), { timeout: 90000 });
  check("ask again: back to waiting, their answer kept in previous", S.status === "waiting" && S.previous.length === 1 && S.previous[0].source === "online", S);
  await sp.reload({ waitUntil: "networkidle0" });
  check("after ask again the supplier can answer from the same link", (await bodyText(sp)).includes("Send prices"));

  // Stale page: supplier answers online while the owner's page shows waiting.
  await clickInRow(page, "Selco", "Enter prices");
  await waitText(page, "Prices from Selco", 20000);
  await fillPrices(sp, [4, 9, 10], { delivery: 0 });
  await clickBtn(sp, "Send prices");
  await waitText(sp, "your prices have gone to", 20000);
  await fillPrices(page, [1, 1, 1]);
  await clickBtn(page, "Save their prices");
  await waitText(page, "changed since the page loaded", 20000);
  check("owner's typed prices don't overwrite an online answer they haven't seen", S.source === "online" && S.prices[ids[0]].price === 4, S);
  await clickBtn(page, "Cancel");

  // Expired: a request whose needed-by date has passed.
  const R2 = newId(), X = newId();
  db.tables.quote_requests.push({ id: R2, user_id: UID, title: "Old job", items: [{ id: "a1", description: "Sand", quantity: 1, unit: "bag", note: "" }], notes: "", needed_by: inDays(-2), site_address: "", status: "open", choice: null, created_at: new Date().toISOString() });
  db.tables.quote_request_suppliers.push({ id: X, user_id: UID, request_id: R2, supplier_id: JEWSON, token: "e".repeat(43), sent_at: new Date().toISOString(), status: "waiting", responded_at: null, source: null, responder_name: null, prices: {}, delivery: null, vat_included: false, valid_until: null, note: "", document_path: null, previous: [] });
  ({ p: sp } = await supplierPage("e".repeat(43)));
  st = await bodyText(sp);
  check("expired request: supplier sees it has closed, no form", st.includes("so the request has closed") && !st.includes("Send prices"), st.slice(0, 300));
  late = await respond(sp, { token: "e".repeat(43), prices: { a1: { price: 3, unavailable: false, note: "" } } });
  check("expired request: the server refuses too", late.status === 409, late);
  const nf = await (await browser.createBrowserContext()).newPage();
  const nfRes = await nf.goto(`${BASE}/r/${"z".repeat(43)}`, { waitUntil: "networkidle0" });
  const nfHtml = await nfRes.text();
  check("unknown link: not found, noindex", nfHtml.includes("could not be found") && nfHtml.includes("noindex"));
  const ocText = await bodyText(oc.p);
  check("owner's #o copy: no form, says it's his copy", ocText.includes("This is your copy of the link") || ocText.includes("already has your prices") || ocText.includes("You sent these prices"), ocText.slice(0, 300));

  // ── The list: each supplier's status and total ──
  await page.goto(`${BASE}/quotes/requests`, { waitUntil: "networkidle0" });
  await waitText(page, "Kitchen extension", 20000);
  const card = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.innerText.includes("Kitchen extension")).innerText);
  check("list: each supplier with status and ex-VAT total", card.includes("Jewson Bristol") && card.includes("£489.00") && card.includes("Travis Perkins") && card.includes("£510.00") && card.includes("£297.00 (1/3)") && card.includes("Selco") && card.includes("Replied"), card);
  check("list: expired request listed separately with its own supplier", (await bodyText(page)).includes("Old job"));
  await page.screenshot({ path: OUT + "qr-6-list.png", fullPage: true });
  check("375px: list fits", await fits(page));
  check("no UNHANDLED calls reached the mock", !db.log.some((l) => l.key.startsWith("UNHANDLED")), db.log.filter((l) => l.key.startsWith("UNHANDLED")));
} catch (e) {
  console.log("ERROR", e.stack);
  check("no crash", false, e.message);
} finally {
  await browser.close();
  server.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
