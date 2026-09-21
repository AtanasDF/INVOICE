// The files people actually hand an app: a twenty-page PDF, a PDF that is
// only a photo, a password-protected one, a 12-megapixel photo, a
// 23-megabyte photo, a photo with no extension, and a HEIC.
//
// Each goes in the way a person puts it in -- "+ Add", "Upload a photo or
// PDF", pick the file -- and what is watched is what the READER is handed,
// because that is what the whole path is for: nothing dropped, nothing
// mislabelled, nothing silently left out.
import fs from "fs";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const FIX = new URL("./fixtures/", import.meta.url).pathname;

// The three PDFs are kept as base64; puppeteer wants a real file on disk.
for (const name of ["twenty-page", "scanned", "encrypted"]) {
  fs.writeFileSync(`${FIX}${name}.pdf`, Buffer.from(fs.readFileSync(`${FIX}${name}.b64`, "utf8").trim(), "base64"));
}

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
  base: BASE,
  width: 390,
  profile: "profile-odd-files",
  intercept: (req, u) => {
    if (u.pathname !== "/api/scan") return false;
    const d = doc();
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ result: d, documents: [d] }) });
    return true;
  },
});

// What the reader was handed, measured INSIDE the page: the request body
// is far too big to read back through the DevTools protocol.
await page.evaluateOnNewDocument(() => {
  window.__handed = [];
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // Next's own router calls fetch with URL and Request objects, not
    // strings; a wrapper that assumed a string threw inside Next's RSC
    // fetch, which then fell back to a full page load and lost the
    // in-memory upload -- taking every check with it.
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input && input.url) || String(input);
    if (url.includes("/api/scan") && init && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        const files = body.images ?? body.files ?? [];
        for (const f of files) {
          const dataUrl = typeof f === "string" ? f : f.dataUrl;
          const type = dataUrl.slice(5, dataUrl.indexOf(";"));
          const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",")) * 0.75);
          let width = null, height = null;
          if (type.startsWith("image/")) {
            await new Promise((r) => { const im = new Image(); im.onload = () => { width = im.naturalWidth; height = im.naturalHeight; r(); }; im.onerror = () => r(); im.src = dataUrl; });
          }
          window.__handed.push({ type, bytes, width, height });
        }
      } catch (e) { window.__handed.push({ error: String(e) }); }
    }
    return real(input, init);
  };
});
const handed = () => page.evaluate(() => window.__handed ?? []);

// "+ Add", then the file input behind "Upload a photo or PDF".
const upload = async (file) => {
  await page.goto(`${BASE}/receipts`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await page.evaluate(() => { window.__handed = []; });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^\+ Add$/.test(b.textContent.trim()))?.click());
  await sleep(600);
  const input = (await page.$('input[type="file"][multiple]')) ?? (await page.$('input[type="file"][accept*="pdf"]'));
  if (!input) return false;
  const t0 = Date.now();
  await input.uploadFile(file);
  // Either the reading page arrives, or the button says the file couldn't be read.
  await page.waitForFunction(() => location.pathname === "/scan" || /Couldn't read/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  if (page.url().includes("/scan")) await page.waitForFunction(() => (window.__handed ?? []).length > 0 || /Document 1 of|couldn't be read|Toolstation/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  return Date.now() - t0;
};

try {
  await signIn(page, BASE);

  // A twenty-page invoice: every page reaches the reader.
  let ms = await upload(`${FIX}twenty-page.pdf`);
  let h = await handed();
  const pdfBytes = fs.statSync(`${FIX}twenty-page.pdf`).size;
  check("a 20-page PDF reaches the reader", h.length === 1 && h[0].type === "application/pdf", JSON.stringify(h));
  check("...whole, with no page dropped on the way", h[0] && Math.abs(h[0].bytes - pdfBytes) < 64, `${h[0]?.bytes} vs ${pdfBytes} bytes`);

  // A PDF that is only a scanned photo: a PDF all the same.
  await upload(`${FIX}scanned.pdf`);
  h = await handed();
  check("a scanned-image PDF is handed over as a PDF, not unpacked or refused", h.length === 1 && h[0].type === "application/pdf", JSON.stringify(h));

  // Password-protected: the page-counter can't open it, and that must not
  // take the reading page down.
  await upload(`${FIX}encrypted.pdf`);
  h = await handed();
  let t = await bodyText(page);
  check("a password-protected PDF doesn't take the reading page down", !/Application error/.test(t) && page.url().includes("/scan"), t.replace(/\s+/g, " ").slice(0, 200));
  check("...and is still handed to the reader to try", h.length === 1 && h[0].type === "application/pdf", JSON.stringify(h));

  // A 12-megapixel photo is downscaled before it goes anywhere.
  await upload(`${FIX}twelve-mp.jpg`);
  h = await handed();
  check("a 12MP photo is handed over as a JPEG", h.length === 1 && h[0].type === "image/jpeg", JSON.stringify(h));
  check("...downscaled to at most 1600px on its longest side", h[0] && Math.max(h[0].width ?? 0, h[0].height ?? 0) <= 1600 && Math.max(h[0].width ?? 0, h[0].height ?? 0) > 0, JSON.stringify(h));

  // Twenty-three megabytes off a camera: must finish, and must arrive small.
  ms = await upload(`${FIX}ten-mb.jpg`);
  h = await handed();
  check("a 23MB photo is read without hanging", h.length === 1 && ms < 60000, `${ms}ms ${JSON.stringify(h)}`);
  check("...and what the reader gets is under 2MB", h[0] && h[0].bytes < 2 * 1024 * 1024, `${h[0]?.bytes} bytes`);

  // No extension at all: the browser has no type for it. It used to be
  // tagged as a PDF; the first bytes say it is a JPEG.
  await upload(`${FIX}receipt-noext`);
  h = await handed();
  t = await bodyText(page);
  check("a photo with no extension is recognised from its bytes as a photo", h.length === 1 && h[0].type === "image/jpeg", JSON.stringify(h) + " " + t.replace(/\s+/g, " ").slice(0, 120));
  check("...and downscaled like any other photo", h[0] && h[0].width && Math.max(h[0].width, h[0].height) <= 1600, JSON.stringify(h));

  // HEIC: Chrome can't decode it. It has to be said, not swallowed.
  await upload(`${FIX}photo.heic`);
  t = await bodyText(page);
  check("a HEIC the browser can't decode is said to be unreadable", /Couldn't read that file|couldn't be read/i.test(t), t.replace(/\s+/g, " ").slice(0, 240));
  check("...and is not passed to the reader as if it were fine", (await handed()).length === 0, JSON.stringify(await handed()));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
