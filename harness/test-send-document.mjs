// The route "Copy a document" emails its PDF through: on its own dev server,
// with a stand-in for Resend. Signed in only, a real PDF only, the sender's
// words only as a quoted note, replies to the sender.
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { startMockServer } from "./mock-server.mjs";
import puppeteer from "puppeteer-core";
import { UID, fakeSession, makeDb, newId, todayISO } from "./mockdb.mjs";

const WEB = "/Users/nasko/Desktop/INVOICE/web";
const PORT = 3311;
const MOCK = 3559;
const STUB = 3399;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const DL = new URL(".", import.meta.url).pathname + "downloads-send-document/";
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });
let browser;
const stub = { status: 200, sent: [] };
const stubServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    stub.sent.push({ path: req.url, body: JSON.parse(raw || "{}") });
    res.writeHead(stub.status, { "content-type": "application/json" });
    res.end(JSON.stringify(stub.status === 200 ? { id: "email_1" } : { message: "boom" }));
  });
});
stubServer.listen(STUB);
const db = makeDb();
Object.assign(db.tables, { receipts: [], receipt_pages: [], recurring_expenses: [], credit_notes: [], invoice_payments: [], recurring_invoices: [] });
// A one-pixel picture is a real picture as far as the PDF maker is concerned.
const DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
db.tables.receipts.push({ id: newId(), user_id: UID, vendor: "Jewson", category: "Materials", amount: 120, vat_amount: 24, currency: "GBP", date: todayISO(), document_type: "receipt", paid: true, details: {}, image_data_url: DOT, client_id: null, notes: "" });
const { server: mock } = startMockServer(MOCK, db);
const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key", RESEND_API_KEY: "fake-resend-key", RESEND_API_BASE: `http://127.0.0.1:${STUB}` },
  stdio: ["ignore", "pipe", "pipe"],
});

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n").toString("base64");
const post = (body, token = "harness-token") =>
  fetch(`${base}/api/send-document`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
const good = { to: "Someone@Example.com", filename: "Van insurance letter.pdf", pdf: PDF, message: "Here is the <b>letter</b>." };

try {
  for (let i = 0; i < 180; i++) {
    const res = await post({}, "").catch(() => null);
    if (res) { await res.text(); break; }
    await sleep(1000);
  }
  let res = await post(good, "");
  check("a stranger is refused", res.status === 401 && stub.sent.length === 0, String(res.status));
  res = await post({ ...good, to: "not an address" });
  check("a bad address is refused in words", res.status === 400 && /valid email address/.test((await res.json()).error));
  res = await post({ ...good, pdf: Buffer.from("hello, not a pdf").toString("base64") });
  check("anything but a PDF is refused", res.status === 400 && /must be the PDF/.test((await res.json()).error));
  res = await post({ ...good, filename: "letter.exe" });
  check("a name that isn't a .pdf is refused", res.status === 400);
  res = await post({ ...good, pdf: "A".repeat(4_000_001) });
  check("a file too large to email says what to do", res.status === 400 && /too large to email/.test((await res.json()).error));
  check("nothing refused reached Resend", stub.sent.length === 0, String(stub.sent.length));

  res = await post(good);
  const out = await res.json();
  const mail = stub.sent[0]?.body;
  check("a good one is sent, to the address given", res.status === 200 && out.sent === true && out.to === "someone@example.com" && mail?.to?.[0] === "someone@example.com", JSON.stringify(out));
  check("...from the app's documents address, replies to the sender", /documents@invoiceover\.com/.test(mail?.from ?? "") && mail?.reply_to === "harness@example.com", JSON.stringify({ f: mail?.from, r: mail?.reply_to }));
  check("...with the PDF attached under its name", mail?.attachments?.[0]?.filename === "Van insurance letter.pdf" && mail.attachments[0].content === PDF);
  check("...the subject says who sent what", mail?.subject === "harness@example.com sent you a document: Van insurance letter.pdf", mail?.subject);
  check("...the note quoted, and escaped in the HTML", mail?.text.includes("Their note:\nHere is the <b>letter</b>.") && mail.html.includes("&lt;b&gt;letter&lt;/b&gt;") && !mail.html.includes("<b>letter"), mail?.html);

  stub.status = 500;
  res = await post(good);
  check("Resend failing is a plain 'couldn't be sent'", res.status === 502 && /couldn't be sent/.test((await res.json()).error));
  stub.status = 200;

  // ---- Any document in the file library goes the same way (Atanas,
  // 2026-09-22: "every document scanned, created, uploaded, you should be
  // able to send it via email to anyone for free").
  browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900 });
  await page.evaluateOnNewDocument((key, session) => localStorage.setItem(key, JSON.stringify(session)), "sb-localhost-auth-token", fakeSession());
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });
  await page.goto(`${base}/files`, { waitUntil: "networkidle0", timeout: 180000 });
  await page.waitForFunction(() => document.body.innerText.includes("Jewson"), { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Jewson"))?.click());
  await sleep(600);
  const shown = await page.evaluate(() => document.body.innerText);
  check("a file opens with a way to save it and a way to email it", /Save it/.test(shown) && /Or email it to someone/.test(shown), shown.slice(0, 200));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save it")?.click());
  const saved = await (async () => {
    for (let i = 0; i < 60; i++) {
      const f = fs.readdirSync(DL).find((n) => n.endsWith(".pdf") && !n.endsWith(".crdownload"));
      if (f && fs.statSync(DL + f).size > 0) return f;
      await sleep(250);
    }
    return null;
  })();
  check("Save it makes one PDF, named after the document", !!saved && /^Jewson/.test(saved), String(saved));
  check("...and it really is a PDF", !!saved && fs.readFileSync(DL + saved).subarray(0, 5).toString() === "%PDF-");
  const before = stub.sent.length;
  await page.evaluate(() => {
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("#library-to", "friend@example.com");
    set("#library-message", "The receipt you asked for.");
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send")?.click();
  });
  await page.waitForFunction(() => /Sent to friend@example.com/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
  const sentMail = stub.sent.at(-1)?.body;
  check("emailing it sends the same file to the address typed", stub.sent.length === before + 1 && sentMail?.to?.[0] === "friend@example.com" && /^Jewson/.test(sentMail?.attachments?.[0]?.filename ?? ""), JSON.stringify({ to: sentMail?.to, name: sentMail?.attachments?.[0]?.filename }));
  check("...with the note quoted", (sentMail?.text ?? "").includes("The receipt you asked for."), (sentMail?.text ?? "").slice(0, 160));
  check("...and the page says it went", /Sent to friend@example.com/.test(await page.evaluate(() => document.body.innerText)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser?.close();
  app.kill();
  stubServer.close();
  mock.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
