// Does an error say WHICH box is wrong?
//
// Today it does not. Across 190 inputs the app uses `aria-invalid` zero times
// and `aria-describedby` once, while using `role="alert"` seventy-nine times.
// So a screen reader hears "Enter the amount received" and is never told which
// field that belongs to -- the words arrive with no address on them.
//
// This is the app's largest real accessibility failure, and unlike most of
// them it is invisible to anyone who can see the red text under the box.
//
// The shape that fixes it, and that this suite pins:
//
//   <label for="amount">Amount</label>
//   <input id="amount" aria-invalid aria-describedby="amount-err" />
//   <p id="amount-err" role="alert">Enter the amount received.</p>
//
// `aria-describedby` rather than `aria-errormessage`, which is the better
// specified attribute and the worse engineering choice: cross-reader testing
// finds it is generally not announced when moving between fields.
import { makeDb, launchSignedIn, signIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-form-errors" });

// Every visible error on the page, and whether anything points at it.
const wiring = () => page.evaluate(() => {
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().height > 0;
  };
  const alerts = [...document.querySelectorAll('[role="alert"]')].filter(visible);
  return {
    // An error nothing points at: the words with no address on them.
    orphans: alerts
      .filter((a) => !a.id || !document.querySelector(`[aria-describedby~="${CSS.escape(a.id)}"], [aria-errormessage="${CSS.escape(a.id)}"]`))
      .map((a) => a.textContent.trim().slice(0, 60)),
    // A field marked wrong with nothing to read about why.
    mute: [...document.querySelectorAll('[aria-invalid="true"]')]
      .filter((e) => !e.getAttribute("aria-describedby") && !e.getAttribute("aria-errormessage"))
      .map((e) => e.getAttribute("aria-label") || e.id || e.tagName),
    invalidCount: document.querySelectorAll('[aria-invalid="true"]').length,
    alertCount: alerts.length,
  };
});

try {
  await signIn(page, BASE);

  // --- a quote saved with nobody to send it to ---
  // Not an invoice: an empty invoice draft is MEANT to save, and it does. That
  // was the first version of this check, and it was asking for a refusal that
  // does not exist and should not.
  await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" });
  await sleep(1600);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /save quote/i.test(b.textContent))?.click());
  await sleep(1200);
  let w = await wiring();
  check("a quote with nobody to send it to is refused, out loud", w.alertCount > 0, JSON.stringify(w));
  check("...and every error names the field it is about", w.orphans.length === 0, JSON.stringify(w.orphans));
  check("...and no field is marked wrong with nothing to read", w.mute.length === 0, JSON.stringify(w.mute));

  // --- a payment with no amount ---
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^save/i.test(b.textContent.trim()))?.click());
  await sleep(1200);
  w = await wiring();
  check("a refused receipt says something", w.alertCount > 0, JSON.stringify(w));
  check("...and every error names its field", w.orphans.length === 0, JSON.stringify(w.orphans));

  // --- signing in with nothing ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await sleep(900);
  await page.evaluate(() => {
    const set = (n, v) => { const el = document.querySelector(`input[name="${n}"]`); if (!el) return; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("email", "someone@example.com");
    set("password", "x");
  });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Sign me in/i.test(b.textContent))?.click());
  await sleep(1500);
  w = await wiring();
  check("a refused sign-in names its field too", w.orphans.length === 0, JSON.stringify(w.orphans));

  // --- and the wording rules, which no automated check can judge but these ---
  const words = await page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent.trim()).join(" "));
  check("no error says 'please', which implies a choice", !/\bplease\b/i.test(words), words.slice(0, 200));
  check("no error says 'sorry', which does not help fix it", !/\bsorry\b/i.test(words), words.slice(0, 200));
  check("no error says 'invalid', which adds nothing", !/\binvalid\b/i.test(words), words.slice(0, 200));
  check("no error is a code rather than a sentence", !/\b(error|err)[ _-]?\d|0x[0-9a-f]{4}/i.test(words), words.slice(0, 200));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
