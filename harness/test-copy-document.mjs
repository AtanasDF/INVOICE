// "Copy a document" (Atanas, 2026-09-22: a second scanner button on the free
// page for any paper, to export or send on). A stranger is asked to sign in;
// signed in: photos and files become pages, which can be moved and removed,
// then one PDF is saved, shared or emailed. The email route is mocked here
// (test-send-document runs the real one).
import fs from "node:fs";
import { createRequire } from "node:module";
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot } from "./mockdb.mjs";
const require = createRequire(import.meta.url);
const { PDFDocument } = require("/Users/nasko/Desktop/INVOICE/web/node_modules/pdf-lib/cjs/index.js");
const BASE = process.env.BASE ?? "http://localhost:3000";
const HERE = new URL(".", import.meta.url).pathname;
const DL = HERE + "downloads-copy/";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
let answer = { status: 200, body: { sent: true, to: "someone@example.com" } };
const sent = [];
const { browser, page } = await launchSignedIn(db, {
  base: BASE,
  profile: "profile-copy-document",
  intercept: (req, u) => {
    if (u.pathname !== "/api/send-document") return false;
    sent.push({ auth: req.headers().authorization ?? "", body: JSON.parse(req.postData() || "{}") });
    req.respond({ status: answer.status, headers: { "content-type": "application/json" }, body: JSON.stringify(answer.body) });
    return true;
  },
});
// A camera that shows a grey frame, so "Take photos" can open for real.
await page.evaluateOnNewDocument(() => {
  navigator.permissions.query = async () => ({ state: "granted", onchange: null });
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const ctx = c.getContext("2d");
    setInterval(() => { ctx.fillStyle = "#777"; ctx.fillRect(0, 0, 1280, 720); }, 100);
    return c.captureStream(10);
  };
});
const press = (text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim() === t && !x.disabled);
  if (!b) throw new Error("no button: " + t);
  b.click();
}, text);
const pagesShown = () => page.evaluate(() => [...document.querySelectorAll("main ol li")].length);
const upload = async (...files) => {
  const input = await page.$('input[type="file"]');
  await input.uploadFile(...files);
  await sleep(2500);
};
const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  fs.rmSync(DL, { recursive: true, force: true });
  fs.mkdirSync(DL, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });

  // Nothing works before an account (Atanas, 2026-09-22): a stranger is
  // sent to the front door, which is the sign-in page itself.
  await page.goto(`${BASE}/copy`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/copy`, { waitUntil: "networkidle0" });
  await sleep(700);
  let text = await bodyText(page);
  check("a stranger is sent to sign in, and gets no camera", new URL(page.url()).pathname === "/login" && !(await page.$('input[type="file"]')), page.url());
  check("...and the front door says what the app is for", (await page.goto(`${BASE}/`, { waitUntil: "networkidle0" })) && (await sleep(500)) === undefined && /Invoices, receipts and what you&#x27;re owed|Invoices, receipts and what you're owed/.test(await bodyText(page)), (await bodyText(page)).slice(0, 160));

  // Signed in.
  await signIn(page, BASE);
  await page.goto(`${BASE}/copy`, { waitUntil: "networkidle0" });
  await sleep(600);
  text = await bodyText(page);
  check("the page says what it does in plain words", text.includes("Copy a document") && text.includes("Photograph any paper"), text.slice(0, 200));
  await page.goto(`${BASE}/copy`, { waitUntil: "networkidle0" });
  await sleep(600);
  text = await bodyText(page);
  check("signed in: Take photos and Choose files", text.includes("Take photos") && text.includes("Choose files"), text.slice(0, 300));

  await press("Take photos");
  await page.waitForFunction(() => !!document.querySelector("video"), { timeout: 10000 }).catch(() => {});
  check("Take photos opens the camera", !!(await page.$("video")));
  await page.evaluate(() => document.querySelector('[aria-label="Back"]')?.click());
  await sleep(500);
  check("...and Back returns to the page", (await bodyText(page)).includes("Copy a document") && !(await page.$("video")));

  await upload(HERE + "uploads/doc1.pdf", HERE + "multi/usd.jpg", HERE + "multi/two-receipts.jpg");
  check("three files become three pages", (await pagesShown()) === 3 && (await bodyText(page)).includes("3 pages"), String(await pagesShown()));
  await page.evaluate(() => document.querySelector('[aria-label="Remove page 1"]').click());
  await sleep(200);
  check("a page can be removed", (await pagesShown()) === 2);
  await page.evaluate(() => {
    const el = document.querySelector("#copy-name");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "Van insurance: letter");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await press("Save the file");
  let file = null;
  for (let i = 0; i < 40 && !file; i++) { await sleep(250); file = fs.readdirSync(DL).find((f) => f.endsWith(".pdf")); }
  check("Save the file downloads one PDF named as typed, tidied", file === "Van insurance letter.pdf", String(file));
  if (file) {
    const pdf = await PDFDocument.load(fs.readFileSync(DL + file));
    const sizes = pdf.getPages().map((p) => p.getSize());
    check("...with a page per photo, in order", pdf.getPageCount() === 2, String(pdf.getPageCount()));
    check("...a portrait photo on an upright page, a landscape one on a turned page", sizes[0].height > sizes[0].width && sizes[1].width > sizes[1].height, JSON.stringify(sizes));
    fs.rmSync(DL + file);
  }

  // A file's own pages are copied in; the order can change.
  await upload(HERE + "uploads/doc2.pdf");
  check("more can be added after", (await pagesShown()) === 3);
  await page.evaluate(() => document.querySelector('[aria-label="Move page 3 earlier"]').click());
  await sleep(200);
  const order = await page.evaluate(() => [...document.querySelectorAll("main ol li")].map((li) => (li.querySelector("img") ? "photo" : "file")));
  check("a page can be moved", JSON.stringify(order) === '["photo","file","photo"]', JSON.stringify(order));

  // Share.
  await page.evaluate(() => {
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; };
  });
  await press("Share");
  await sleep(1500);
  const shared = await page.evaluate(() => window.__shared);
  check("Share hands the phone one PDF", shared && shared.name === "Van insurance letter.pdf" && shared.type === "application/pdf" && shared.size > 1000, JSON.stringify(shared));

  // Email.
  const setBox = (sel, v) => page.evaluate((s, val) => {
    const el = document.querySelector(s);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, sel, v);
  await setBox("#copy-to", "someone@example.com");
  await setBox("#copy-message", "Here is the letter.");
  await press("Send");
  await sleep(1500);
  text = await bodyText(page);
  const req = sent[0]?.body;
  check("Send posts the PDF, the address, the name and the note, signed in", !!req && req.to === "someone@example.com" && req.filename === "Van insurance letter.pdf" && req.message === "Here is the letter." && req.pdf.startsWith("JVBERi0") && sent[0].auth.startsWith("Bearer "), JSON.stringify(req && { to: req.to, f: req.filename, m: req.message, p: req.pdf.slice(0, 8) }));
  check("...and says where it went", text.includes("Sent to someone@example.com."), text.slice(-300));
  answer = { status: 400, body: { error: "The file is too large to email. Remove a page or two, or save it and share it another way." } };
  await setBox("#copy-to", "other@example.com");
  await press("Send");
  await sleep(1200);
  text = await bodyText(page);
  check("a refused send shows the route's own words", text.includes("The file is too large to email") && !!(await page.$('[role="alert"]')), text.slice(-300));
  check("fits 375px", await fits());
  await shot(page, "copy-document");
  await page.setViewport({ width: 320, height: 700 });
  await sleep(300);
  check("fits 320px", await fits());
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
  await shot(page, "copy-document-error");
} finally {
  await browser.close();
  fs.rmSync(DL, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
