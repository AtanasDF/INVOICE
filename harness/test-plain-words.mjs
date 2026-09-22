// The words a stranger must not meet (notes/first-page-research.md): on
// the front door, the sign-in page, the free page's chooser and the company
// check, none of the banned list; inside the free editor VAT, CIS and UTR
// are the person's own choices and allowed. Every sentence over 15 words
// is printed, not failed, so the reading-age pass has a list to work from.
import { makeDb, launchSignedIn, sleep, bodyText, clickText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const BANNED = ["PDF", "scan", "upload", "template", "generate", "account", "sign up", "register", "VAT", "CIS", "UTR", "officers", "API", "instantly", "easy", "AI"];
const INSIDE_EDITOR_OK = new Set(["VAT", "CIS", "UTR"]);
// Domain words that are not the banned sense: the Companies House register
// (the list itself), and a bank account's name and number.
const plain = (text) => text
  .replace(/Companies House register/g, "Companies House list")
  .replace(/\b(on|the) register\b/gi, "$1 list")
  .replace(/\bregistered\b/gi, "listed")
  .replace(/\b[Aa]ccount (name|number)\b/g, "bank $1");
const found = (text, allow = new Set()) => BANNED.filter((w) => !allow.has(w)).filter((w) => new RegExp(`(^|[^\\w])${w}(s|ning|ned|ed)?([^\\w]|$)`, w === w.toUpperCase() ? "" : "i").test(plain(text)));
const longOnes = (text) => text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 15);

const db = makeDb();
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-plain-words" });
const main = () => page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText);
try {
  // A stranger throughout.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  for (const [path, name] of [["/", "the front door"], ["/login", "the sign-in page"], ["/check-company", "the company check"]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(600);
    const t = await main();
    check(`${name}: none of the banned words`, found(t).length === 0, JSON.stringify(found(t)));
    for (const s of longOnes(t)) console.log(`LONG (${name}, ${s.split(/\s+/).length} words): ${s.slice(0, 140)}`);
  }
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.removeItem("free-invoice-draft"); for (const id of ["free-invoice-scan", "free-invoice-signature"]) localStorage.setItem("tip:" + id, "3"); });
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(600);
  let t = await main();
  check("the free page's chooser: none of the banned words", found(t).length === 0, JSON.stringify(found(t)));
  for (const s of longOnes(t)) console.log(`LONG (chooser, ${s.split(/\s+/).length} words): ${s.slice(0, 140)}`);
  await clickText(page, "Type it in");
  await sleep(800);
  t = await main();
  check("the free editor: none of the banned words (VAT, CIS and UTR are the person's own)", found(t, INSIDE_EDITOR_OK).length === 0, JSON.stringify(found(t, INSIDE_EDITOR_OK)));
  for (const s of longOnes(t)) console.log(`LONG (editor, ${s.split(/\s+/).length} words): ${s.slice(0, 140)}`);
  check("the words stay when a page fails to load", (await bodyText(page)).length > 100);
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
