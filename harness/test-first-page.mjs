// The front door for a stranger (notes/first-page-research.md): no bounce
// to the sign-in form, two big buttons that say what they do, big type,
// no words from the banned list, and the dashboard untouched for someone
// signed in.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, shot } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const BANNED = ["PDF", "scan", "upload", "template", "generate", "account", "sign up", "register", "VAT", "CIS", "UTR", "officers", "API", "instantly", "easy"];

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], credit_notes: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: "x", business_name: "Nasko Plastering", vat_registered: false, custom_categories: [], invoice_prefix: "INV-", invoice_next_number: 1 });
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-first-page" });

try {
  // A stranger.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(800);
  const text = await bodyText(page);
  check("a stranger stays on the front door, not bounced to sign-in", page.url() === `${BASE}/` && !/Welcome back/.test(text), page.url());
  check("the headline and the promise", text.includes("Make an invoice. Check a company.") && text.includes("Both are free. Nothing to join. Nothing to pay."), text.slice(0, 200));
  const buttons = await page.evaluate(() => {
    const big = (t) => [...document.querySelectorAll("main a")].find((a) => a.textContent.trim() === t);
    const info = (a) => (a ? { href: new URL(a.href).pathname, h: Math.round(a.getBoundingClientRect().height), w: Math.round(a.getBoundingClientRect().width), size: parseFloat(getComputedStyle(a).fontSize), weight: getComputedStyle(a).fontWeight } : null);
    return { make: info(big("Make an invoice")), checkCo: info(big("Check a company")), width: window.innerWidth, h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize), body: [...document.querySelectorAll("main p")].map((p) => parseFloat(getComputedStyle(p).fontSize)) };
  });
  check("Make an invoice is a full-width button of at least 60px, bold, 20px, to the free page", buttons.make && buttons.make.href === "/free-invoice" && buttons.make.h >= 60 && buttons.make.w >= buttons.width - 40 && buttons.make.size >= 20 && Number(buttons.make.weight) >= 700, JSON.stringify(buttons.make));
  check("Check a company is the same size, to the company check", buttons.checkCo && buttons.checkCo.href === "/check-company" && buttons.checkCo.h >= 60 && buttons.checkCo.size >= 20, JSON.stringify(buttons.checkCo));
  check("the headline is 32px or more, nothing on the page under 16px", buttons.h1 >= 32 && buttons.body.every((s) => s >= 16), JSON.stringify({ h1: buttons.h1, body: buttons.body }));
  check("each button has its one-line explanation", text.includes("Say what you did and what it costs. Then print it or email it.") && text.includes("See if a company is real, still trading, and who runs it."));
  check("the foot line about what we keep", text.includes("We do not keep anything you type unless you ask us to."));
  const main = await page.evaluate(() => document.querySelector("main").innerText);
  const found = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, w === w.toUpperCase() ? "" : "i").test(main));
  check("none of the banned words on the page", found.length === 0, JSON.stringify(found));
  check("Sign in is in the header for the one who has one", /Sign in/.test(text));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(page, "first-page");
  await page.setViewport({ width: 320, height: 640 });
  await sleep(300);
  check("fits 320px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 375, height: 812 });

  // Tapping through works before anything else loads: plain links.
  await page.evaluate(() => [...document.querySelectorAll("main a")].find((a) => a.textContent.trim() === "Make an invoice").click());
  await page.waitForFunction(() => location.pathname === "/free-invoice", { timeout: 10000 }).catch(() => {});
  check("Make an invoice goes to the free page", page.url().endsWith("/free-invoice"), page.url());

  // Someone signed in still gets their dashboard.
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(800);
  const home = await bodyText(page);
  check("signed in, the root is the dashboard", /Dashboard/.test(home) && !home.includes("Make an invoice. Check a company."), home.slice(0, 200));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
