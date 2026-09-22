// Saving a document in every shape it can take (Atanas, 2026-09-22: "I
// want to be able to save files in different formats - the more options the
// better even in the free version"). The free page needs no account, so
// that is where most of this runs; the same menu sits on an invoice in the
// app. Each file is opened and read, not just counted.
import fs from "node:fs";
import { makeDb, launchSignedIn, signIn, sleep, clickText, newId, UID, day, todayISO } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const HERE = new URL(".", import.meta.url).pathname;
const DL = HERE + "downloads-save-as/";
const DL2 = HERE + "downloads-save-as-app/";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

for (const dir of [DL, DL2]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], recurring_expenses: [], recurring_invoices: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", address: "1 Mill Lane\nLeeds\nLS1 4AP", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 30, bank_details: "Sort 12-34-56" });
const CLIENT = newId(), INVOICE = newId();
db.tables.clients.push({ id: CLIENT, user_id: UID, name: "Big Co Ltd", email: "pay@bigco.example", address: "2 Client Road\nLeeds", kind: "client", archived: false, is_company: true, reminders_enabled: true });
db.tables.invoices.push({ id: INVOICE, user_id: UID, client_id: CLIENT, date: day(-3), number: "INV-000029", items: [{ description: "Skim two ceilings", quantity: 2, unitPrice: 240, vatRate: "zero" }], notes: "Thanks", due_date: day(11), payment_terms: "14 days", status: "sent", tags: [], vat_registered: false, cis_rate: null });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 900, profile: "profile-save-as" });
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
const waitForFile = async (ending, ms = 25000, dir = DL) => {
  for (let i = 0; i < ms / 200; i++) {
    const f = fs.readdirSync(dir).find((n) => n.endsWith(ending) && !n.endsWith(".crdownload"));
    if (f && fs.statSync(dir + f).size > 0) {
      await sleep(250);
      return f;
    }
    await sleep(200);
  }
  return null;
};
const type = (match, value) =>
  page.evaluate((m, v) => {
    const el = [...document.querySelectorAll("input, textarea")].find((i) => new RegExp(m, "i").test(`${i.placeholder ?? ""} ${i.labels?.[0]?.textContent ?? ""} ${i.getAttribute("aria-label") ?? ""}`));
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, match, value);
const pickFormat = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(l) && x.closest("div")?.previousElementSibling?.textContent?.trim() !== undefined);
    const inMenu = [...document.querySelectorAll('[id] button')].find((x) => x.textContent.trim().startsWith(l));
    (inMenu ?? b)?.click();
    return !!(inMenu ?? b);
  }, label);
// Opening is a toggle, so it is only pressed when the list is closed.
const openSaveAs = () =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => ["Save as", "Saving…"].includes(x.textContent.trim()));
    if (b && b.getAttribute("aria-expanded") !== "true") b.click();
    return !!b;
  });

try {
  // ---- The free page: no account at all ----
  await signIn(page, BASE);
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("free-invoice-draft"));
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1000);
  await clickText(page, "Type it in");
  await sleep(800);
  await type("Your name|business name", "Nasko Plastering");
  await type("Who it'?s for|customer", "Big Co Ltd");
  await type("What you did|description", "Skim two ceilings");
  await type("How much|price|amount", "480");
  await sleep(600);
  await openSaveAs();
  await sleep(300);
  const listed = await page.evaluate(() => [...document.querySelectorAll('[id] button')].map((b) => b.textContent.trim()).filter((t) => /^(PDF|Picture|Smaller picture|Word|Web page|Plain text|Spreadsheet)/.test(t)));
  check("the free page offers seven ways to save", listed.length === 7 && listed[0].startsWith("PDF"), JSON.stringify(listed));

  const saved = {};
  for (const [label, ending] of [["Plain text", ".txt"], ["Spreadsheet", ".csv"], ["Web page", ".html"], ["Word", ".doc"], ["Picture", ".png"], ["Smaller picture", ".jpg"], ["PDF", ".pdf"]]) {
    await openSaveAs();
    await sleep(250);
    await pickFormat(label);
    const file = await waitForFile(ending);
    saved[ending] = file;
    check(`${label} saves a ${ending} file`, !!file, `${file}`);
  }
  const read = (ending) => (saved[ending] ? fs.readFileSync(DL + saved[ending]) : Buffer.alloc(0));
  const txt = read(".txt").toString();
  check("the text file holds the invoice, its line and its total", /Invoice/i.test(txt) && txt.includes("Skim two ceilings") && /480/.test(txt), txt.slice(0, 200));
  const csv = read(".csv").toString();
  check("the spreadsheet has a header row and the line, with the words as written", /^Description,Qty,Unit price,Amount$/m.test(csv) && csv.includes("Skim two ceilings"), csv.slice(0, 200));
  const html = read(".html").toString();
  check("the web page is a whole page with a table", html.startsWith("<!doctype html>") && html.includes("<table>") && html.includes("Skim two ceilings"), html.slice(0, 120));
  const word = read(".doc").toString();
  check("the Word file is the same document", word.includes("<table>") && word.includes("Skim two ceilings"));
  check("the picture is a real PNG", read(".png").subarray(0, 4).toString("hex") === "89504e47", read(".png").subarray(0, 4).toString("hex"));
  check("the smaller picture is a real JPEG", read(".jpg").subarray(0, 3).toString("hex") === "ffd8ff", read(".jpg").subarray(0, 3).toString("hex"));
  check("the PDF is a real PDF", read(".pdf").subarray(0, 5).toString() === "%PDF-", read(".pdf").subarray(0, 5).toString());
  check("the smaller picture really is smaller than the PNG", read(".jpg").length < read(".png").length, `${read(".jpg").length} < ${read(".png").length}`);
  check("every file is named after the invoice", Object.values(saved).every((n) => n && /^Invoice/.test(n)), JSON.stringify(saved));

  // ---- The same menu on an invoice in the app ----
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL2 });
  await page.goto(`${BASE}/invoices/${INVOICE}`, { waitUntil: "networkidle0" });
  await sleep(1500);
  await openSaveAs();
  await sleep(300);
  await pickFormat("Plain text");
  const appTxt = await waitForFile(".txt", 25000, DL2);
  check("an invoice in the app saves as text too", !!appTxt && appTxt.includes("INV-000029"), String(appTxt));
  const appText = appTxt ? fs.readFileSync(DL2 + appTxt, "utf8") : "";
  check("...with the business, the customer, the line and the amount due", /Nasko Plastering/.test(appText) && /Big Co Ltd/.test(appText) && /Skim two ceilings/.test(appText) && /480\.00/.test(appText), appText.slice(0, 300));
  check("...and nothing that only belongs on the screen", !/Marked part-paid|Save as|Download PDF/.test(appText), appText.slice(0, 300));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
  process.exit(0);
}
