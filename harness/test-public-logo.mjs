// The logo on the customer's own pages (/i/ and /q/), read on the server
// with the service role: its own dev server against the stand-in database,
// the logo in stand-in storage. The service role can read any account's
// files, so a profile pointing into someone else's folder, or climbing out
// of its own with "..", must show no logo and fetch nothing at all.
import fs from "node:fs";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, newId, UID } from "./mockdb.mjs";
import { REPO } from "./repo.mjs";

const WEB = `${REPO}/web`;
const HERE = new URL(".", import.meta.url).pathname;
const PORT = 3312;
const MOCK = 3560;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const PNG = fs.readFileSync(HERE + "uploads/card.png");
const db = makeDb();
db.files = { [`${UID}/logo/mine.png`]: { type: "image/png", bytes: PNG } };
Object.assign(db.tables, { invoice_links: [], quote_links: [], credit_notes: [], invoice_payments: [], quotes: [] });
const token = (c) => c.repeat(43);
// One account per case: whose folder the logo is in decides whether it shows.
const cases = [
  { key: "own", uid: UID, logo: `storage:${UID}/logo/mine.png` },
  { key: "someone else's", uid: "00000000-0000-4000-8000-000000000002", logo: `storage:${UID}/logo/mine.png` },
  { key: "climbing out", uid: "00000000-0000-4000-8000-000000000003", logo: `storage:00000000-0000-4000-8000-000000000003/logo/../../${UID}/logo/mine.png` },
  { key: "missing file", uid: "00000000-0000-4000-8000-000000000004", logo: "storage:00000000-0000-4000-8000-000000000004/logo/gone.png" },
  { key: "none", uid: "00000000-0000-4000-8000-000000000005", logo: null },
];
cases.forEach((c, i) => {
  const client = newId(), inv = newId(), quote = newId();
  c.inv = token("abcde"[i]);
  c.quote = token("vwxyz"[i]);
  db.tables.business_profile.push({ user_id: c.uid, business_name: `Trader ${i + 1} Ltd`, address: "1 Test St\nLeeds", vat_registered: false, bank_details: "Sort code: 00-00-00", logo_url: c.logo });
  db.tables.clients.push({ id: client, user_id: c.uid, name: "Jane Customer", email: "jane@example.com", address: "2 Road", kind: "client", archived: false, is_company: false });
  db.tables.invoices.push({ id: inv, user_id: c.uid, client_id: client, date: "2026-09-10", number: `INV-${i + 1}`, items: [{ description: "Skim coat", quantity: 1, unitPrice: 450, vatRate: "zero" }], notes: "", due_date: "2026-10-10", payment_terms: "30 days", status: "sent", vat_registered: false, cis_rate: null });
  db.tables.quotes.push({ id: quote, user_id: c.uid, client_id: client, number: `Q-${i + 1}`, date: "2026-09-10", valid_until: "2099-12-31", items: [{ description: "Skim ceiling", quantity: 1, unitPrice: 300, vatRate: "zero" }], notes: "", status: "sent", deposit_percent: null, deposit_amount: null, vat_registered: false });
  db.tables.invoice_links.push({ token: c.inv, invoice_id: inv, user_id: c.uid });
  db.tables.quote_links.push({ token: c.quote, quote_id: quote, user_id: c.uid, response: null, responded_at: null, responder_name: null });
});

const { server: mock } = startMockServer(MOCK, db);
const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key" },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
try {
  for (let i = 0; i < 240; i++) {
    const r = await fetch(`${base}/i/${cases[4].inv}`, { signal: AbortSignal.timeout(120000) }).catch(() => null);
    if (r && r.status === 200) { await r.text(); break; }
    await sleep(1000);
  }
  browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  const tab = await browser.newPage();
  await tab.setViewport({ width: 375, height: 900 });
  // The sheet is drawn in the browser from the page's data, so it is looked
  // for there: the server's HTML never holds it, logo or not.
  const look = async (path, heading, name) => {
    await tab.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 120000 });
    await tab.waitForFunction((h) => document.body.innerText.includes(h), { timeout: 30000 }, heading).catch(() => {});
    return tab.evaluate((h, n) => {
      const img = [...document.querySelectorAll("img")].find((i) => i.src.startsWith("data:image/"));
      const biz = [...document.querySelectorAll("p")].find((p) => p.textContent === n);
      return {
        opened: document.body.innerText.includes(h),
        logo: !!img,
        drawn: !!img && img.complete && img.naturalWidth > 0,
        above: !!img && !!biz && img.getBoundingClientRect().bottom <= biz.getBoundingClientRect().top + 1,
        height: img ? img.getBoundingClientRect().height : 0,
        fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    }, heading, name);
  };
  for (const [i, c] of cases.entries()) {
    const want = c.key === "own";
    for (const [path, heading] of [[`/i/${c.inv}`, `Invoice INV-${i + 1}`], [`/q/${c.quote}`, `Quote Q-${i + 1}`]]) {
      const got = await look(path, heading, `Trader ${i + 1} Ltd`);
      const what = path.startsWith("/i/") ? "invoice" : "quote";
      check(`${c.key}: the ${what} page opens`, got.opened, JSON.stringify(got));
      check(`${c.key}: the ${what} ${want ? "shows the" : "has no"} logo`, got.logo === want, JSON.stringify(got));
      if (want) {
        check(`${c.key}: the ${what}'s logo is drawn`, got.drawn);
        check(`${c.key}: it sits above the business name, no taller than a letterhead`, got.above && got.height > 0 && got.height <= 64, JSON.stringify(got));
        check(`${c.key}: the ${what} page still fits 375px`, got.fits);
      }
    }
  }
  const reads = [...new Set(db.log.filter((l) => l.key.startsWith("STORAGE GET")).map((l) => l.key))];
  check("storage was read only for the owner's own folder and the missing file", JSON.stringify(reads.sort()) === JSON.stringify([`STORAGE GET 00000000-0000-4000-8000-000000000004/logo/gone.png`, `STORAGE GET ${UID}/logo/mine.png`].sort()), JSON.stringify(reads));
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
