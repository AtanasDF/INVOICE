// The front door: a plain page that says what the app is for, with the
// sign-in and the new-account boxes on it, and nothing else working before
// an account (Atanas, 2026-09-22: "nothing should work before the user
// register... a plain page with some nice advertising of the app and the
// log in rectangulars"). Words and sizes follow notes/first-page-research.md.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
// "account" and "sign in" have to be said here; the rest of the jargon does not.
const BANNED = ["scan", "upload", "template", "generate", "API", "instantly", "easy", "CIS", "UTR", "officers"];

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Nasko Plastering", vat_registered: false, custom_categories: [], invoice_prefix: "INV-", invoice_next_number: 1 });
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-first-page" });

try {
  // A stranger.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(900);
  const text = await bodyText(page);
  check("a stranger stays on the front door", page.url() === `${BASE}/`, page.url());
  check("the headline says what it is for", text.includes("Invoices, receipts and what you're owed, in one place."), text.slice(0, 200));
  check("...and that an account is free and quick", text.includes("Make an account and it's all yours. Free, and it takes a minute."), text.slice(0, 300));
  check(
    "five short lines say what it does",
    ["Make an invoice or a quote", "Photograph a receipt or a bill", "Check a company", "Copy any paper", "See what you're owed"].every((l) => text.includes(l)),
    text.slice(0, 600)
  );
  check("and what you can save it as", text.includes("as a PDF, a picture, a Word file or a spreadsheet"), text.slice(0, 700));

  // The boxes themselves.
  const box = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => ({ text: t.textContent.trim(), on: t.getAttribute("aria-selected") === "true" }));
    const labels = [...document.querySelectorAll("main label")].map((l) => l.textContent.trim());
    const fields = [...document.querySelectorAll("main input")].map((i) => ({ type: i.type, name: i.name }));
    const submit = [...document.querySelectorAll("main form button")].map((b) => b.textContent.trim());
    return { tabs, labels, fields, submit, h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize), body: [...document.querySelectorAll("main p, main li")].map((p) => parseFloat(getComputedStyle(p).fontSize)) };
  });
  check("two choices, signing in first and marked", JSON.stringify(box.tabs) === JSON.stringify([{ text: "Sign in", on: true }, { text: "New here", on: false }]), JSON.stringify(box.tabs));
  check("signing in asks for an email and a password, both labelled", JSON.stringify(box.labels) === JSON.stringify(["Your email", "Password"]) && box.fields.some((f) => f.name === "email") && box.fields.some((f) => f.name === "password"), JSON.stringify(box));
  check("the button says what it does", box.submit.includes("Sign me in"), JSON.stringify(box.submit));
  check("the headline is 32px or more, nothing on the page under 16px", box.h1 >= 32 && box.body.every((s) => s >= 16), JSON.stringify({ h1: box.h1, body: box.body }));

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === "New here")?.click());
  await sleep(300);
  const made = await page.evaluate(() => ({
    heading: [...document.querySelectorAll("main h2")].map((h) => h.textContent.trim()),
    labels: [...document.querySelectorAll("main label")].map((l) => l.textContent.trim()),
    submit: [...document.querySelectorAll("main form button")].map((b) => b.textContent.trim()),
    says: document.body.innerText,
  }));
  check("making an account asks for the password twice, in plain words", JSON.stringify(made.labels) === JSON.stringify(["Your email", "Make a password", "Type the password again"]), JSON.stringify(made.labels));
  check("...and says what happens next", made.heading.includes("Make an account") && made.says.includes("It's free. We'll send one email to check it's you.") && made.submit.includes("Make my account"), JSON.stringify(made.heading) + JSON.stringify(made.submit));

  const main = await page.evaluate(() => document.querySelector("main").innerText);
  const found = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, w === w.toUpperCase() ? "" : "i").test(main));
  check("none of the banned words on the page", found.length === 0, JSON.stringify(found));
  await shot(page, "first-page");
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 320, height: 640 });
  await sleep(300);
  check("fits 320px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 375, height: 812 });

  // Nothing else works before an account.
  const shut = [];
  for (const path of ["/free-invoice", "/check-company", "/copy", "/receipts", "/invoices", "/settings"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await sleep(600);
    shut.push([path, new URL(page.url()).pathname]);
  }
  check("every other page sends a stranger to sign in", shut.every(([, landed]) => landed === "/login"), JSON.stringify(shut));

  // Someone signed in gets their dashboard, with the tools on it.
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(900);
  const home = await bodyText(page);
  check("signed in, the root is the dashboard with the tools on it", /Dashboard/.test(home) && home.includes("Make an invoice") && home.includes("Copy a document") && home.includes("Check a company") && !home.includes("Make an account"), home.slice(0, 300));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
