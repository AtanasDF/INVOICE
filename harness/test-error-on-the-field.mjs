// When a form refuses, WHICH box is it about?
//
// notes/accessibility-spec.md called this "our biggest real failure", and
// it still is: 85 places render `{error && <p role="alert">…</p>}` as a
// SIBLING of the boxes. A screen reader announces the words and stops. The
// person hears "Enter a name before saving" and has no way to be taken to
// the name. WCAG 3.3.1 and 1.3.1.
//
// The fix is on the CONTROL, not on a wrapper: aria-invalid on the input,
// aria-describedby pointing at the id of the message. (aria-errormessage is
// the better-specified attribute and the worse engineering choice today --
// screen-reader support is still patchy, describedby is universal.)
//
// Page-level failures -- "Couldn't load your invoices" -- are NOT this.
// They are about the page, and tying them to a box would be a lie. Only a
// refusal that names one field belongs here.
import { makeDb, launchSignedIn, signIn, sleep, clickText, newId } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
db.tables.clients.push({ id: newId(), user_id: "x", name: "Acme Ltd", email: "a@b.c", kind: "client", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });

// Is the message tied to the box it is about? Asked of the page, the way a
// screen reader would work it out.
const tiedTo = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const described = ids.map((id) => document.getElementById(id)).filter(Boolean);
    return {
      invalid: el.getAttribute("aria-invalid"),
      describes: described.map((d) => (d.textContent ?? "").trim()),
      // A message that exists on the page but is tied to nothing.
      loose: [...document.querySelectorAll('[role="alert"]')]
        .filter((a) => !ids.includes(a.id))
        .map((a) => (a.textContent ?? "").trim())
        .filter(Boolean),
    };
  }, selector);

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-error-field" });
try {
  await signIn(page, BASE);

  // The one that already does it right, so a suite that passes everything
  // is not passing because it asks nothing.
  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(900);
  await clickText(page, "Save receipt");
  await sleep(500);
  let t = await tiedTo(page, "#receipt-total");
  check("receipts: a missing total is tied to the total box", t.invalid === "true" && t.describes.some((d) => /total/i.test(d)), JSON.stringify(t));

  // A new customer with no name.
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(900);
  await clickText(page, "Save customer");
  await sleep(500);
  t = await tiedTo(page, "#new-contact-name");
  check("a new customer with no name is tied to the name box", t.invalid === "true" && t.describes.some((d) => /name/i.test(d)), JSON.stringify(t));

  // A trip with no miles.
  await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" });
  await sleep(900);
  await clickText(page, "Save the trip");
  await sleep(500);
  t = await tiedTo(page, "#m-miles");
  check("a trip with no miles is tied to the miles box", t.invalid === "true" && t.describes.some((d) => /mile/i.test(d)), JSON.stringify(t));

  // And the rule that keeps it honest: a page-level failure is NOT tied to
  // a box, because it is not about one. Tying "Couldn't load your invoices"
  // to some input would be a lie told in an accessible way.
  // Same tab: the mocked database is installed on THIS page's request
  // interception, and a second tab has none -- which is why the first
  // version of this check saw no message at all and called it a pass
  // waiting to happen.
  db.fail["GET invoices"] = 5;
  await page.goto(`${BASE}/invoices`, { waitUntil: "networkidle0" }).catch(() => {});
  await sleep(1500);
  const loose = await page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"]')].map((a) => ({ text: (a.textContent ?? "").trim(), tied: !!a.id && !!document.querySelector(`[aria-describedby~="${a.id}"]`) }))
  );
  check("the page says it couldn't load", loose.some((l) => /couldn't load/i.test(l.text)), JSON.stringify(loose));
  check("a failed page load is not pinned to some box", loose.length > 0 && loose.every((l) => !l.tied), JSON.stringify(loose));

  // Two different passwords, on the account screen.
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/login?new=1`, { waitUntil: "networkidle0" });
  await sleep(900);
  await page.type("#email", "someone@example.com");
  const boxes = await page.$$('input[type="password"]');
  if (boxes.length === 2) {
    await boxes[0].type("hunter2222");
    await boxes[1].type("hunter3333");
  }
  check("the account screen asks for the password twice", boxes.length === 2, String(boxes.length));
  await clickText(page, "Make my account");
  await sleep(700);
  t = await tiedTo(page, "#password-again");
  check("two different passwords are tied to the second box", t.invalid === "true" && t.describes.some((d) => /not the same/i.test(d)), JSON.stringify(t));

} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
