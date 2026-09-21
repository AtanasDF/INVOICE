// The free "Check a company" page, driven in headless Chrome against a
// stand-in Companies House API (ch-fixtures.mjs). The app's own route,
// rate limiter and report building all run for real.
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { startFixtures } from "./ch-fixtures.mjs";

const OUT = new URL(".", import.meta.url).pathname;
// The app this suite starts. It used to point at
// .claude/worktrees/check-company/web -- the branch this feature was
// written on -- so it had been testing a frozen copy of the code ever
// since that branch merged, and would have stayed green whatever changed
// in main. (It also breaks outright the day those worktrees are deleted,
// which is on the list.)
const WEB = "/Users/nasko/Desktop/INVOICE/web";
const PORT = 3307;
const FIX = 3399;
const KEY = "fixture-key-never-shown";
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `— ${detail ?? ""}`);
};

async function startApp(withKey) {
  const env = { ...process.env, COMPANIES_HOUSE_API_BASE: `http://127.0.0.1:${FIX}`, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:5555", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key", SUPABASE_SERVICE_ROLE_KEY: "" };
  if (withKey) env.COMPANIES_HOUSE_API_KEY = KEY;
  else delete env.COMPANIES_HOUSE_API_KEY;
  const proc = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr.on("data", (d) => process.env.VERBOSE && console.log("dev:", String(d).trim()));
  for (let i = 0; i < 180; i++) {
    const res = await fetch(`${base}/api/company-check`).catch(() => null);
    if (res) {
      await res.text();
      return proc;
    }
    await sleep(1000);
  }
  throw new Error("dev server never answered");
}

async function stopApp(proc) {
  proc.kill("SIGTERM");
  await new Promise((r) => proc.once("exit", r));
  await sleep(500);
}

const calls = () => fetch(`http://127.0.0.1:${FIX}/__calls`).then((r) => r.json());
const resetCalls = () => fetch(`http://127.0.0.1:${FIX}/__reset`).then((r) => r.json());

const fixtures = await startFixtures(FIX);
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  userDataDir: OUT + "profile-check-company",
  args: ["--no-first-run"],
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
await page.evaluateOnNewDocument(() => {
  window.__copied = null;
  window.__shared = null;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => void (window.__copied = t) } });
  navigator.share = async (d) => void (window.__shared = d);
});
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

const shot = (name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
const text = (sel = "body") => page.evaluate((s) => document.querySelector(s)?.innerText ?? "", sel);
const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const waitFor = (sel) => page.waitForSelector(sel, { timeout: 20000 });
async function ask(q) {
  await page.click("#company-query", { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type("#company-query", q);
  await page.click('button[type="submit"]');
}
const clickText = (t) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((x) => x.innerText.trim().startsWith(t));
    el?.click();
    return !!el;
  }, t);

let app = await startApp(false);
try {
  // ---- Without the key ----
  const off = await fetch(`${base}/api/company-check?q=acme`).then((r) => r.json());
  check("route says it isn't configured, and looks nothing up", off.configured === false && !off.items, JSON.stringify(off));
  check("no company was asked for", (await calls()).length === 0);

  await page.goto(`${base}/check-company`, { waitUntil: "networkidle0" });
  await waitFor('[data-testid="not-configured"]');
  const offText = await text("body");
  check("the page explains the lookup isn't on", /isn't switched on yet/.test(offText), offText.slice(0, 200));
  check("it offers the Companies House register instead", /Open the Companies House register/.test(offText));
  check("the button searches Companies House instead of erroring", (await page.$eval('a[href*="find-and-update"]', (a) => a.href)).includes("/search?q="));
  check("nothing looks broken", !/error|failed|undefined/i.test(offText), offText.slice(0, 200));
  await shot("check-company-not-configured");

  await stopApp(app);
  app = await startApp(true);
  await resetCalls();

  // ---- Search by name ----
  await page.goto(`${base}/check-company`, { waitUntil: "networkidle0" });
  await ask("acme");
  await waitFor('[data-testid="hits"]');
  const hits = await text('[data-testid="hits"]');
  check("a name search lists the matches", /3 matches/.test(hits) && /Acme Building Services Ltd/i.test(hits), hits.slice(0, 200));
  check("each match shows number, status and address", /Company 12345678/.test(hits) && /liquidation/.test(hits) && /dissolved/.test(hits) && /Mill Lane/.test(hits), hits);
  await shot("check-company-search");

  // ---- An active company ----
  await clickText("Acme Building Services Ltd");
  await waitFor('[data-testid="report"]');
  let body = await text("body");
  check("the headline names the company as registered", /ACME BUILDING SERVICES LTD/.test(body) && /12345678/.test(body), body.slice(0, 300));
  check("status, type and age are there", /Active/.test(body) && /Private limited company/.test(body) && /six years old/.test(body), body.slice(0, 400));
  const summary = await text('[data-testid="summary"]');
  check("plain English for an active company", summary === "What this means\nActive, filing on time, three officers, registered for six years.", JSON.stringify(summary));
  check("SIC codes are in plain English", /Plumbing, heat and air-conditioning installation/.test(body) && /SIC 43220/.test(body), body);
  const officers = await text('[data-testid="officers"]');
  check("current officers with roles, and the resignations counted", /Three current officers/.test(officers) && /two resignations/.test(officers) && /HOLT, Sarah Jane/.test(officers) && /Director/.test(officers), officers);
  check("a resigned officer isn't listed as current", !/GONE, Former/.test(officers), officers);
  const control = await text('[data-testid="control"]');
  check("who owns it, in the register's words", /Sarah Jane Holt/.test(control) && /Ownership of shares . 75% or more/.test(control), control);
  check("filings show last filed and next due", /Last filed, made up to/.test(body) && /Next due/.test(body) && /Micro Entity/.test(body), body);
  check("nothing is invented: no charges, insolvency or previous names here", !(await has('[data-testid="charges"]')) && !(await has('[data-testid="insolvency"]')) && !(await has('[data-testid="previous-names"]')));
  check("no empty values leak through", !/\b(undefined|null|NaN|Invalid Date)\b/.test(body), (body.match(/.{0,40}(undefined|null|NaN|Invalid Date).{0,40}/) ?? [])[0]);
  check("the API key never reaches the browser", !(await page.content()).includes(KEY));
  await shot("check-company-report");

  // ---- Website and social searches ----
  const links = await page.$$eval('[data-testid="search-links"] a', (as) => as.map((a) => ({ href: a.href, target: a.target, label: a.innerText })));
  check("prepared searches open in a new tab", links.length >= 6 && links.every((l) => l.target === "_blank"), JSON.stringify(links.map((l) => l.label)));
  check("they search the exact registered name", links.every((l) => decodeURIComponent(l.href).includes("ACME BUILDING SERVICES LTD")), JSON.stringify(links.map((l) => l.href)));
  check("the usual networks are covered", ["linkedin", "facebook", "instagram", "x.com", "trustpilot"].every((n) => links.some((l) => decodeURIComponent(l.href).includes(n))), JSON.stringify(links.map((l) => l.href)));
  check("they are labelled as searches, not checks", /these are searches, not checks/i.test(await text('[data-testid="search-links"]')));

  // ---- Copy and share ----
  await clickText("Copy the report");
  await sleep(300);
  const copied = await page.evaluate(() => window.__copied);
  check("Copy the report copies the whole thing", copied?.includes("ACME BUILDING SERVICES LTD") && copied.includes("Company 12345678") && copied.includes("Active, filing on time, three officers") && copied.includes("find-and-update.company-information.service.gov.uk/company/12345678"), (copied ?? "").slice(0, 300));
  check("the copied report says where it came from", /From the public|From the Companies House register, checked/.test(copied ?? ""), (copied ?? "").slice(-200));
  check("the button says it copied", /Copied/.test(await text('[data-testid="report"]')));
  await clickText("Share");
  await sleep(300);
  const shared = await page.evaluate(() => window.__shared);
  check("Share hands the same report to the share sheet", shared?.text === copied && /ACME BUILDING SERVICES LTD/.test(shared?.title ?? ""), JSON.stringify(shared?.title));

  // ---- Cached, so a second look costs nothing ----
  await resetCalls();
  await page.goto(`${base}/check-company?number=12345678`, { waitUntil: "networkidle0" });
  await waitFor('[data-testid="report"]');
  check("a shared link opens the report", /ACME BUILDING SERVICES LTD/.test(await text('[data-testid="report"]')));
  check("a repeat look asks Companies House nothing", (await calls()).filter((c) => c.path.startsWith("/company/")).length === 0, JSON.stringify(await calls()));

  // ---- Search by number ----
  await page.goto(`${base}/check-company`, { waitUntil: "networkidle0" });
  await ask("11112222");
  await waitFor('[data-testid="report"]');
  body = await text("body");
  check("a company number goes straight to the report", /LATE FILINGS LTD/.test(body) && !(await has('[data-testid="hits"]')), body.slice(0, 200));
  const late = await text('[data-testid="summary"]');
  check("overdue filings are stated plainly", /Active, with filings overdue, one officer, registered for two years\./.test(late) && /Accounts are overdue by four months/.test(late) && /confirmation statement.*overdue by three weeks/s.test(late), late);
  check("an Overdue badge sits on each late filing", (await page.$$eval('[data-testid="filings"] span', (ss) => ss.filter((s) => /Overdue/.test(s.innerText)).length)) === 2);
  check("a formation-agent address is pointed out", /well-known company formation address/.test(await text('[data-testid="address"]')), await text('[data-testid="address"]'));
  check("previous names are listed", /FIRST NAME LTD/.test(await text('[data-testid="previous-names"]')) && /two other names/.test(late), late);
  await shot("check-company-overdue");

  // ---- Dissolved ----
  await page.goto(`${base}/check-company?number=09876543`, { waitUntil: "networkidle0" });
  await waitFor('[data-testid="report"]');
  const dead = await text('[data-testid="summary"]');
  check("a dissolved company is plainly gone", /^What this means\nDissolved on \d+ \w+ \d{4} — this company no longer exists\./.test(dead), dead);
  check("dissolved shows no current officers but keeps the count", /No current officers/.test(await text('[data-testid="officers"]')), await text('[data-testid="officers"]'));
  check("the dissolved date is in the headline", /Dissolved/.test(await text('[data-testid="report"]')));
  await shot("check-company-dissolved");

  // ---- Liquidation, charges, insolvency, a disqualified officer ----
  await page.goto(`${base}/check-company?number=33334444`, { waitUntil: "networkidle0" });
  await waitFor('[data-testid="report"]');
  const bust = await text('[data-testid="summary"]');
  check("liquidation is stated with its date", /Companies House shows this company in liquidation, commencement of winding up \d+ \w+ \d{4}\./.test(bust), bust);
  const charges = await text('[data-testid="charges"]');
  check("charges are counted and explained", /Three charges/.test(charges) && /two outstanding/.test(charges) && /one satisfied/.test(charges) && /security for borrowing/.test(charges) && /BIG BANK PLC/.test(charges), charges);
  check("the summary mentions the outstanding charges", /Two charges outstanding/.test(bust), bust);
  const insolvency = await text('[data-testid="insolvency"]');
  check("the insolvency case is named", /Creditors voluntary liquidation/.test(insolvency) && /Commencement of winding up/.test(insolvency) && /J\. SMITH/.test(insolvency), insolvency);
  check("a disqualification the API reports is shown", /records a disqualification/.test(await text('[data-testid="officers"]')) && /disqualification against an officer/.test(bust), bust);
  check("a corporate owner is shown as a company", /KEEN HOLDINGS LIMITED/.test(await text('[data-testid="control"]')));
  await shot("check-company-liquidation");

  // ---- A part that wouldn't load ----
  await page.goto(`${base}/check-company?number=55556666`, { waitUntil: "networkidle0" });
  await waitFor('[data-testid="report"]');
  body = await text("body");
  check("a section that failed is not shown as empty", !(await has('[data-testid="officers"]')) && /Couldn't load officers/.test(body), body.slice(-400));
  check("the summary leaves officers out rather than guessing", !/officer/.test(await text('[data-testid="summary"]')), await text('[data-testid="summary"]'));
  check("an unknown-to-the-user SIC code still reads plainly", /Dormant Company/.test(body) && /Other professional, scientific/.test(body));

  // ---- Nothing found ----
  await page.goto(`${base}/check-company`, { waitUntil: "networkidle0" });
  await ask("99999999");
  await waitFor('[data-testid="error"]');
  check("an unknown number falls back to a name search and says so", /Nothing on the register matches that/.test(await text('[data-testid="error"]')), await text('[data-testid="error"]'));

  // ---- Fits a phone ----
  await page.goto(`${base}/check-company?number=33334444`, { waitUntil: "networkidle0" });
  await waitFor('[data-testid="report"]');
  const wide = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check("the report fits a 375px screen", wide.doc <= wide.win, JSON.stringify(wide));

  // ---- The way in ----
  await page.goto(`${base}/free-invoice`, { waitUntil: "networkidle0" });
  check("the free invoice page links to it", await page.evaluate(() => [...document.querySelectorAll('a[href="/check-company"]')].length >= 2));

  // ---- Companies House down, which is not the visitor's fault ----
  // An outage used to be reported as "Too many checks from this
  // connection in the last hour" -- a statement about someone who has
  // just arrived on a shared link and checked nothing, and the wrong
  // advice, since trying again in a minute is exactly what works.
  await page.goto(`${base}/check-company`, { waitUntil: "networkidle0" });
  await ask("00000500");
  await waitFor('[data-testid="error"]');
  const outage = await text('[data-testid="error"]');
  check("an unreachable register doesn't blame the visitor", !/Too many checks/.test(outage), outage);
  check("...it says the register isn't answering, and to try shortly", /isn't answering/i.test(outage) && /minute/i.test(outage), outage);

  // ---- Rate limiting (last: it uses the hour's allowance up) ----
  let limited = null;
  for (let i = 0; i < 30 && !limited; i++) {
    const res = await fetch(`${base}/api/company-check?number=${70000000 + i}`);
    if (res.status === 429) limited = await res.json();
  }
  check("a flood of lookups is cut off", limited?.busy === true, JSON.stringify(limited));
  await page.goto(`${base}/check-company`, { waitUntil: "networkidle0" });
  await ask("70000099");
  await waitFor('[data-testid="error"]');
  check("and the page says so kindly", /Too many checks from this connection/.test(await text('[data-testid="error"]')), await text('[data-testid="error"]'));
  const asked = await calls();
  check("every upstream call carried the key, never the browser", asked.length > 0 && asked.filter((c) => c.path.startsWith("/company") || c.path.startsWith("/search")).every((c) => c.auth.startsWith("Basic ")));
} catch (e) {
  console.log("ERROR", e.stack);
  await shot("check-company-error");
} finally {
  await browser.close();
  await stopApp(app);
  fixtures.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
