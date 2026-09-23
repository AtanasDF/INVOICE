// The supplier's price page, /r/<token> (item 53 on Atanas's list): its own
// dev server against the stand-in database, as test-public-logo reads /i/
// and /q/. A supplier sees the list and the sender's business name and
// nothing else, prices it once or says they can't quote, and a closed,
// expired or already answered request says so instead of taking prices.
// (test-quote-requests covers the owner's side, on a server of its own.)
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, newId, UID, day } from "./mockdb.mjs";

const WEB = "/Users/nasko/Desktop/INVOICE/web";
const PORT = 3314;
const MOCK = 3564;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { quote_requests: [], quote_request_suppliers: [], push_subscriptions: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Plastering Ltd", bank_details: "Sort code 12-34-56, account 12345678", vat_number: "GB123456789", vat_registered: true });
const supplier = (name, contact_person = null) => {
  const id = newId();
  db.tables.clients.push({ id, user_id: UID, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, kind: "supplier", archived: false, is_company: true, contact_person });
  return id;
};
const JEWSON = supplier("Jewson Leeds", "Sam"), TRAVIS = supplier("Travis Perkins"), MKM = supplier("MKM Building Supplies"), SELCO = supplier("Selco"), BOB = supplier("Bob's Builders Merchant");
const request = (title, extra) => {
  const id = newId();
  db.tables.quote_requests.push({
    id, user_id: UID, title, status: "open", needed_by: day(20), site_address: "12 High St\nLeeds\nLS1 2AB", notes: "Morning delivery please.",
    items: [
      { id: "a1", description: "Plasterboard 12.5mm 2400x1200", quantity: 30, unit: "sheet", note: "Gyproc or equivalent" },
      { id: "a2", description: "Multi-finish plaster 25kg", quantity: 10, unit: "bag", note: "" },
    ],
    ...extra,
  });
  return id;
};
const OPEN = request("Kitchen extension"), CLOSED = request("Loft conversion", { status: "closed" }), LATE = request("Garage", { needed_by: day(-1) });
const token = (c) => c.repeat(43);
const row = (request_id, supplier_id, t, extra = {}) => {
  const r = { id: newId(), user_id: UID, request_id, supplier_id, token: t, status: "waiting", source: null, responded_at: null, responder_name: null, prices: {}, delivery: null, vat_included: false, valid_until: null, note: "", sent_at: new Date().toISOString(), ...extra };
  db.tables.quote_request_suppliers.push(r);
  return r;
};
const S1 = row(OPEN, JEWSON, token("a"));
const S2 = row(OPEN, TRAVIS, token("b"));
row(OPEN, MKM, token("c"), { status: "replied", source: "online", responded_at: `${day(-2)}T09:30:00Z`, responder_name: "Mo", prices: { a1: { price: 9.1, unavailable: false, note: "" }, a2: { price: 11.5, unavailable: false, note: "" } }, delivery: 30, valid_until: day(10), note: "" });
row(OPEN, SELCO, token("d"), { status: "replied", source: "manual", responded_at: `${day(-1)}T10:00:00Z`, prices: { a1: { price: 8.5, unavailable: false, note: "" } } });
row(CLOSED, BOB, token("e"));
row(LATE, BOB, token("f"));
row(OPEN, BOB, token("g"));

const { server: mock } = startMockServer(MOCK, db);
const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key" },
  stdio: ["ignore", "pipe", "pipe"],
});
const respond = (body, ip = "10.1.0.1") =>
  fetch(`${base}/api/quote-requests/respond`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

let browser;
try {
  for (let i = 0; i < 240; i++) {
    const r = await fetch(`${base}/r/${token("g")}`, { signal: AbortSignal.timeout(120000) }).catch(() => null);
    if (r && r.status === 200) { await r.text(); break; }
    await sleep(1000);
  }
  browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 900 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  const open = async (t, hash = "") => {
    const res = await page.goto(`${base}/r/${t}${hash}`, { waitUntil: "networkidle0", timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll("h1").length > 0, { timeout: 30000 }).catch(() => {});
    return { status: res?.status(), text: await page.evaluate(() => document.body.innerText) };
  };
  const press = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l && !x.disabled); b?.click(); return !!b; }, label);
  const typeInto = async (selector, text) => { const el = await page.$(selector); await el.click({ clickCount: 3 }); await el.type(text); };

  // An open request, priced.
  let p = await open(token("a"));
  check("the page opens on the request", p.status === 200 && p.text.includes("Kitchen extension"), String(p.status));
  check("it names the sender and greets the supplier's contact", p.text.includes("Harness Plastering Ltd would like your prices, Sam."), p.text.slice(0, 300));
  check("it shows when, where and the sender's note", p.text.includes("Needed by") && p.text.includes("12 High St") && p.text.includes("Morning delivery please."));
  check("every line has a price box", !!(await page.$('input[aria-label="Plasterboard 12.5mm 2400x1200: price per sheet"]')) && !!(await page.$('input[aria-label="Multi-finish plaster 25kg: price per bag"]')));
  check("nothing else about the sender: no bank details, VAT number or other suppliers", !/12-34-56|GB123456789|Travis|MKM|Selco|Bob's/.test(p.text), p.text.slice(0, 400));
  const meta = await page.evaluate(() => ({ robots: document.querySelector('meta[name="robots"]')?.content, referrer: document.querySelector('meta[name="referrer"]')?.content, title: document.title }));
  check("kept out of search engines, sends no referrer, titled with the sender", /noindex/.test(meta.robots ?? "") && meta.referrer === "no-referrer" && meta.title === "Quote request from Harness Plastering Ltd", JSON.stringify(meta));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  const alert = () => page.evaluate(() => document.querySelector('[role="alert"]')?.textContent ?? "");
  await press("Send prices");
  await sleep(300);
  check("an empty form is refused line by line, and nothing is saved", (await alert()) === 'Add a price for line 1 (Plasterboard 12.5mm 2400x1200), or tick "Can\'t supply".' && S1.status === "waiting", await alert());
  await page.click('input[aria-label="Plasterboard 12.5mm 2400x1200: can\'t supply"]');
  await page.click('input[aria-label="Multi-finish plaster 25kg: can\'t supply"]');
  await press("Send prices");
  await sleep(300);
  check("every line \"can't supply\" points to the can't-quote button instead", /^Nothing is priced\. If you can't supply any of it, tap "We can't quote for this"/.test(await alert()) && S1.status === "waiting", await alert());
  await page.click('input[aria-label="Plasterboard 12.5mm 2400x1200: can\'t supply"]');

  await typeInto('input[aria-label="Plasterboard 12.5mm 2400x1200: price per sheet"]', "8.95");
  await typeInto("#pf-delivery", "25");
  await page.$eval("#pf-valid", (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, day(30));
  await typeInto("#pf-note", "Two days' lead time.");
  await typeInto("#qr-name", "Sam Jones");
  // Pressed twice, which is what a supplier on a depot phone does. `disabled`
  // lands a render too late, so both post; the database takes one answer only
  // and refuses the second, and the page then showed that refusal -- "it may
  // have been answered already, closed or passed its date. Please contact the
  // sender." -- beside the prices it had just sent.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Send prices" && !x.disabled);
    b?.click();
    b?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("Thank you: your prices have gone to Harness Plastering Ltd."), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const twice = await page.evaluate(() => document.body.innerText);
  check("sending prices twice at once does not tell them to contact the sender", !/contact the sender/i.test(twice), twice.slice(0, 400));
  check("...and shows no failure beside the thank-you", !/didn't work|can't take prices/i.test(twice), twice.slice(0, 400));
  p = { text: await page.evaluate(() => document.body.innerText) };
  check("Send prices thanks them, naming the sender", p.text.includes("Thank you: your prices have gone to Harness Plastering Ltd."), p.text.slice(0, 400));
  check("...and shows what they sent", /8\.95|268\.50/.test(p.text) && p.text.includes("Can't supply"), p.text.slice(0, 600));
  check("the answer is stored as theirs, online, line by line", S1.status === "replied" && S1.source === "online" && S1.prices.a1?.price === 8.95 && S1.prices.a2?.unavailable === true && S1.prices.a2?.price === null && S1.delivery === 25 && S1.valid_until === day(30) && S1.note === "Two days' lead time." && S1.responder_name === "Sam Jones", JSON.stringify(S1));
  p = await open(token("a"));
  check("opened again, it shows their prices back, with no form", /You sent these prices on/.test(p.text) && !(await page.$('input[aria-label="Plasterboard 12.5mm 2400x1200: price per sheet"]')), p.text.slice(0, 400));
  let r = await respond({ token: token("a"), prices: { a1: { price: 1 } } }, "10.1.0.2");
  check("a second answer is refused, saying why", r.status === 409 && /can't take prices any more/.test(r.body?.error ?? "") && S1.prices.a1.price === 8.95, JSON.stringify(r));

  // Can't quote.
  await open(token("b"));
  await press("We can't quote for this");
  await sleep(200);
  await typeInto("#qr-decline-note", "Out of stock until March.");
  await press("Yes, we can't quote");
  await page.waitForFunction(() => document.body.innerText.includes("You said you can't quote for this."), { timeout: 30000 }).catch(() => {});
  p = { text: await page.evaluate(() => document.body.innerText) };
  check("can't quote is one more tap, and says the sender has been told", p.text.includes("You said you can't quote for this. Harness Plastering Ltd has been told."), p.text.slice(0, 300));
  check("...stored as declined, no prices, their reason kept", S2.status === "declined" && JSON.stringify(S2.prices) === "{}" && S2.note === "Out of stock until March.", JSON.stringify(S2));

  // The other states.
  p = await open(token("c"));
  check("an answer they sent earlier is shown back to them", /You sent these prices on/.test(p.text) && /9\.10|273\.00/.test(p.text), p.text.slice(0, 400));
  p = await open(token("d"));
  check("prices the sender typed in for them show only as received", p.text.includes("Harness Plastering Ltd already has your prices for this.") && !/8\.50|255\.00/.test(p.text), p.text.slice(0, 400));
  p = await open(token("e"));
  check("a closed request says so, and still lists what was asked", p.text.includes("This request is closed: Harness Plastering Ltd isn't taking prices for it any more.") && p.text.includes("Plasterboard 12.5mm"), p.text.slice(0, 400));
  p = await open(token("f"));
  check("one past its date says so and who to contact", /This was needed by .+, so the request has closed\. Contact Harness Plastering Ltd/.test(p.text), p.text.slice(0, 400));
  p = await open(token("g"), "#o");
  check("the sender's own copy shows no form", p.text.includes("This is your copy of the link.") && !(await page.$("#pf-delivery")), p.text.slice(0, 400));
  p = await open(token("g"));
  check("...the supplier opening the same link gets it", !!(await page.$("#pf-delivery")));

  // Links that aren't.
  // Next streams these pages, so a link that isn't there is a page saying
  // so, kept out of search engines like every /r/ page, not a 404 status.
  const gone = async () => ({ text: await page.evaluate(() => document.body.innerText), robots: await page.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? "") });
  await open(token("z"));
  let g = await gone();
  check("an unknown link says it isn't working, with no form, unindexed", g.text.includes("This link isn't working") && !(await page.$("#pf-delivery")) && /noindex/.test(g.robots), g.text.slice(0, 200));
  await open("short");
  g = await gone();
  check("a malformed one too", g.text.includes("This link isn't working") && /noindex/.test(g.robots), g.text.slice(0, 200));

  // The answer route on its own.
  r = await respond({ token: "short", prices: {} }, "10.1.0.3");
  check("a malformed token is refused", r.status === 400, JSON.stringify(r));
  r = await respond({ token: token("g"), prices: { a1: { price: -5 } } }, "10.1.0.3");
  check("a negative price is refused in words", r.status === 400 && /couldn't be read/.test(r.body?.error ?? ""), JSON.stringify(r));
  r = await respond({ token: token("g"), prices: { a1: { price: 5 } }, validUntil: day(-3) }, "10.1.0.3");
  check("a valid-until date in the past is refused", r.status === 400 && /in the past/.test(r.body?.error ?? ""), JSON.stringify(r));
  r = await respond({ token: token("g"), prices: { a1: { price: 5 }, zz: { price: 99 } } }, "10.1.0.3");
  const G = db.tables.quote_request_suppliers.find((x) => x.token === token("g"));
  check("prices for lines that aren't on the request are dropped", r.status === 200 && r.body?.status === "replied" && G.prices.a1?.price === 5 && !("zz" in G.prices), JSON.stringify({ r, prices: G.prices }));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser?.close();
  app.kill();
  mock.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
  process.exit(0);
}
