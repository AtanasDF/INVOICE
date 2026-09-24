// Whose details is this field holding?
//
// WCAG 1.3.5 asks for `autocomplete` on fields that collect information ABOUT
// THE USER, so a phone can fill in their own name, address and postcode
// instead of making them type it one-handed in a depot. That is half the
// sentence, and the app had the other half backwards.
//
// `AddressFields` carried address-line1, address-level2 and postal-code
// hardcoded -- and the same component collects CUSTOMERS' addresses, site
// addresses on a quote request, and the "bill to" block on the free page. On
// every one of those a browser was offering the user's own address, which is
// how somebody's own address ends up on a customer's record.
//
// So the rule this pins is not "more autocomplete". It is: the user's own
// details autofill, and nobody else's ever do.
import { makeDb, launchSignedIn, signIn, sleep, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// The complete list of valid tokens, so a typo cannot pass unnoticed. The UK
// traps are the ones worth naming: it is postal-code not postcode,
// organization not organisation, and tel not phone.
const VALID = new Set(["name","honorific-prefix","given-name","additional-name","family-name","honorific-suffix","nickname","username","new-password","current-password","one-time-code","organization-title","organization","street-address","address-line1","address-line2","address-line3","address-level4","address-level3","address-level2","address-level1","country","country-name","postal-code","cc-name","cc-number","cc-exp","cc-csc","cc-type","transaction-currency","transaction-amount","language","bday","sex","url","photo","tel","tel-country-code","tel-national","tel-area-code","tel-local","tel-extension","email","impp","on","off"]);

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-autocomplete" });

const tokens = () => page.evaluate(() =>
  [...document.querySelectorAll("input")]
    .filter((i) => i.type !== "hidden" && i.offsetParent !== null)
    .map((i) => ({ label: (i.getAttribute("aria-label") || i.placeholder || i.id || "").slice(0, 30), ac: i.getAttribute("autocomplete"), type: i.type })));

try {
  // Sign-in first, while there is no session: a signed-in browser is sent
  // straight off /login, and the first version of this check read an empty
  // page and called it a failure.
  // The Chrome profile is kept between runs, so a session from last time sends
  // us straight off /login before the form is ever drawn.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.waitForSelector('input[name="password"]', { timeout: 20000 }).catch(() => {});
  await sleep(600);
  let t = await tokens();
  const login = Object.fromEntries(t.filter((x) => x.ac).map((x) => [x.label || x.type, x.ac]));
  check("sign-in lets the password manager fill the email", Object.values(login).includes("email"), JSON.stringify(login));
  check("...and the password", Object.values(login).includes("current-password"), JSON.stringify(login));
  // Switching these off would turn the sign-in into a WCAG 3.3.8 failure: an
  // ordinary password field passes only because a manager can fill it.
  check("...and nothing on it is switched off", !Object.values(login).includes("off"), JSON.stringify(login));

  await signIn(page, BASE);

  // --- Settings: the user's own details, so they should fill themselves in ---
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await sleep(2200);
  t = await tokens();
  const mine = Object.fromEntries(t.filter((x) => x.ac).map((x) => [x.label, x.ac]));
  check("your own address offers to fill itself in", Object.values(mine).includes("address-line1"), JSON.stringify(mine));
  check("...and your town", Object.values(mine).includes("address-level2"), JSON.stringify(mine));
  check("...and your postcode, spelled postal-code and not postcode", Object.values(mine).includes("postal-code"), JSON.stringify(mine));
  check("...and your business name, spelled organization", Object.values(mine).includes("organization"), JSON.stringify(mine));

  const bad = t.filter((x) => x.ac && !x.ac.split(/\s+/).every((p) => VALID.has(p) || p.startsWith("section-") || ["shipping","billing","home","work","mobile","fax","pager"].includes(p)));
  check("every token on Settings is a real one", bad.length === 0, JSON.stringify(bad));

  // --- a customer: somebody else's details, so they must NOT ---
  await page.goto(`${BASE}/clients/new`, { waitUntil: "domcontentloaded" });
  await sleep(2200);
  t = await tokens();
  const leaking = t.filter((x) => x.ac && /^(address-|postal-code|organization$|street-address|name$|tel$|email$)/.test(x.ac));
  check("a customer's address never offers your own", leaking.length === 0, JSON.stringify(leaking));
  const offCount = t.filter((x) => x.ac === "off").length;
  check("...and it says so, rather than staying silent about it", offCount > 0, JSON.stringify(t.slice(0, 6)));

  // --- a quote request's site address: also not yours ---
  await page.goto(`${BASE}/quotes/requests`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  t = await tokens();
  const leaking2 = t.filter((x) => x.ac && /^(address-|postal-code|street-address)/.test(x.ac));
  check("a site address on a quote request is not yours either", leaking2.length === 0, JSON.stringify(leaking2));

} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
