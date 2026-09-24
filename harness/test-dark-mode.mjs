// NOT light-only any more. This said "the app is light-only by design" until
// 2026-09-24, which stopped being true on 2026-09-23 when dark mode landed --
// a comment that says the opposite of the truth is worse than none, because
// the next person believes it.
//
// What this suite is still for is the case dark mode does not cover: a phone
// in dark mode visiting a page rendered LIGHT. iOS tells the page, and Safari
// restyles form controls by itself -- which is how you end up with white text
// in a white box. So these checks are about staying readable when the system
// is dark and the app is not, which is exactly what happens on any theme other
// than Dark. `test-readable` covers the six themes' own contrast.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.invoices.push({ id: newId(), user_id: "x", client_id: C, date: todayISO(), number: "INV-9", items: [{ description: "Work", quantity: 1, unitPrice: 1000, vatRate: "standard" }], notes: "", due_date: todayISO(), payment_terms: "", status: "sent", tags: [], vat_registered: true, cis_rate: null });
// The faint lines the contrast floor is for: an exchange-rate note, a warranty line, a paused item.
db.tables.receipts.push({ id: newId(), user_id: "x", client_id: null, date: todayISO(), vendor: "Bauhaus Berlin", category: "Supplies", amount: 84.2, vat_amount: 14.03, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: 24, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: 100, original_vat_amount: 16.67, original_currency: "EUR", fx_rate: 0.842 });
db.tables.recurring_expenses.push({ id: newId(), user_id: "x", description: "Old phone contract", category: "Other", amount: 20, vat_amount: 4, supplier_id: null, day_of_month: 5, next_due_date: todayISO(), active: false });

// Relative luminance and contrast, the WCAG way.
// Tailwind v4 hands back lab()/oklch() colours, which can't be read as
// three numbers -- painting each one on a canvas and reading the pixel
// back is the only way to get true RGB out of any CSS colour.
const CONTRAST = `(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const rgb = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const backdrop = (el) => {
    let n = el;
    while (n) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c[3] > 0.5) return c;
      n = n.parentElement;
    }
    return [255, 255, 255, 1];
  };
  return [...document.querySelectorAll("input, textarea, select, button, a, p, span, h1, h2, td, th, label, li")]
    .filter((el) => el.offsetParent !== null && (el.textContent || "").trim().length > 0 && el.children.length === 0)
    .map((el) => {
      const cs = getComputedStyle(el);
      const l1 = lum(rgb(cs.color));
      const l2 = lum(backdrop(el));
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      return { ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, tag: el.tagName, size, text: (el.textContent || "").trim().slice(0, 30), color: cs.color };
    })
    .filter((x) => x.ratio < x.need);
})()`;

const PAGES = [["/", "Dashboard"], ["/invoices", "Invoices"], ["/receipts", "Receipts"], ["/receipts/new", "New receipt"], ["/recurring", "Recurring"], ["/settings", "Settings"], ["/free-invoice", "Free invoice"], ["/login", "Sign in"]];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-dark" });
try {
  await signIn(page, BASE);
  const client = await page.createCDPSession();

  for (const scheme of ["light", "dark"]) {
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    for (const [path, name] of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
      await sleep(900);
      const t = await bodyText(page);
      check(`${scheme}: ${name} still opens`, t.length > 40 && !t.includes("Application error"), t.slice(0, 150));
      const bad = await page.evaluate(CONTRAST);
      const worst = bad.sort((a, b) => a.ratio - b.ratio).slice(0, 3);
      check(`${scheme}: ${name} text stays readable`, bad.length === 0, `${bad.length} too faint, worst: ${JSON.stringify(worst)}`);
      // The thing Safari really does in dark mode: recolour form controls.
      const fields = await page.evaluate(() =>
        [...document.querySelectorAll("input, textarea, select")]
          .filter((el) => el.offsetParent !== null && !["hidden", "checkbox", "radio", "file"].includes(el.type))
          .map((el) => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor, ph: el.placeholder ?? "" }))
      );
      const invisible = fields.filter((f) => f.color === f.bg);
      check(`${scheme}: ${name} has no invisible boxes to type in`, invisible.length === 0, JSON.stringify(invisible.slice(0, 3)));
    }
  }
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
