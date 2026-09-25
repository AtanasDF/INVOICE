// The walkthrough frames, recorded by driving the real app.
//
// The point of doing it this way, from notes/help-chat-design.md: "a
// hand-recorded clip goes stale the moment a button moves, and a help video
// showing a button that is not there any more is worse than no help at
// all." These frames are produced by the same kind of scripted run that
// tests the flows, so when a button moves the run fails here and the frames
// are written again rather than quietly rotting.
//
// Run:  BASE=http://localhost:3000 node record-help.mjs
// Writes web/public/help/<journey>/NN.webp, one per step, and NOTHING else.
// It never deletes a directory it did not write.
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { makeDb, launchSignedIn, signIn, sleep, newId, todayISO } from "./mockdb.mjs";
import { HELP_JOURNEYS } from "./gen/lib/helpJourneys.js";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "/Users/nasko/Desktop/INVOICE/web/public/help";
// A phone, because that is what this is for and what the frames are shown
// at. Two-times pixel ratio so the picture is crisp at its printed size.
const WIDTH = 390;
const HEIGHT = 780;
// Every frame must stay under this. test-weight holds the app to a page
// budget and a help section that blows it is a help section nobody waits
// for.
const MAX_KB = 90;

const problems = [];
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], invoice_links: [], quote_links: [], recurring_expenses: [], recurring_invoices: [], quotes: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "A. Fragov Plastering", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 41, address: "12 Mill Lane\nBristol\nBS1 4DJ", vat_number: "GB220430231", custom_categories: null });
const CLIENT = newId();
db.tables.clients.push({ id: CLIENT, user_id: "x", name: "Redland Builders Ltd", email: "accounts@redland.example", kind: "client", archived: false, is_company: true, address: "3 Cotham Road\nBristol\nBS6 6DR", vat_number: "GB660454836", payment_terms: "30 days", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
const SUPPLIER = newId();
db.tables.clients.push({ id: SUPPLIER, user_id: "x", name: "Jewson", email: "", kind: "supplier", archived: false, is_company: true, address: "", vat_number: "", payment_terms: "", default_currency: "", contact_person: "", phone: "", reminders_enabled: true, company_number: null });
// A quarter's worth of history, so the VAT walkthrough shows real figures
// rather than an empty screen -- an empty screen teaches nothing, and the
// first run recorded five frames of £0.00 because the history was dated
// relative to today and the page opens on LAST quarter. Dated inside that
// quarter, worked out the same way the page works it out, so this keeps
// being true next March.
const lastQuarterDay = (n) => {
  const [y, m] = todayISO().split("-").map(Number);
  const startMonth = Math.floor((m - 1) / 3) * 3 + 1 - 3;
  const d = new Date(Date.UTC(startMonth < 1 ? y - 1 : y, ((startMonth + 11) % 12), 1));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
for (let i = 1; i <= 4; i++) {
  db.tables.invoices.push({ id: newId(), user_id: "x", client_id: CLIENT, date: lastQuarterDay(10 * i), number: `INV-0000${30 + i}`, items: [{ description: "Plastering", quantity: 1, unitPrice: 850 + i * 60, vatRate: "standard" }], notes: "", due_date: lastQuarterDay(10 * i + 30), payment_terms: "30 days", status: "sent", tags: [], vat_registered: true, cis_rate: null });
  db.tables.receipts.push({ id: newId(), user_id: "x", client_id: SUPPLIER, date: lastQuarterDay(9 * i + 2), vendor: "Jewson", category: "Materials", amount: 120 + i * 15, vat_amount: 24 + i * 3, image_data_url: null, notes: "", starred: false, needs_review: false, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });
}

// One document waiting to be checked, for the review journey. Deliberately
// missing its VAT: the scan rule is that a reading only fills in what it is
// sure of, so the frame shows an empty box to fill rather than a tidy form,
// which is what somebody will actually meet.
const PENDING = newId();
db.tables.receipts.push({ id: PENDING, user_id: "x", client_id: null, date: todayISO(), vendor: "Jewson", category: "", amount: 120, vat_amount: null, image_data_url: null, notes: "", starred: false, needs_review: true, warranty_months: null, tags: [], line_items: [], document_type: "receipt", invoice_number: null, due_date: null, paid: true, details: {}, credit_of_receipt_id: null, original_amount: null, original_vat_amount: null, original_currency: null, fx_rate: null });

// Puts the thing the caption talks about on screen AND rings it.
//
// The ring is not decoration. Three of these pages fit on a phone screen
// whole, so scrolling to a different part of them changes nothing at all --
// the first run wrote seven identical frames and reported success. Marking
// what is being talked about is also what makes a screenshot into help
// rather than a picture of a form (notes/help-chat-design.md asked for "a
// drawn cursor and a caption").
//
// Targets are given precisely -- {label} for an aria-label, {id}, or {text}
// for an element's OWN words -- because matching any element containing a
// word finds an outer div wrapping the whole page, and ringing the whole
// page rings nothing. The first version did exactly that and put the ring
// round the wrong box.
const look = async (page, target) => {
  const found = await page.evaluate((t) => {
    document.getElementById("__help_ring")?.remove();
    let hit = null;
    if (t.id) hit = document.getElementById(t.id);
    else if (t.label) hit = document.querySelector(`[aria-label="${t.label}"]`);
    else if (t.text) {
      hit = [...document.querySelectorAll("h1,h2,h3,label,button,a,p,span,strong,li,div,td")]
        .filter((e) => [...e.children].length === 0 && (e.textContent ?? "").trim().includes(t.text))
        .sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length)[0] ?? null;
    }
    if (!hit) return false;
    hit.scrollIntoView({ block: "center" });
    const r = hit.getBoundingClientRect();
    const ring = document.createElement("div");
    ring.id = "__help_ring";
    Object.assign(ring.style, {
      position: "fixed",
      left: `${Math.max(2, r.left - 6)}px`,
      top: `${Math.max(2, r.top - 6)}px`,
      width: `${Math.min(r.width + 12, window.innerWidth - 8)}px`,
      height: `${r.height + 12}px`,
      border: "3px solid #b45309",
      borderRadius: "10px",
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.10)",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    document.body.appendChild(ring);
    return true;
  }, target);
  if (!found) problems.push(`nothing to ring for ${JSON.stringify(target)}`);
  await sleep(450);
};

const clearRing = (page) => page.evaluate(() => document.getElementById("__help_ring")?.remove());

const setNative = `(el, v) => { const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : (el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype); Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }`;

// What each journey does between frames. Each entry is one step, and there
// must be exactly as many as the journey has captions -- checked below, so
// adding a caption without a frame cannot ship.
const DRIVE = {
  invoice: [
    async (page) => { await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" }); await sleep(1600); await look(page, { text: "New invoice" }); },
    async (page) => { await page.evaluate(`(async () => { const set = ${setNative}; const pick = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "${CLIENT}")); if (pick) set(pick, "${CLIENT}"); })()`); await sleep(900); await look(page, { label: "Customer" }); },
    async (page) => {
      await page.evaluate(`(async () => { const set = ${setNative}; const d = [...document.querySelectorAll("input")].find(i => i.getAttribute("aria-label") === "Description"); if (d) { set(d, "Skim two bedrooms and a landing"); d.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); } const p = [...document.querySelectorAll("input")].find(i => i.getAttribute("aria-label") === "Unit price"); if (p) set(p, "960"); })()`);
      await sleep(900); await look(page, { label: "Unit price" });
    },
    async (page) => { await look(page, { text: "Total: " }); },
    async (page) => { await look(page, { text: "Save draft" }); },
  ],
  receipt: [
    async (page) => { await page.goto(`${BASE}/receipts/new`, { waitUntil: "networkidle0" }); await sleep(1600); await look(page, { text: "New receipt" }); },
    async (page) => { await page.evaluate(`(async () => { const set = ${setNative}; const v = [...document.querySelectorAll("input")].find(i => (i.getAttribute("placeholder") || "").toLowerCase().includes("supplier") || i.getAttribute("aria-label") === "Supplier"); if (v) set(v, "Jewson"); })()`); await sleep(800); await look(page, { label: "Date" }); },
    async (page) => { await page.evaluate(`(async () => { const set = ${setNative}; const t = document.getElementById("receipt-total"); if (t) set(t, "144.00"); const vs = [...document.querySelectorAll("input")].find(i => (i.getAttribute("aria-label") || "").startsWith("Of which VAT")); if (vs) set(vs, "24.00"); })()`); await sleep(900); await look(page, { label: "VAT" }); },
    async (page) => { await look(page, { label: "Category" }); },
    async (page) => { await look(page, { text: "Save receipt" }); },
  ],
  vat: [
    async (page) => { await page.goto(`${BASE}/vat`, { waitUntil: "networkidle0" }); await sleep(1900); await look(page, { text: "VAT" }); },
    async (page) => { await look(page, { text: "Box 1" }); },
    async (page) => { await look(page, { text: "Box 5" }); },
    async (page) => { await look(page, { text: "What's in it" }); },
    async (page) => { await look(page, { text: "Copy the figures" }); },
  ],
  mileage: [
    async (page) => { await page.goto(`${BASE}/mileage`, { waitUntil: "networkidle0" }); await sleep(1600); await look(page, { text: "Mileage" }); },
    async (page) => { await page.evaluate(`(async () => { const set = ${setNative}; const m = document.getElementById("m-miles"); if (m) set(m, "34"); })()`); await sleep(900); await look(page, { id: "m-miles" }); },
    async (page) => { await look(page, { text: "Save the trip" }); },
    async (page) => { await look(page, { text: "This tax year" }); },
  ],
  quote: [
    async (page) => { await page.goto(`${BASE}/quotes/new`, { waitUntil: "networkidle0" }); await sleep(1700); await look(page, { text: "New quote" }); },
    async (page) => { await look(page, { text: "+ New customer" }); },
    async (page) => {
      await page.evaluate(`(async () => { const set = ${setNative}; const d = [...document.querySelectorAll("input")].find(i => i.getAttribute("aria-label") === "What the work or item is"); if (d) set(d, "Skim and plaster the front room"); const p = [...document.querySelectorAll("input")].find(i => i.getAttribute("aria-label") === "Unit price"); if (p) set(p, "1450"); })()`);
      await sleep(900); await look(page, { label: "Unit price" });
    },
    async (page) => { await look(page, { label: "Deposit" }); },
    async (page) => { await look(page, { text: "Save quote" }); },
  ],
  review: [
    async (page) => { await page.goto(`${BASE}/receipts/review`, { waitUntil: "networkidle0" }); await sleep(1800); await look(page, { text: "Needs review" }); },
    async (page) => { await look(page, { label: "Supplier" }); },
    async (page) => { await look(page, { label: "Date" }); },
    // The category step went in, came out, and went back. Its select had no
    // aria-label, so "nothing to ring for Category" read as "there is no
    // category control" -- and the frame showed one plainly. The select was
    // the only control in that row without an accessible name, /receipts/review
    // was not in test-labels' page list, and both are now fixed.
    async (page) => { await look(page, { label: "Category" }); },
    async (page) => { await look(page, { label: "Total (£, incl. VAT)" }); },
    async (page) => { await look(page, { text: "Looks good" }); },
  ],
};

const { browser, page } = await launchSignedIn(db, { base: BASE, width: WIDTH, profile: "profile-record-help" });
let wrote = 0;
try {
  await signIn(page, BASE);
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  // The app follows the phone's own light/dark setting. A dark frame shown
  // to somebody whose phone is light is a picture of a different app, so the
  // frames are always recorded light.
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

  for (const journey of HELP_JOURNEYS) {
    const drive = DRIVE[journey.id];
    if (!drive) { problems.push(`${journey.id}: no steps to drive it`); continue; }
    if (drive.length !== journey.steps.length) {
      problems.push(`${journey.id}: ${journey.steps.length} captions but ${drive.length} steps to drive`);
      continue;
    }
    const seen = new Map();
    const dir = join(OUT, journey.id);
    mkdirSync(dir, { recursive: true });
    // Only ever removes the frames it is about to replace.
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (/^\d\d\.webp$/.test(f)) unlinkSync(join(dir, f));

    for (let i = 0; i < drive.length; i++) {
      await clearRing(page);
      await drive[i](page);
      const file = join(dir, `${String(i + 1).padStart(2, "0")}.webp`);
      const shot = await page.screenshot({ type: "webp", quality: 72, captureBeyondViewport: false });
      // A frame identical to the one before it is a step that showed
      // nothing. The first run wrote three such pairs and reported success,
      // because nothing was looking at the pictures -- only at whether files
      // had been written.
      const hash = createHash("sha1").update(shot).digest("hex");
      if (seen.has(hash)) problems.push(`${journey.id}/${i + 1}: identical to ${seen.get(hash)} -- the step showed nothing new`);
      seen.set(hash, `${journey.id}/${i + 1}`);
      writeFileSync(file, shot);
      const kb = Math.round(statSync(file).size / 1024);
      if (kb > MAX_KB) problems.push(`${journey.id}/${i + 1}: ${kb}KB, over the ${MAX_KB}KB budget`);
      wrote++;
    }
    console.log(`recorded ${journey.id}: ${drive.length} frames`);
  }
} catch (e) {
  problems.push(`ERROR ${e.message}`);
} finally {
  await browser.close();
}
console.log(JSON.stringify({ wrote, problems }));
process.exit(problems.length ? 1 : 0);
