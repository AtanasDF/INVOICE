// The things HMRC's terms of use make us declare, checked rather than
// declared. Every one of these is a yes/no on the production-credentials
// form, and a wrong yes is a false statement on a compliance return.
//
// Three of them were the reason the form stopped on 2026-09-25:
//   - a way for anybody to report a security problem, and a written process
//   - focus going somewhere sensible when the page changes (WCAG 2.4.3)
//   - autocomplete on the fields that are about the PERSON (WCAG 1.3.5)
//
// The third is the one worth reading twice. The accessibility notes counted
// 27 autocomplete attributes across 252 inputs and called it a failure. That
// count was measuring the wrong thing: 1.3.5 is about the user's OWN
// information, and most of those inputs are a customer's name, a supplier's
// address or what was read off a receipt -- where autocomplete must NOT be
// set, because offering somebody their own address while they type a
// customer's is worse than offering nothing.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, address: "1 Test Street", custom_categories: null });
db.tables.clients.push({ id: newId(), user_id: "x", name: "Acme Ltd", email: "a@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-terms-of-use" });
try {
  // ---- A way to report a security problem ---------------------------------
  // Read SIGNED OUT first: whoever finds a security problem has no account.
  await page.goto(`${BASE}/security`, { waitUntil: "networkidle0" });
  await sleep(700);
  const strangerSees = await bodyText(page);
  check("a stranger can reach it without an account", /report a security problem/i.test(strangerSees), strangerSees.slice(0, 120));

  await signIn(page, BASE);
  await page.goto(`${BASE}/security`, { waitUntil: "networkidle0" });
  await sleep(600);
  const sec = await bodyText(page);
  check("there is a page for reporting a security problem", /report a security problem/i.test(sec), sec.slice(0, 120));
  check("it says how to send one", /feedback/i.test(sec) && /SECURITY/.test(sec), sec.slice(0, 200));
  // HMRC ask for a process that reports within 72 hours; the ICO ask the
  // same. A page that only says "email us" answers neither.
  check("it promises the ICO within 72 hours", /72 hours/.test(sec) && /Information Commissioner/i.test(sec));
  check("it promises HMRC within 72 hours too", /HMRC[^.]*72 hours|72 hours[^.]*HMRC/i.test(sec.replace(/\n/g, " ")));
  check("it says what a reporter must not do", /do not/i.test(sec) && /(knock the app over|public before it is fixed)/i.test(sec));

  // Easy to find: HMRC say "easy to find and use". A page nothing links to
  // is not.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(700);
  const linked = await page.evaluate(() => [...document.querySelectorAll('footer a')].some((a) => a.getAttribute("href") === "/security"));
  check("every page's footer links to it", linked);

  // And the machine-readable one, which is where a researcher looks first.
  const txt = await page.evaluate(async () => {
    const r = await fetch("/.well-known/security.txt");
    return r.ok ? await r.text() : "";
  });
  check("security.txt is served", /Contact:/.test(txt), txt.slice(0, 80));
  check("it points at the security page", /\/security/.test(txt), txt.slice(0, 200));
  // RFC 9116 requires Expires, and a stale one is treated as no file at all.
  const expires = /Expires:\s*(\S+)/.exec(txt);
  check("it has an Expires that is still in the future", !!expires && new Date(expires[1]) > new Date(), expires?.[1]);

  // ---- Why we are allowed to keep it (UK GDPR) ----------------------------
  await page.goto(`${BASE}/privacy`, { waitUntil: "networkidle0" });
  await sleep(600);
  const priv = await bodyText(page);
  check("the privacy page names a lawful basis", /lawful basis/i.test(priv), priv.slice(0, 100));
  check("and says which one", /contract/i.test(priv) && /legitimate interest/i.test(priv));
  check("it still says how to get everything out", /saved to your own device|PDF/i.test(priv));
  check("and how to have it erased", /erased|deleted/i.test(priv));
  check("it points at the security page", /security/i.test(priv));

  // ---- Focus when the page changes (WCAG 2.4.3) ---------------------------
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" });
  await sleep(900);
  // Follow a link the way a keyboard user would, so focus starts on the link.
  const moved = await page.evaluate(async () => {
    const link = [...document.querySelectorAll("a[href]")].find((a) => a.getAttribute("href") === "/clients" || a.getAttribute("href") === "/receipts");
    if (!link) return { noLink: true };
    link.focus();
    const before = document.activeElement?.tagName;
    link.click();
    await new Promise((r) => setTimeout(r, 1400));
    const after = document.activeElement;
    return { before, afterTag: after?.tagName, isMain: after?.tagName === "MAIN", path: location.pathname };
  });
  check("following a link moves focus into the new page", moved.isMain === true, JSON.stringify(moved));
  // Focusable, but never in the tab order, and no ring nobody asked for.
  const mainShape = await page.evaluate(() => {
    const m = document.querySelector("main");
    return { tabindex: m?.getAttribute("tabindex"), outline: getComputedStyle(m).outlineStyle };
  });
  check("main is focusable but not in the tab order", mainShape.tabindex === "-1", JSON.stringify(mainShape));
  check("and shows no focus ring for a mouse click", mainShape.outline === "none", JSON.stringify(mainShape));

  // Not on the first load: the browser's own focus is right on arrival, and
  // stealing it skips the header for anybody who has just pressed Tab.
  const fresh = await browser.newPage();
  await fresh.setRequestInterception(false);
  await fresh.close();
  const onArrival = await page.evaluate(() => document.activeElement?.tagName);
  check("a page that was navigated to keeps focus in main", onArrival === "MAIN", String(onArrival));

  // ---- autocomplete, on the fields that are the PERSON'S own -------------
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const mine = await page.evaluate(() => {
    const get = (sel) => document.querySelector(sel)?.getAttribute("autocomplete");
    return {
      business: [...document.querySelectorAll("input")].map((i) => i.getAttribute("autocomplete")).filter(Boolean),
    };
  });
  check("settings offers the person their own details", mine.business.includes("organization") && mine.business.some((a) => /address-line1/.test(a)), JSON.stringify(mine.business.slice(0, 8)));
  check("and their own postcode", mine.business.includes("postal-code"), JSON.stringify(mine.business.slice(0, 10)));

  // The other half of the same rule: a CUSTOMER's details are not the
  // person's own, and a browser must not offer their address there.
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(1000);
  const theirs = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.getAttribute("autocomplete")).filter((a) => a && a !== "off"));
  check("a customer's form offers nothing of the person's own", theirs.length === 0, JSON.stringify(theirs));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
