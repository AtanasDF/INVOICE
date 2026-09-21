// What the app says back, to someone who can't see it.
//
// The pages a CUSTOMER opens are the ones that matter: a quote link, an
// invoice link, a supplier's price request. Every outcome on them was a
// paragraph quietly swapped into a div -- and pressing the button disables
// it, which blurs it, so focus couldn't carry the answer either. A blind
// customer pressed "Yes, accept the quote" and heard nothing at all: no
// confirmation, and no error if it had failed. The page exists to do that
// one thing.
//
// Inside the app, a Save that refused because a field was empty returned
// without a word, so the form simply looked broken.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID, day } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 4, custom_categories: null });
const C = newId();
db.tables.clients.push({ id: C, user_id: UID, name: "Acme Kitchens Ltd", email: "acme@example.com", address: "", kind: "client", archived: false, is_company: true, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", company_number: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-announced" });

// Every element that will be spoken when its contents change.
const liveRegions = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[aria-live], [role="alert"], [role="status"]')].map((e) => ({
      how: e.getAttribute("aria-live") ?? e.getAttribute("role"),
      text: (e.textContent ?? "").trim().slice(0, 60),
    }))
  );
// A placeholder IS used as an accessible name, so a box with a
// descriptive placeholder is announced -- the real defect is a visible
// <label> sitting next to a control without being tied to it, which
// leaves the control with no name at all. The house style puts labels
// above rather than around, which is why this keeps happening.
const untiedLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("label")]
      .filter((l) => !l.htmlFor && !l.querySelector("input, select, textarea"))
      .map((l) => {
        const next = l.nextElementSibling;
        const control = next && /^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName) ? next : next?.querySelector?.("input, select, textarea");
        if (!control || control.type === "hidden" || !control.offsetParent) return null;
        const named = !!(control.getAttribute("aria-label") || control.getAttribute("aria-labelledby") || control.placeholder);
        return named ? null : (l.textContent ?? "").trim().slice(0, 40);
      })
      .filter(Boolean)
  );

try {
  await signIn(page, BASE);

  // --- the app's own forms -------------------------------------------
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(1600);
  const untied = await untiedLabels();
  check("no label on the new-invoice form is left untied to its control", untied.length === 0, JSON.stringify(untied));
  const dates = await page.evaluate(() =>
    [...document.querySelectorAll('input[type="date"]')].map((el) => ({
      named: !!(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)),
      id: el.id,
    }))
  );
  check("the two date fields are told apart, rather than both being \"date, blank\"", dates.length >= 2 && dates.every((d) => d.named), JSON.stringify(dates));

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(2000);
  const untiedSettings = await untiedLabels();
  check("no label in Settings is left untied either", untiedSettings.length === 0, JSON.stringify(untiedSettings));

  // A Save refused because a field is empty has to SAY so.
  await page.goto(`${BASE}/clients/new`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Save client$/.test(x.textContent.trim()));
    b?.click();
  });
  await sleep(1200);
  const refused = await bodyText(page);
  check("saving a contact with no name says why, rather than doing nothing", /Enter a name before saving/i.test(refused), refused.replace(/\s+/g, " ").slice(0, 240));
  check("...and that message is announced, not just shown", (await liveRegions()).some((r) => /Enter a name/i.test(r.text)), JSON.stringify(await liveRegions()).slice(0, 240));

  await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" });
  await sleep(1400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^Save receipt$/.test(x.textContent.trim()));
    b?.click();
  });
  await sleep(1200);
  check("saving a receipt with no total says why", /Enter the total paid before saving/i.test(await bodyText(page)), (await bodyText(page)).replace(/\s+/g, " ").slice(0, 240));
  check("...and it is announced too", (await liveRegions()).some((r) => /total paid/i.test(r.text)), JSON.stringify(await liveRegions()).slice(0, 240));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
