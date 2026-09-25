// Can a cold, gloved hand hit it?
//
// Three standards disagree and it is worth being exact about which is which:
//
//   WCAG 2.5.8 (AA)  24 x 24 CSS px  -- normative. A FAILURE.
//   Apple            44 x 44 pt      -- the HIG's DEFAULT (its stated minimum
//                                      for iOS is 28). Guidance.
//   Android          48 x 48 dp      -- guidance, and the stricter of the two.
//
// So the 24px floor is a failure and the 44px figure is a report. The split is
// deliberate: for a plasterer with cold hands in a depot the platform numbers
// are the ones that matter, but only one of them is a rule.
//
// 2.5.8's spacing exception is implemented here rather than ignored, or this
// would report false failures: an undersized target passes if a 24px circle
// centred on it does not touch another target's circle.
import { makeDb, launchSignedIn, signIn, sleep, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 4 });
db.tables.clients.push({ id: "c1", user_id: UID, name: "Hetherington", kind: "client", archived: false });
db.tables.invoices.push({ id: "i1", user_id: UID, client_id: "c1", number: "INV-003", date: day(-6), due_date: day(8), status: "sent", items: [{ description: "Labour", quantity: 1, unitPrice: 500, vatRate: 0 }] });
db.tables.receipts.push({ id: "r1", user_id: UID, client_id: "", vendor: "Travis Perkins", date: day(-1), amount: 90, vat_amount: 18, document_type: "receipt", paid: true, details: {} });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-tap-targets" });

const measure = () => page.evaluate(() => {
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=checkbox],[role=switch],[role=tab],[role=radio],[role=option]';
  // An input hidden with sr-only inside a <label> is the standard way to
  // make a file picker look like a button: the INPUT is a clipped 1x1 box on
  // purpose and the LABEL is what anybody actually taps. Exempt only when
  // that label is itself big enough, so this cannot become a way to hide a
  // small target.
  const wrappedBySomethingBigger = (e) => {
    if (!e.classList.contains("sr-only")) return false;
    const label = e.closest("label");
    if (!label) return false;
    const r = label.getBoundingClientRect();
    return r.width >= 24 && r.height >= 24;
  };
  const boxes = [...document.querySelectorAll(SEL)].filter((e) => {
    if (e.disabled || e.closest("[inert]")) return false;
    if (wrappedBySomethingBigger(e)) return false;
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  }).map((e) => ({ e, r: e.getBoundingClientRect() }));

  // The Inline exception: a link sitting inside a run of text.
  const inline = (e) => {
    const p = e.parentElement;
    if (!p) return false;
    return getComputedStyle(e).display.startsWith("inline")
      && p.textContent.replace(e.textContent || "", "").trim().length > 0;
  };
  const name = (e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24) || e.tagName;

  const tooSmall = [], belowPlatform = [];
  for (const { e, r } of boxes) {
    if (r.width < 44 || r.height < 44) belowPlatform.push({ n: name(e), w: Math.round(r.width), h: Math.round(r.height) });
    if (r.width >= 24 && r.height >= 24) continue;
    if (inline(e)) continue;
    // The Spacing exception, in full: a 24px circle on this target must not
    // meet another target's circle (or box, when that one is big enough).
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    let crowded = false;
    for (const o of boxes) {
      if (o.e === e || e.contains(o.e) || o.e.contains(e)) continue;
      const q = o.r, ocx = q.x + q.width / 2, ocy = q.y + q.height / 2;
      const hit = (q.width < 24 || q.height < 24)
        ? Math.hypot(cx - ocx, cy - ocy) < 24
        : Math.hypot(Math.max(q.left - cx, 0, cx - q.right), Math.max(q.top - cy, 0, cy - q.bottom)) < 12;
      if (hit) { crowded = true; break; }
    }
    if (crowded) tooSmall.push({ n: name(e), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return { tooSmall, belowPlatform: belowPlatform.slice(0, 8), total: boxes.length };
});

const PAGES = [["the dashboard", "/"], ["scanning", "/scan"], ["a new invoice", "/invoices/new"], ["receipts", "/receipts"], ["settings", "/settings"], ["the file library", "/files"]];

try {
  await signIn(page, BASE);
  for (const [name, path] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await sleep(1800);
    const m = await measure();
    check(`${name}: nothing is too small to hit`, m.tooSmall.length === 0, JSON.stringify(m.tooSmall));
    // A report, not a failure: the platform numbers are guidance.
    if (m.belowPlatform.length) console.log(`     (${name}: ${m.belowPlatform.length} under 44px — ${JSON.stringify(m.belowPlatform.slice(0, 3))})`);
  }
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
