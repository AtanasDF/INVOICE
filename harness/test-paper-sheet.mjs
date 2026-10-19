// A document is paper whatever the lights are doing.
//
// notes/audit-components.md, worst finding 1: the sheet the PDF is
// photographed from said `bg-white text-neutral-900`, which in dark mode is
// #191b1f with pale writing. html-to-image copies computed styles, so a phone
// in dark mode emailed its customer a black invoice with pale words, and a
// signature drawn in near-black ink vanished into it. The fill colour passed to
// html-to-image only paints transparent pixels, so it never helped.
//
// So: in dark mode, every sheet that becomes a file or is shown to a customer
// must compute to white paper and dark ink, every word on it must be dark
// enough to read on white, and printing from a dark phone must not leave
// "Paid" in the pale green dark mode uses.
import { makeDb, launchSignedIn, sleep, newId, todayISO, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const INV = newId();
db.tables.invoices.push({ id: INV, user_id: "x", client_id: C, date: todayISO(), number: "INV-9", items: [{ description: "Skim two ceilings", quantity: 1, unitPrice: 400, vatRate: "standard" }], notes: "", due_date: todayISO(), payment_terms: "", status: "paid", tags: [], vat_registered: true, cis_rate: null });
db.tables.invoice_payments.push({ id: newId(), user_id: "x", invoice_id: INV, date: todayISO(), amount: 480, method: null, note: "" });

// Tailwind v4 hands back oklch()/lab(), so each colour is painted on a canvas
// and read back as RGB.
const SHEET_READ = `(() => {
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true });
  const rgb = (css) => { g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
  return [...document.querySelectorAll(".paper-sheet")].map((s) => {
    const cs = getComputedStyle(s);
    const bg = rgb(cs.backgroundColor);
    // Every element holding words of its own, against white paper.
    const pale = [...s.querySelectorAll("*")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((el) => ({ t: el.textContent.trim().slice(0, 30), ratio: 1.05 / (lum(rgb(getComputedStyle(el).color)) + 0.05) }))
      .filter((x) => x.ratio < 4.5);
    return { bg, ink: lum(rgb(cs.color)), words: s.innerText.length, pale };
  });
})()`;

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-paper-sheet" });
try {
  await page.evaluate(() => { localStorage.setItem("theme", "dark"); });
  await page.goto(`${BASE}/invoices/${INV}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  check("the app really is dark on this page", await page.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"));
  let sheets = await page.evaluate(SHEET_READ);
  const send = sheets.find((s) => s.words > 20);
  check("the invoice page has the sheet the PDF is made from", !!send, JSON.stringify(sheets));
  if (send) {
    check("...and in dark mode it is white paper", send.bg[0] === 255 && send.bg[1] === 255 && send.bg[2] === 255 && send.bg[3] === 255, JSON.stringify(send.bg));
    check("...with dark ink", send.ink < 0.1, String(send.ink));
    check("...and every word on it readable on white, Paid included", send.pale.length === 0, JSON.stringify(send.pale.slice(0, 5)));
  }

  // Printed from a dark phone: the in-app card is put back to ink by the
  // print rule, and the green Paid with it.
  await page.emulateMediaType("print");
  const printed = await page.evaluate(`(() => {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const g = c.getContext("2d");
    const rgb = (css) => { g.clearRect(0, 0, 1, 1); g.fillStyle = css; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    return [...document.querySelectorAll(".text-green-700")].map((el) => rgb(getComputedStyle(el).color));
  })()`);
  check("printed from dark mode, green text is the dark green, not the pale one", printed.length > 0 && printed.every(([r, g, b]) => r < 60 && g < 140 && b < 90), JSON.stringify(printed));
  await page.emulateMediaType("screen");

  // The Free page: the on-screen preview (where a signature is drawn and
  // checked) and the hidden Save-as sheet.
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await sleep(800);
  await clickText(page, "Type it in").catch(() => {});
  await sleep(800);
  sheets = await page.evaluate(SHEET_READ);
  check("the Free page shows its invoice on a sheet", sheets.length > 0, JSON.stringify(sheets));
  check("...white in dark mode", sheets.length > 0 && sheets.every((s) => s.bg[0] === 255 && s.bg[1] === 255 && s.bg[2] === 255), JSON.stringify(sheets.map((s) => s.bg)));
  check("...with every word readable on white", sheets.every((s) => s.pale.length === 0), JSON.stringify(sheets.flatMap((s) => s.pale).slice(0, 5)));

  // And the rest of the app is still dark: only the paper changed.
  const card = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const g = c.getContext("2d");
    g.fillStyle = getComputedStyle(document.body).backgroundColor; g.fillRect(0, 0, 1, 1);
    return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
  });
  check("the page around the sheet stays dark", card.every((v) => v < 60), JSON.stringify(card));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
await browser.close();
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
