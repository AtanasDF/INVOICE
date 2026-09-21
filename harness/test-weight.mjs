// What a page costs to open, in bytes the browser actually downloads.
//
// Next 16's build no longer prints a size table, so this measures the
// real thing: a cold load, fresh profile, every JavaScript response
// summed. The Free invoice page is the one strangers land on with no
// account, so it carries the tightest budget. And OpenCV -- 13MB, kept
// out of the bundle on purpose (CLAUDE.md) -- must only ever be fetched
// when a scanner actually opens, never on a page that merely could scan.
import { makeDb, launchSignedIn, signIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-weight" });

// Bytes of JavaScript per load, and whether OpenCV was among them.
let js = 0, opencv = 0, requests = [];
page.on("response", async (res) => {
  const u = res.url();
  const type = res.headers()["content-type"] ?? "";
  if (!/javascript/.test(type) && !/\.js(\?|$)/.test(u)) return;
  let len = Number(res.headers()["content-length"] ?? 0);
  if (!len) { try { len = (await res.buffer()).length; } catch { len = 0; } }
  js += len;
  requests.push({ u: u.replace(BASE, ""), kb: Math.round(len / 1024) });
  if (/opencv/.test(u)) opencv += len;
});
const reset = () => { js = 0; opencv = 0; requests = []; };
const KB = (n) => `${Math.round(n / 1024)} KB`;

const load = async (path) => {
  reset();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await sleep(800);
  return { js, opencv, top: [...requests].sort((a, b) => b.kb - a.kb).slice(0, 4) };
};

try {
  // Signed out first: the pages a stranger gets.
  const free = await load("/free-invoice");
  check("the Free invoice page is under 1.5MB of JavaScript for a stranger", free.js < 1.5 * 1024 * 1024, `${KB(free.js)} ${JSON.stringify(free.top)}`);
  check("...and does not fetch OpenCV just to show the page", free.opencv === 0, KB(free.opencv));

  const check_company = await load("/check-company");
  check("Check a company is under 1.2MB of JavaScript", check_company.js < 1.2 * 1024 * 1024, `${KB(check_company.js)} ${JSON.stringify(check_company.top)}`);

  await signIn(page, BASE);
  // The dashboard warms the scanner up on purpose (page.tsx: fetching the
  // OpenCV script on idle puts it in the HTTP cache and initialises the
  // runtime before Scan is tapped). That is 13MB, once per device, and
  // the decision only holds if it really is once -- so the bundle is
  // budgeted without it, and a second load must fetch none of it.
  const dash = await load("/");
  check("the dashboard's own JavaScript is under 1.5MB", dash.js - dash.opencv < 1.5 * 1024 * 1024, `${KB(dash.js - dash.opencv)} ${JSON.stringify(dash.top)}`);
  check("...and the OpenCV it warms up is the immutable vendor copy, not bundled", dash.opencv > 1024 * 1024 && requests.some((r) => /\/vendor\/opencv/.test(r.u)), KB(dash.opencv));
  // "Once" can't be shown on these pages: request interception -- which
  // the mock needs -- makes Chrome bypass its HTTP cache. So the property
  // is proven where it lives: the header on the file, and a plain tab
  // fetching it twice with the second answered from cache.
  const plain = await browser.newPage();
  const seen = [];
  plain.on("response", (res) => { if (/\/vendor\/opencv/.test(res.url())) seen.push({ fromCache: res.fromCache(), cacheControl: res.headers()["cache-control"] ?? "" }); });
  await plain.goto(`${BASE}/vendor/opencv-5.0.0.js`, { waitUntil: "load" }).catch(() => {});
  await plain.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await plain.evaluate((base) => new Promise((r) => { const s = document.createElement("script"); s.src = base + "/vendor/opencv-5.0.0.js"; s.onload = r; s.onerror = r; document.head.appendChild(s); }), BASE).catch(() => {});
  await sleep(800);
  await plain.close();
  check("...it carries a one-year immutable cache header", seen.length > 0 && /immutable/.test(seen[0].cacheControl) && /max-age=31536000/.test(seen[0].cacheControl), JSON.stringify(seen));
  check("...and Chrome serves it from cache the second time, so it really is once per device", seen.length >= 2 && seen[seen.length - 1].fromCache === true, JSON.stringify(seen));

  // /scan is the one place the scanner opens on arrival, so OpenCV is
  // expected here -- and nowhere else.
  const scan = await load("/scan");
  check("/scan's own JavaScript, without OpenCV, is under 1.6MB", scan.js - scan.opencv < 1.6 * 1024 * 1024, KB(scan.js - scan.opencv));
  console.log(JSON.stringify({ free: KB(free.js), checkCompany: KB(check_company.js), dashboard: KB(dash.js - dash.opencv), warmUpOnce: KB(dash.opencv), scan: KB(scan.js) }));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
