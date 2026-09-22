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
  check("the headline and the promise", text.includes("Free tools") && text.includes("Make invoices and quotes, check a company, copy any paper. All free, nothing to pay."), text.slice(0, 200));
  // Every free tool on the one page, each a big button of its own with a
  // line saying what it does (Atanas, 2026-09-22).
  const buttons = await page.evaluate(() => {
    const info = (a) => ({
      label: a.textContent.trim(),
      href: new URL(a.href).pathname + new URL(a.href).search,
      h: Math.round(a.getBoundingClientRect().height),
      w: Math.round(a.getBoundingClientRect().width),
      size: parseFloat(getComputedStyle(a).fontSize),
      dark: getComputedStyle(a).backgroundColor,
    });
    return {
      tools: [...document.querySelectorAll("main li a")].map(info),
      width: window.innerWidth,
      h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize),
      body: [...document.querySelectorAll("main p")].map((p) => parseFloat(getComputedStyle(p).fontSize)),
    };
  });
  check(
    "the four free tools, in order, each to its own page",
    JSON.stringify(buttons.tools.map((b) => [b.label, b.href])) ===
      JSON.stringify([
        ["Make an invoice or a quote", "/free-invoice"],
        ["Start from an old invoice", "/login?next=%2Ffree-invoice%3Fstart%3Dphoto"],
        ["Check a company", "/check-company"],
        ["Copy a document", "/copy"],
      ]),
    JSON.stringify(buttons.tools.map((b) => [b.label, b.href]))
  );
  check(
    "each is a full-width button of at least 60px, bold, 20px",
    buttons.tools.length === 4 && buttons.tools.every((b) => b.h >= 60 && b.w >= buttons.width - 40 && b.size >= 20),
    JSON.stringify(buttons.tools)
  );
  check("one of them is the main one", buttons.tools.filter((b) => b.dark !== "rgb(255, 255, 255)").length === 1, JSON.stringify(buttons.tools.map((b) => b.dark)));
  check("the headline is 32px or more, nothing on the page under 16px", buttons.h1 >= 32 && buttons.body.every((s) => s >= 16), JSON.stringify({ h1: buttons.h1, body: buttons.body }));
  check(
    "each tool says in a line what it does, and which need a free sign-in",
    text.includes("Say what you did and what it costs. Print it, save it or send it.") &&
      text.includes("Take a photo of one you sent before. We fill in the next one for you to check.") &&
      text.includes("See if a company is real, still trading, and who runs it.") &&
      text.includes("Photograph any paper, or pick files, into one file to save, share or email.") &&
      (text.match(/Needs a free sign-in\./g) ?? []).length === 2,
    text.slice(0, 600)
  );
  check("the foot line about what we keep", text.includes("We keep nothing you make here. Save it or download it to keep it."));
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
  await page.evaluate(() => [...document.querySelectorAll("main a")].find((a) => a.textContent.trim() === "Make an invoice or a quote").click());
  await page.waitForFunction(() => location.pathname === "/free-invoice", { timeout: 10000 }).catch(() => {});
  check("Make an invoice goes to the free page", page.url().endsWith("/free-invoice"), page.url());

  // Someone signed in still gets their dashboard.
  await signIn(page, BASE);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(800);
  const home = await bodyText(page);
  check("signed in, the root is the dashboard, with the free tools among its own", /Dashboard/.test(home) && !home.includes("Free tools") && home.includes("Copy a document") && home.includes("Check a company"), home.slice(0, 300));
  // "Start from an old invoice" lands on the free page with the camera
  // already open, instead of the chooser asking the same question again.
  await page.evaluate(() => localStorage.removeItem("free-invoice-draft"));
  await page.goto(`${BASE}/free-invoice?start=photo`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const photo = await bodyText(page);
  check("arriving from Start from an old invoice opens the camera, not the chooser", !photo.includes("How would you like to start?"), photo.slice(0, 200));
  check("...and the address is tidied, so a reload doesn't open it again", new URL(page.url()).search === "", page.url());
  await page.goto(`${BASE}/free-invoice`, { waitUntil: "networkidle0" });
  await sleep(900);
  check("the free page on its own still asks how to start", (await bodyText(page)).includes("How would you like to start?"));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
