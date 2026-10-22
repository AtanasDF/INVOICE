// The public website (notes/website-plan.md): open to a stranger, every page
// leads to making an account, nothing runs off a phone, and the figures it
// quotes are the app's own -- read from the code that enforces them, so a
// changed allowance or rate turns this red instead of leaving the site wrong.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { APP } from "./repo.mjs";
const BASE = process.env.BASE ?? "http://localhost:3100";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const PAGES = ["/features", "/pricing", "/drivers", "/faq"];
const migration = fs.readFileSync(`${APP}/supabase/migration-036-scan-limits.sql`, "utf8");
const mileage = fs.readFileSync(`${APP}/src/lib/mileage.ts`, "utf8");
check("the allowance the site quotes is the one the database enforces",
  /day_limit := 300;/.test(migration) && /day_limit := 50;/.test(migration) && /600/.test(migration));
check("the mileage rates the site quotes are the app's", /car: \{ first: 0\.45, after: 0\.25, threshold: 10000 \}/.test(mileage));

const browser = await puppeteer.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  for (const path of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 600));
    const got = await page.evaluate(() => ({
      at: location.pathname,
      h1: document.querySelectorAll("h1").length,
      start: [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Start free").map((a) => a.getAttribute("href")),
      wide: document.documentElement.scrollWidth,
      nav: [...document.querySelectorAll('nav[aria-label="Website"] a')].map((a) => a.getAttribute("href")),
      text: document.body.innerText,
    }));
    check(`${path}: a stranger stays on it`, got.at === path, got.at);
    check(`${path}: one headline`, got.h1 === 1, got.h1);
    check(`${path}: Start free leads to making an account`, got.start.length > 0 && got.start.every((h) => h === "/login?new=1"), JSON.stringify(got.start));
    check(`${path}: nothing runs off a phone`, got.wide <= 390, got.wide);
    check(`${path}: the header leads round the site`, ["/features", "/pricing", "/drivers", "/login"].every((h) => got.nav.includes(h)), JSON.stringify(got.nav));
    // The promises that must never creep in: it files nothing, takes no card
    // payments itself, and is not promised free for ever.
    check(`${path}: no promise the app can't keep`, !/for ever|forever|MTD|Making Tax Digital ready|we take card|lifetime/i.test(got.text), (got.text.match(/for ever|forever|MTD|lifetime/i) ?? [""])[0]);
    if (path === "/pricing") check("pricing: the allowance, in the words people read", /300 documents a day/.test(got.text) && /50 a day and 600 a month/.test(got.text));
    if (path === "/drivers" || path === "/features") check(`${path}: the mileage rate`, /45p a mile for the first 10,000/.test(got.text) && /25p/.test(got.text));
  }
  // Every picture the site shows is really there.
  const shots = new Set();
  for (const f of ["features", "drivers"]) for (const m of fs.readFileSync(`${APP}/src/app/${f}/page.tsx`, "utf8").matchAll(/"(\/site\/[\w-]+\.webp)"/g)) shots.add(m[1]);
  check("every picture on the site exists", shots.size >= 6 && [...shots].every((s) => fs.existsSync(`${APP}/public${s}`)), JSON.stringify([...shots].filter((s) => !fs.existsSync(`${APP}/public${s}`))));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
if (results.some((r) => !r)) process.exitCode = 1;
