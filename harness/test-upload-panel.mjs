// The upload tile, with three doors instead of one door and a question
// (Atanas, 2026-09-24: "it should give you three buttons... so you don't have
// to click three times").
//
// And the two ways in that cost no buttons: drag a file onto it, or paste a
// screenshot. Those matter because the case he described -- a receipt on a
// website you cannot download from -- is solved by a screenshot, not by
// anything we could build.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const TOKEN = "abcdefghijklmnopqrstuvwx";
const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1, inbox_token: TOKEN });

const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-upload-panel" });
const panel = () => page.evaluate(() => document.querySelector('[aria-label="Upload a document"]')?.innerText ?? "");
const buttons = () => page.evaluate(() =>
  [...(document.querySelector('[aria-label="Upload a document"]')?.querySelectorAll("button") ?? [])].map((b) => b.textContent.trim()));

try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1500);

  const b = await buttons();
  check("three doors, not one and a question", b.length === 3, JSON.stringify(b));
  check("...Photos first, because it is the one that works on every phone", /Photos/.test(b[0] ?? ""), JSON.stringify(b));
  check("...then Files", /Files/.test(b[1] ?? ""), JSON.stringify(b));
  check("...then Email it in", /Email it in/.test(b[2] ?? ""), JSON.stringify(b));

  const t = await panel();
  check("it still says what it is", /Upload a document/.test(t), t.slice(0, 120));
  check("dragging and pasting are mentioned once, quietly", /drag files here/.test(t) && /paste a screenshot/.test(t), t.slice(0, 300));

  // --- the address that was buried in Settings ---
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => /Email it in/.test(x.textContent))?.click());
  await sleep(400);
  const opened = await panel();
  check("Email it in shows the address itself, not a link to go and find it", opened.includes(`${TOKEN}@`), opened.slice(0, 300));
  check("...and says plainly what happens to what you send", /Needs review/.test(opened) && /yours alone/i.test(opened), opened.slice(0, 300));
  check("...with a way to copy it, since nobody retypes an address like that", /Copy the address/.test(opened), opened.slice(0, 300));

  // --- the paste route ---
  const pasteWorked = await page.evaluate(async () => {
    const dt = new DataTransfer();
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    dt.items.add(new File([png], "shot.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1200));
    return location.pathname + location.search;
  });
  check("pasting a screenshot takes it straight to the reader", /\/scan/.test(pasteWorked), pasteWorked);

  // --- the drop route ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const dropWorked = await page.evaluate(async () => {
    const el = document.querySelector('[aria-label="Upload a document"]');
    const dt = new DataTransfer();
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    dt.items.add(new File([png], "dropped.png", { type: "image/png" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1200));
    return location.pathname;
  });
  check("dropping a file on it does the same", /\/scan/.test(dropWorked), dropWorked);

  // --- something that is not a document ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(1200);
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Upload a document"]');
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "notes.txt", { type: "text/plain" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await sleep(700);
  const refused = await panel();
  check("dropping something that is not a document says so, in words", /isn't a photo or a PDF/.test(refused), refused.slice(0, 300));
  check("...and stays on the page rather than going anywhere", new URL(page.url()).pathname === "/", page.url());
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
