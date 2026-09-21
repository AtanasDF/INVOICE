// A photo taken with the phone on its side, or upside down.
//
// The camera stores the pixels the way the sensor saw them and writes
// "rotate this" into EXIF. A viewer that honours it shows the receipt
// upright; one that ignores it shows it lying on its side -- and a reader
// handed a sideways receipt reads sideways text. So what matters is what
// the READER is handed after the photo has been downscaled: is it the
// right way up, whatever the sensor recorded?
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const FIX = new URL("./fixtures/", import.meta.url).pathname;

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Harness Ltd", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, custom_categories: null });
const doc = () => ({
  documentType: "receipt", vendor: "Toolstation", vendorConfidence: "high",
  date: new Date().toISOString().slice(0, 10), dateAsPrinted: null, dateConfidence: "high", dateAmbiguous: false, dateAlternative: null,
  invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, dueDateAmbiguous: false, dueDateAlternative: null,
  creditedInvoiceNumber: null, totalAmount: 84.2, totalAmountConfidence: "high", currency: "GBP",
  vatAmount: 14.03, vatAmountConfidence: "high", category: "Supplies",
  lineItems: [], details: { other: [] }, contactPerson: null, contactEmail: null,
  notes: null, pages: [], box: null, paidOnDocument: true,
});

const { browser, page } = await launchSignedIn(db, {
  base: BASE, width: 390, profile: "profile-exif",
  intercept: (req, u) => {
    if (u.pathname !== "/api/scan") return false;
    const d = doc();
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: d, documents: [d] }) });
    return true;
  },
});

// What the reader is handed, and which way up it is. The receipt's text
// is left-aligned from 8% in, so upright the LEFT third is darker than the
// right; turned 180 it is the other way round; on its side it is landscape.
await page.evaluateOnNewDocument(() => {
  window.__handed = [];
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input && input.url) || String(input);
    if (url.includes("/api/scan") && init && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        for (const f of body.images ?? []) {
          const dataUrl = typeof f === "string" ? f : f.dataUrl;
          const im = new Image();
          await new Promise((r) => { im.onload = r; im.onerror = r; im.src = dataUrl; });
          const w = im.naturalWidth, h = im.naturalHeight;
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d"); ctx.drawImage(im, 0, 0);
          const dark = (x0, x1) => { const d = ctx.getImageData(Math.floor(x0 * w), 0, Math.max(1, Math.floor((x1 - x0) * w)), h).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 255 - d[i]; return s / (d.length / 4); };
          window.__handed.push({ width: w, height: h, left: Math.round(dark(0, 0.33)), right: Math.round(dark(0.67, 1)) });
        }
      } catch (e) { window.__handed.push({ error: String(e) }); }
    }
    return real(input, init);
  };
});
const handed = () => page.evaluate(() => window.__handed ?? []);

const upload = async (file) => {
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await page.evaluate(() => { window.__handed = []; });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^\+ Add$/.test(b.textContent.trim()))?.click());
  await sleep(600);
  const input = (await page.$('input[type="file"][multiple]')) ?? (await page.$('input[type="file"][accept*="pdf"]'));
  if (!input) return false;
  await input.uploadFile(file);
  await page.waitForFunction(() => (window.__handed ?? []).length > 0 || /Couldn't read/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  await sleep(1200);
  return true;
};

try {
  await signIn(page, BASE);

  // Held sideways: the pixels are landscape 1600x1200 with "rotate 90" in EXIF.
  await upload(`${FIX}exif-sideways.jpg`);
  let h = (await handed())[0];
  check("a photo taken with the phone on its side is handed over upright (portrait)", h && h.height > h.width, JSON.stringify(h));
  check("...with the text where it belongs, down the left", h && h.left > h.right * 1.3, JSON.stringify(h));

  // Held upside down: portrait pixels with "rotate 180" in EXIF.
  await upload(`${FIX}exif-upsidedown.jpg`);
  h = (await handed())[0];
  check("a photo taken upside down is turned the right way up", h && h.left > h.right * 1.3, JSON.stringify(h));
  check("...and is still portrait and downscaled", h && h.height > h.width && Math.max(h.width, h.height) <= 1600, JSON.stringify(h));
  check("...and nothing fell over", !/Application error/.test(await bodyText(page)));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
