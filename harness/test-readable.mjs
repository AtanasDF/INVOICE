// Can people actually read it, in every colour (item 27).
//
// Tonight's theme work changed what `neutral-*` means across 1,300-odd classes
// at once, which is exactly the kind of change that quietly makes grey text on
// a grey card unreadable in one theme and nobody notices for a month. So the
// contrast is measured, in every theme, on the pages a stranger and a new
// account actually meet.
//
// WCAG AA: 4.5:1 for ordinary text, 3:1 for large text (18.66px bold, or 24px).
import { makeDb, launchSignedIn, signIn, sleep, newId, day, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// Six, not five. Dark landed on 2026-09-23 and was never contrast-tested --
// and it is the one where a mistake is likeliest, because the whole scale is
// inverted and "bg-neutral-900 text-white" becomes dark writing on a light
// button.
const THEMES = ["grey", "slate", "sand", "forest", "ink", "dark"];

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
// One late invoice and one late bill, so the money screen has its red and
// amber badges to measure. Without them it renders empty and the check
// would pass on a page with no colour on it at all.
const C = newId();
db.tables.clients.push({ id: C, user_id: UID, name: "Acme Kitchens Ltd", email: "a@b.c", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
db.tables.invoices.push({ id: newId(), user_id: UID, client_id: C, date: day(-40), number: "INV-000001", items: [{ description: "Work", quantity: 1, unitPrice: 800, vatRate: "standard" }], notes: "", due_date: day(-12), payment_terms: "", status: "sent", tags: [], vat_registered: false, cis_rate: null });
db.tables.invoices.push({ id: newId(), user_id: UID, client_id: C, date: day(-5), number: "INV-000002", items: [{ description: "Work", quantity: 1, unitPrice: 300, vatRate: "standard" }], notes: "", due_date: day(3), payment_terms: "", status: "sent", tags: [], vat_registered: false, cis_rate: null });
db.tables.receipts.push({ id: newId(), user_id: UID, client_id: null, date: day(-20), vendor: "Jewson", category: "Supplies", amount: 200, vat_amount: 40, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "invoice", invoice_number: "J-1", due_date: day(-4), paid: false, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-readable" });

// Measured in the browser, on what is actually painted -- the only honest way,
// since a colour can come from anywhere up the tree.
const CONTRAST = `(() => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // Any CSS colour, not just rgb(). Tailwind v4 serialises as lab(), and
  // this returned null for those -- so every amber, red, green and blue in
  // the app was SKIPPED rather than measured, and this suite reported green
  // while never looking at the overdue banner, the paid badge or the
  // needs-review pill. Found on 2026-09-25 by a suite that measured them.
  const __c = document.createElement("canvas");
  __c.width = 1; __c.height = 1;
  const __x = __c.getContext("2d", { willReadFrequently: true });
  const parse = (s) => {
    if (!s || /transparent/.test(s)) return null;
    const m = s.match(/rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number); return p[3] === 0 ? null : [p[0], p[1], p[2]]; }
    __x.clearRect(0, 0, 1, 1);
    __x.fillStyle = "#000";
    const before = __x.fillStyle;
    __x.fillStyle = s;
    if (__x.fillStyle === before && s !== "#000000" && s !== "black") return null;
    __x.fillRect(0, 0, 1, 1);
    const d = __x.getImageData(0, 0, 1, 1).data;
    return d[3] === 0 ? null : [d[0], d[1], d[2]];
  };
  const behind = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c) return c;
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bad = [];
  for (const el of document.querySelectorAll("main *, footer *, header *")) {
    if (el.children.length && [...el.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim())) continue;
    const text = (el.textContent || "").trim();
    if (!text) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || parseFloat(st.opacity) < 0.5) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(st.color);
    if (!fg) continue;
    const size = parseFloat(st.fontSize);
    const weight = parseInt(st.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, behind(el));
    if (got < need) bad.push({ text: text.slice(0, 40), size, got: Math.round(got * 100) / 100, need });
  }

  // Inputs, separately, because the loop above cannot see them: it skips
  // anything whose textContent is empty, and what somebody typed lives in the
  // value property, never in textContent. So EVERY input in the app had gone
  // unmeasured -- and a date input was sitting at 1.1:1 in dark mode, the
  // theme's light ink on a hard-coded white box, while this suite reported
  // green. Found by looking at a recorded dark walkthrough frame, not by any
  // check. (No backticks in here: this whole block is a template literal.)
  for (const el of document.querySelectorAll("main input, main textarea, main select")) {
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") continue;
    if (el.type === "checkbox" || el.type === "radio" || el.type === "hidden") continue;
    // WCAG 1.4.3 exempts an inactive control by name: "text that is part of an
    // inactive user interface component ... has no contrast requirement". A
    // disabled box is MEANT to recede, and the app says so deliberately with
    // disabled:text-neutral-400. Counting it was a fault in this check, not in
    // the app -- it fired on Settings' VAT number box in all six themes, which
    // is disabled until the VAT switch is on.
    if (el.disabled || el.closest("fieldset[disabled]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(st.color);
    if (!fg) continue;
    // behind() walks ancestors for the first opaque backdrop; an input paints
    // its own, so prefer that when it is not transparent.
    const own = st.backgroundColor;
    const transparent = /rgba\([^)]*,\s*0\s*\)/.test(own) || own === "transparent";
    const bg = transparent ? behind(el) : (parse(own) || behind(el));
    const got = ratio(fg, bg);
    const name = "[" + el.tagName.toLowerCase() + (el.type ? " " + el.type : "") + "] " + (el.getAttribute("aria-label") || el.id || "");
    if (got < 4.5) bad.push({ text: name.slice(0, 40), size: parseFloat(st.fontSize), got: Math.round(got * 100) / 100, need: 4.5 });
  }
  return bad;
})()`;

const setTheme = async (t) => {
  await page.evaluate((id) => {
    if (id === "grey") { localStorage.removeItem("theme"); document.documentElement.removeAttribute("data-theme"); }
    else { localStorage.setItem("theme", id); document.documentElement.setAttribute("data-theme", id); }
  }, t);
  // Longer than the app's own colour transition, which is 160ms
  // (background-color 160ms ease, globals.css). 250ms left 90ms of headroom,
  // and on a loaded machine that is not enough: a colour read mid-transition is
  // a wrong colour, and the sweep failed once on /settings in grey with "Save"
  // at 1.1:1 and "Dark" at 1.05:1 -- values that have not reappeared in three
  // runs since. That is the most plausible cause and this removes it; if it
  // ever comes back, the transition is the first place to look.
  await sleep(450);
};

try {
  // --- the front door, in every colour ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(700);
  for (const t of THEMES) {
    await setTheme(t);
    const bad = await page.evaluate(CONTRAST);
    check(`the front door is readable in ${t}`, bad.length === 0, JSON.stringify(bad.slice(0, 4)));
  }

  // --- the form itself ---
  const form = await page.evaluate(() => {
    const labelled = [...document.querySelectorAll("main input")].every((i) => {
      if (i.type === "hidden") return true;
      return !!(i.labels?.length || i.getAttribute("aria-label") || i.getAttribute("aria-labelledby"));
    });
    const tabbable = [...document.querySelectorAll('main a, main button, main input, main [role="tab"]')].filter((e) => e.tabIndex >= 0).length;
    const tinyTaps = [...document.querySelectorAll("main button, main a")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 24;
    }).map((e) => e.textContent.trim().slice(0, 20));
    return { labelled, tabbable, tinyTaps };
  });
  check("every box on the front door has a label", form.labelled);
  check("everything on it can be reached from a keyboard", form.tabbable >= 6, String(form.tabbable));
  check("nothing on it is too small to tap", form.tinyTaps.length === 0, JSON.stringify(form.tinyTaps));

  // Focus has to be visible, or a keyboard is useless.
  const focusRing = await page.evaluate(() => {
    const el = document.querySelector("main input");
    el.focus();
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  });
  check("the box you are typing in shows it", focusRing.outline !== "none" || focusRing.shadow !== "none", JSON.stringify(focusRing));

  // --- the dashboard, which is where the colour lives ---
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1100);
  for (const t of THEMES) {
    await setTheme(t);
    const bad = await page.evaluate(CONTRAST);
    check(`the dashboard is readable in ${t}`, bad.length === 0, JSON.stringify(bad.slice(0, 4)));
  }

  // --- the money screen, which is where the RED and AMBER live ---
  // A "30 days late" badge is red on a red-tinted background, and a coloured
  // pair that holds up on white is exactly the kind that fails once the
  // scale inverts. The dashboard has no such badges, so this was untested.
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Owed to you"), { timeout: 20000 }).catch(() => {});
  await sleep(700);
  for (const t of THEMES) {
    await setTheme(t);
    const bad = await page.evaluate(CONTRAST);
    check(`the money screen is readable in ${t}`, bad.length === 0, JSON.stringify(bad.slice(0, 4)));
  }
  // --- a form with dates in it, which is where the INPUTS live ---
  // The pages above carry almost no inputs, and none with a date, so the
  // input check could pass while every date in the app was unreadable -- which
  // is exactly what was happening: a hard-coded white background on
  // input[type=date] against the dark theme's light ink, 1.1:1. This visits a
  // page that has four of them.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelectorAll('input[type="date"]').length > 0, { timeout: 20000 }).catch(() => {});
  await sleep(900);
  const dateCount = await page.evaluate(() => document.querySelectorAll('input[type="date"]').length);
  check("the invoice form really has dates to check", dateCount > 0, String(dateCount));
  for (const t of THEMES) {
    await setTheme(t);
    const bad = await page.evaluate(CONTRAST);
    check(`what you type into an invoice is readable in ${t}`, bad.length === 0, JSON.stringify(bad.slice(0, 4)));
  }

  // --- and every other page, in every colour ---
  // Three pages were checked before: the front door, the dashboard and the
  // money screen. The invisible dates lived on a page none of them opened, and
  // the unnamed Category box on another. A sweep that covers a tenth of the app
  // finds a tenth of what is wrong with it.
  //
  // Signed in, so the gate does not bounce us; /login and /reset-password are
  // covered by the front-door pass above.
  const EVERY = [
    "/invoices", "/invoices/new", "/quotes", "/quotes/new", "/quotes/requests",
    "/clients", "/clients/new", "/receipts", "/receipts/new", "/receipts/review",
    "/expenses", "/mileage", "/recurring", "/recurring/invoices", "/vat",
    "/files", "/scan", "/copy", "/convert", "/check-company", "/help",
    "/feedback", "/settings", "/jobs", "/free-invoice",
    "/privacy", "/terms", "/security", "/accessibility", "/how-to-invoice",
  ];
  for (const path of EVERY) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(700);
    for (const t of THEMES) {
      await setTheme(t);
      const bad = await page.evaluate(CONTRAST);
      check(`${path} is readable in ${t}`, bad.length === 0, JSON.stringify(bad.slice(0, 3)));
    }
  }

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(900);

  const headings = await page.evaluate(() => ({
    h1: document.querySelectorAll("main h1").length,
    lang: document.documentElement.lang,
    title: document.title,
  }));
  check("one heading, a language and a title, so a screen reader knows where it is", headings.h1 === 1 && headings.lang === "en" && headings.title.length > 0, JSON.stringify(headings));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
