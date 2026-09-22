// Change a file (Atanas, 2026-09-22: "every file needs to be able to be
// turned into every other file so the app works as a file transformer
// too"). Real files go in, real files come out, and each one is opened and
// checked: a picture, a PDF of three pages, and a spreadsheet.
import fs from "node:fs";
// The app's own page counter, compiled into gen/ by the runner.
import { pdfPageCount } from "./gen/lib/pdfPages.js";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const HERE = new URL(".", import.meta.url).pathname;
const DL = HERE + "downloads-convert/";
const CSV = HERE + "downloads-convert/prices.csv";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
fs.writeFileSync(CSV, 'Item,Price,Note\nPlasterboard,8.95,"Gyproc, or the same"\nPlaster,11.50,\n');
const db = makeDb();
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 900, profile: "profile-convert" });
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
const waitFor = async (ending, ms = 40000) => {
  for (let i = 0; i < ms / 200; i++) {
    const f = fs.readdirSync(DL).find((n) => n.endsWith(ending) && !n.endsWith(".crdownload") && n !== "prices.csv");
    if (f && fs.statSync(DL + f).size > 0) {
      await sleep(250);
      return f;
    }
    await sleep(200);
  }
  return null;
};
const clear = () => {
  for (const f of fs.readdirSync(DL)) if (f !== "prices.csv") fs.rmSync(DL + f);
};
const choose = async (...paths) => {
  const input = await page.$('input[type="file"]');
  await input.uploadFile(...paths);
  await sleep(700);
};
const press = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t));
    b?.click();
    return !!b;
  }, text);
// Changing a file shows what came out; saving it is the next tap.
const saveMade = async () => {
  await page.waitForFunction(() => /(is|are) ready/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Save").forEach((b) => b.click()));
  await sleep(400);
};

const reset = async () => {
  await page.goto(`${BASE}/convert`, { waitUntil: "networkidle0" });
  await sleep(600);
  clear();
};

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/convert`, { waitUntil: "networkidle0" });
  await sleep(800);
  const opening = await bodyText(page);
  check("the page says what it does and that nothing leaves the device", opening.includes("Change a file") && /nothing is sent anywhere/.test(opening), opening.slice(0, 200));

  // ---- A picture ----
  await choose(HERE + "uploads/card.png");
  let shown = await bodyText(page);
  check("a picture is named and recognised", shown.includes("card.png") && /picture/.test(shown), shown.slice(0, 300));
  const offers = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim().split(" .")[0]).filter((t) => ["PDF", "Picture", "Smaller picture", "Web picture", "Plain text", "Spreadsheet", "Data", "Web page"].some((l) => t.startsWith(l))));
  check("...and can become a PDF or any of the picture kinds, but not a spreadsheet", offers.some((o) => o.startsWith("PDF")) && offers.some((o) => o.startsWith("Smaller picture")) && offers.some((o) => o.startsWith("Web picture")) && !offers.some((o) => o.startsWith("Spreadsheet")), JSON.stringify(offers));
  await press("Smaller picture");
  await saveMade();
  let file = await waitFor(".jpg");
  check("a picture becomes a JPEG, named after it", !!file && file === "card.jpg", String(file));
  check("...and it really is a JPEG", !!file && fs.readFileSync(DL + file).subarray(0, 3).toString("hex") === "ffd8ff");

  clear();
  await press("PDF");
  await saveMade();
  file = await waitFor(".pdf");
  check("the same picture becomes a PDF", !!file && fs.readFileSync(DL + file).subarray(0, 5).toString() === "%PDF-", String(file));

  // ---- Two pictures into one PDF ----
  await reset();
  await choose(HERE + "uploads/card.png", HERE + "uploads/copy.jpg");
  await press("PDF");
  await saveMade();
  file = await waitFor(".pdf");
  const twoPages = file ? await pdfPageCount(`data:application/pdf;base64,${fs.readFileSync(DL + file).toString("base64")}`) : 0;
  check("two pictures make one PDF of two pages", !!file && /and 1 more/.test(file) && twoPages === 2, `${file} ${twoPages}`);

  // ---- A PDF ----
  await reset();
  await choose(HERE + "uploads/doc1.pdf");
  shown = await bodyText(page);
  check("a PDF is recognised", shown.includes("doc1.pdf") && /PDF ·/.test(shown), shown.slice(0, 300));
  await press("Picture");
  await saveMade();
  file = await waitFor(".png");
  check("a PDF's page comes out as a picture", !!file && /^doc1/.test(file) && fs.readFileSync(DL + file).subarray(0, 4).toString("hex") === "89504e47", String(file));
  clear();
  await press("Plain text");
  await saveMade();
  file = await waitFor(".txt");
  const words = file ? fs.readFileSync(DL + file, "utf8") : "";
  check("...and its words come out as text", !!file && /Invoice one/i.test(words), JSON.stringify(words.slice(0, 120)));

  // ---- A spreadsheet ----
  await reset();
  await choose(CSV);
  await press("Data");
  await saveMade();
  file = await waitFor(".json");
  const data = file ? JSON.parse(fs.readFileSync(DL + file, "utf8")) : null;
  check("a spreadsheet becomes data, one row at a time", Array.isArray(data) && data.length === 2 && data[0].Item === "Plasterboard" && data[0].Price === "8.95" && data[0].Note === "Gyproc, or the same", JSON.stringify(data));
  clear();
  await press("PDF");
  await saveMade();
  file = await waitFor(".pdf");
  check("...and the same rows can become a PDF", !!file && fs.readFileSync(DL + file).subarray(0, 5).toString() === "%PDF-", String(file));
  clear();
  await press("Web page");
  await saveMade();
  file = await waitFor(".html");
  const html = file ? fs.readFileSync(DL + file, "utf8") : "";
  check("...or a web page with the rows in a table", !!file && html.includes("<table>") && html.includes("Plasterboard"), html.slice(0, 160));

  // ---- Something we can't change ----
  await reset();
  fs.writeFileSync(DL + "notes.zip", "PK\u0003\u0004nothing");
  await choose(DL + "notes.zip");
  shown = await bodyText(page);
  check("a kind we can't change says so plainly", /We can change pictures, PDFs, and files of words or rows\. That one we can't\./.test(shown), shown.slice(0, 400));
  check("fits 375px", await page.setViewport({ width: 375, height: 900 }).then(() => sleep(300)).then(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
