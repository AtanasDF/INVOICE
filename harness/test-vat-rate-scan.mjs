// A till receipt prints "VAT 20%" and no VAT figure (GO OUTDOORS, £29.00,
// 2026-09-22): the VAT box came up empty, which is £0 in box 4. Now the
// reader reports the printed rate and the page works the figure out, says
// so, and flags it for a look. The reader is mocked; this is what the page
// does with its answer.
import { makeDb, launchSignedIn, signIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Harness Plastering Ltd", vat_registered: true, invoice_prefix: "INV-", invoice_next_number: 10, custom_categories: null });
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let vatAmount = null;
let vatRate = 20;
const answer = () => {
  const doc = {
    documentType: "receipt",
    vendor: "GO OUTDOORS", vendorConfidence: "high",
    date: "2026-09-18", dateAsPrinted: "FRI SEP 18 12:57:01 2026", dateConfidence: "high", dateAmbiguous: false, dateAlternative: null,
    invoiceNumber: null, dueDate: null, dueDateAsPrinted: null, dueDateAmbiguous: false, dueDateAlternative: null,
    creditedInvoiceNumber: null,
    totalAmount: 29, totalAmountConfidence: "high", currency: null,
    vatAmount, vatAmountConfidence: "high", vatRate, category: "Equipment",
    lineItems: [{ description: "Walking socks", quantity: 1, unitPrice: 29, lineTotal: 29 }], details: { other: [] },
    contactPerson: null, contactEmail: null, notes: null, pages: [], box: null, paidOnDocument: true,
  };
  return { result: doc, documents: [doc] };
};

const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-vat-rate-scan",
  intercept: (req, u) => {
    if (u.pathname !== "/api/scan") return false;
    req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(answer()) });
    return true;
  },
});
const vatBox = () => page.evaluate(() => {
  const label = [...document.querySelectorAll("label")].find((l) => /Of which VAT/.test(l.textContent));
  return label?.parentElement?.querySelector("input")?.value ?? null;
});
async function scan() {
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "domcontentloaded" });
  await page.evaluate((p) => sessionStorage.setItem("scan-handoff-capture", JSON.stringify({ dataUrl: p, mediaType: "image/png" })), PIXEL);
  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => [...document.querySelectorAll("label")].some((l) => /Of which VAT/.test(l.textContent)), { timeout: 20000 });
  await sleep(800);
  return bodyText(page);
}

try {
  await signIn(page, BASE);

  let text = await scan();
  check("no figure printed, 20% printed: the VAT box holds £4.83", (await vatBox()) === "4.83", await vatBox());
  check("...and says it was worked out from the printed rate", text.includes("VAT worked out from the 20% rate printed"), text.slice(text.indexOf("Of which VAT"), text.indexOf("Of which VAT") + 200));
  check("...and the figure is flagged for a look", /VAT unclear|check|worked out/i.test(text));
  await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((l) => /Of which VAT/.test(l.textContent));
    const el = label.parentElement.querySelector("input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "4.80");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(200);
  text = await bodyText(page);
  check("typing a figure over it drops the worked-out note", !text.includes("worked out from the 20% rate"), text.slice(text.indexOf("Of which VAT"), text.indexOf("Of which VAT") + 120));

  vatAmount = 4.83; vatRate = 20;
  text = await scan();
  check("a printed figure is used as printed, with no note", (await vatBox()) === "4.83" && !text.includes("worked out from"), `${await vatBox()} / ${text.includes("worked out from")}`);

  vatAmount = null; vatRate = null;
  text = await scan();
  check("no figure and no rate: the box stays empty, no note", (await vatBox()) === "" && !text.includes("worked out from"), `${JSON.stringify(await vatBox())}`);
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
