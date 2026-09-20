// What a customer sees. A private invoice or quote link that has been
// stopped, mistyped, or points at a draft must not show them a bare 404 or
// a stack trace -- and must never say whether the token ever existed.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const today = new Date().toISOString().slice(0, 10);
const flat = (t) => t.replace(/\s+/g, " ");
const token = (n) => `${n}`.padEnd(43, "0");

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], quote_requests: [], quote_request_suppliers: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });
const DRAFT = { id: newId(), user_id: "x", client_id: C, date: today, number: "DRAFT-p", items: [{ description: "Work", quantity: 1, unitPrice: 100, vatRate: "standard" }], notes: "", due_date: null, payment_terms: "", status: "draft", tags: [], vat_registered: null, cis_rate: null };
db.tables.invoices.push(DRAFT);
db.tables.invoice_links.push({ id: newId(), user_id: "x", invoice_id: DRAFT.id, token: token("draftlink"), created_at: new Date().toISOString(), first_viewed_at: null, last_viewed_at: null, view_count: 0 });

// These pages are read on the server with the service role, so they don't
// go through the mocked browser database -- against a local server with no
// Supabase reachable, every one of them is a link that doesn't resolve,
// which is exactly the case being tested.
const CASES = [
  ["/i/" + token("nosuchinvoice"), "an invoice link that doesn't resolve"],
  ["/i/" + token("draftlink"), "a link to something not issued"],
  ["/i/short", "a mistyped invoice link"],
  ["/q/" + token("nosuchquote"), "a quote link that doesn't resolve"],
  ["/r/" + token("nosuchrequest"), "a supplier link that doesn't resolve"],
  ["/no-such-page", "a mistyped page"],
];

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 375, profile: "profile-public" });
try {
  for (const [path, name] of CASES) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => null);
    await sleep(700);
    const t = await bodyText(page);
    // Signed out, an unknown app route asks them to sign in, which is the
    // right answer for a page that needs an account.
    check(`${name}: says something a person can read`, /isn't working|isn't here|not here|ask whoever|Sign in/i.test(t), flat(t).slice(0, 220));
    check(`${name}: no bare 404 or stack trace`, !/This page could not be found|Application error|at [A-Za-z]+ \(/.test(t), flat(t).slice(0, 220));
    check(`${name}: gives nothing away about the link`, !/token|database|supabase|sql|row|user_id/i.test(t), flat(t).slice(0, 220));
    // A streamed route has already sent its headers by the time the link is
    // found to be dead, so Next answers 200 with a noindex tag (its own
    // documented behaviour); the root 404 is not streamed and answers 404.
    const noindex = await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
    check(`${name}: kept out of search engines`, /noindex/.test(noindex) || res?.status() === 404, `${res?.status()} ${noindex}`);
    check(`${name}: fits a phone`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  // A signed-in person who mistypes a page gets the app's own 404, with a
  // way back, not a dead end.
  await signIn(page, BASE);
  await page.goto(`${BASE}/nope`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(800);
  const t = await bodyText(page);
  check("a mistyped page offers the way back", /Back to the dashboard/i.test(t), flat(t).slice(0, 200));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
