// Nothing should scroll sideways (radoslav0922@gmail.com, 2026-09-22, the
// first feedback from someone outside: "when you're in the desktop version and
// you hold onto the screen you should be moving this up and down, not left and
// right").
//
// A page wider than the window is why: the browser then offers a horizontal
// scroll, and a trackpad or a held finger drags the whole page about. Every
// other suite here checks 320 and 375, because the phone is what we worried
// about -- nobody had ever measured a desktop window, which is exactly where
// he found it.
//
// So this walks the real pages at three widths and reports not just THAT a
// page is too wide but WHICH element sticks out, since that is the only part
// that saves any time.
import { makeDb, launchSignedIn, signIn, sleep, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const WIDTHS = [
  [1440, "a wide desktop window"],
  [1024, "a small laptop"],
  [375, "a phone"],
];

const PAGES = [
  ["/", "the dashboard"],
  ["/invoices", "invoices"],
  ["/invoices/new", "a new invoice"],
  ["/receipts", "receipts"],
  ["/clients", "customers"],
  ["/quotes", "quotes"],
  ["/expenses", "expenses"],
  ["/vat", "VAT"],
  ["/settings", "settings"],
  ["/files", "the file library"],
  ["/check-company", "check a company"],
  ["/convert", "change a file"],
  ["/copy", "copy a document"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
];

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 43 });
db.tables.clients.push({ id: "c1", user_id: UID, name: "A Customer With A Rather Long Trading Name Ltd", kind: "client", archived: false });
db.tables.invoices.push({ id: "i1", user_id: UID, client_id: "c1", number: "INV-041", date: day(-9), due_date: day(21), status: "sent", items: [{ description: "Labour on a job with a long description that could push a table wide", quantity: 1, unitPrice: 800, vatRate: 20 }] });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 1440, profile: "profile-sideways" });

// What actually sticks out, rather than just how far.
const OVERFLOW = `(() => {
  const w = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= w + 1) return null;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= w + 1 && r.left >= -1) continue;
    const st = getComputedStyle(el);
    if (st.position === "fixed" || st.visibility === "hidden" || st.display === "none") continue;
    // Only the outermost offender is worth naming: its children stick out
    // because it does.
    if (out.some((o) => o.el.contains(el))) continue;
    out.push({ el, tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 70), right: Math.round(r.right), left: Math.round(r.left), text: (el.textContent || "").trim().slice(0, 40) });
  }
  return { window: w, page: document.documentElement.scrollWidth, worst: out.slice(0, 3).map(({ el, ...rest }) => rest) };
})()`;

try {
  await signIn(page, BASE);

  for (const [width, what] of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    const bad = [];
    for (const [path, name] of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
      await sleep(650);
      const over = await page.evaluate(OVERFLOW);
      if (over) bad.push({ page: name, path, ...over });
    }
    check(`nothing scrolls sideways on ${what} (${width}px)`, bad.length === 0, JSON.stringify(bad, null, 1).slice(0, 900));
  }

  // The window being dragged narrower must not strand the page either: this is
  // what someone half-tiling a browser does, and it is where the phone layout
  // and the desktop one meet.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  const awkward = [];
  for (const w of [1280, 1180, 1024, 900, 820, 768, 700, 640, 560, 480, 414, 390, 360, 320]) {
    await page.setViewport({ width: w, height: 900 });
    await sleep(320);
    const over = await page.evaluate(OVERFLOW);
    if (over) awkward.push({ width: w, ...over });
  }
  check("the dashboard survives every width between a desktop and a small phone", awkward.length === 0, JSON.stringify(awkward, null, 1).slice(0, 700));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
