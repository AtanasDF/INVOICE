// A brand-new account with nothing in it: no business details, no contacts,
// no invoices, no receipts, no quotes. Every page must open, say something
// useful about being empty, and never show a crash, a NaN or an "undefined".
import { makeDb, launchSignedIn, signIn, sleep, bodyText } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
// Every table the app reads, present and empty -- as a new account really is.
Object.assign(db.tables, {
  clients: [], invoices: [], quotes: [], credit_notes: [], business_profile: [],
  receipts: [], receipt_pages: [], invoice_payments: [], invoice_links: [], quote_links: [],
  recurring_expenses: [], recurring_invoices: [], quote_requests: [], quote_request_suppliers: [],
  invoice_reminders_sent: [], push_subscriptions: [],
});

const ROUTES = [
  ["/", "Dashboard"],
  ["/invoices", "Invoices"],
  ["/invoices/new", "New invoice"],
  ["/quotes", "Quotes"],
  ["/quotes/new", "New quote"],
  ["/quotes/requests", "Quote requests"],
  ["/quotes/requests/new", "New quote request"],
  ["/receipts", "Receipts"],
  ["/receipts/new", "New receipt"],
  ["/receipts/review", "Review"],
  ["/clients", "Contacts"],
  ["/clients/new", "New contact"],
  ["/expenses", "Expenses"],
  ["/vat", "VAT"],
  ["/money", "Money"],
  ["/mileage", "Mileage"],
  ["/recurring", "Recurring expenses"],
  ["/recurring/invoices", "Recurring invoices"],
  ["/files", "Files"],
  ["/settings", "Settings"],
  ["/scan", "Scan"],
  ["/check-company", "Check a company"],
  ["/feedback", "Feedback"],
];

// Things that must never reach the screen.
const JUNK = [/\bNaN\b/, /\bundefined\b/, /\[object Object\]/, /Invalid Date/, /£\s*$/m, /Application error/, /\bnull\b/];

const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-empty" });
let crashed = [];
page.on("pageerror", (e) => crashed.push(e.message));

try {
  await signIn(page, BASE);
  const seen = {};
  for (const [path, name] of ROUTES) {
    crashed = [];
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(900);
    const t = await bodyText(page);
    seen[path] = t;
    check(`${name} (${path}) opens`, t.length > 60 && !t.includes("Application error") && !crashed.length, `${crashed.join(" | ")} :: ${t.slice(0, 200)}`);
    const junk = JUNK.filter((r) => r.test(t)).map(String);
    check(`${name} shows nothing broken`, !junk.length, `${junk.join(", ")} :: ${t.slice(0, 300)}`);
    // Nothing should still be loading a second after the requests finished.
    check(`${name} isn't stuck loading`, !/^\s*(Loading|Loading…|Loading\.\.\.)\s*$/m.test(t) || t.length > 200, t.slice(0, 200));
  }

  // The empty states themselves: each list has to say what to do next.
  const says = (path, ...words) => words.some((w) => (seen[path] ?? "").toLowerCase().includes(w.toLowerCase()));
  check("the dashboard welcomes a new account", says("/", "new here", "nothing here yet", "get started", "first invoice"), seen["/"]?.slice(0, 500));
  check("...and shows no £0.00 for figures it doesn't have", !seen["/"].includes("£0.00"), seen["/"]?.slice(0, 500));
  // Once the tip's three showings are used up, the welcome must still be there.
  await page.evaluate(() => localStorage.setItem("tip:dashboard-welcome", "3"));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await sleep(900);
  const later = await bodyText(page);
  check("the welcome outlives the tip", later.includes("Nothing here yet") && !later.includes("New here?") && !later.includes("£0.00"), later.slice(0, 400));
  check("empty invoices says what to do", says("/invoices", "no invoices", "first invoice", "nothing here"), seen["/invoices"]?.slice(0, 400));
  check("empty quotes says what to do", says("/quotes", "no quotes", "first quote", "nothing here"), seen["/quotes"]?.slice(0, 400));
  check("...with a next step", says("/quotes", "Make one to price a job before you start."), seen["/quotes"]?.slice(0, 400));
  check("empty receipts says what to do", says("/receipts", "no receipts", "nothing here", "scan"), seen["/receipts"]?.slice(0, 400));
  check("empty contacts says what to do", says("/clients", "no contacts", "add", "nothing here"), seen["/clients"]?.slice(0, 400));
  check("empty expenses copes with no receipts", says("/expenses", "nothing", "no receipts", "£0.00"), seen["/expenses"]?.slice(0, 400));
  check("VAT with no figures says so", says("/vat", "nothing in this period", "£0.00"), seen["/vat"]?.slice(0, 400));
  check("mileage with no trips says so", says("/mileage", "no trips", "nothing", "add a trip", "first trip"), seen["/mileage"]?.slice(0, 400));
  check("files with nothing in it says so", says("/files", "no scanned or uploaded documents", "nothing", "no files"), seen["/files"]?.slice(0, 400));
  check("recurring expenses empty state", says("/recurring", "nothing", "no repeat", "none yet", "add"), seen["/recurring"]?.slice(0, 400));
  check("recurring invoices empty state", says("/recurring/invoices", "nothing", "none yet", "no repeat", "add"), seen["/recurring/invoices"]?.slice(0, 400));
  check("review queue empty state", says("/receipts/review", "nothing to review", "all done", "nothing"), seen["/receipts/review"]?.slice(0, 400));
  check("quote requests empty state", says("/quotes/requests", "no requests", "nothing", "ask"), seen["/quotes/requests"]?.slice(0, 400));

  // Settings on a new account: the business details are the first thing to fill in.
  check("settings offers the business details", says("/settings", "business name") && says("/settings", "address"), seen["/settings"]?.slice(0, 600));

  // A new invoice with no customers saved must still let one be typed in.
  await page.goto(`${BASE}/invoices/new`, { waitUntil: "networkidle0" });
  await sleep(900);
  const inputs = await page.evaluate(() => ({
    fields: [...document.querySelectorAll("input,textarea,select")].length,
    disabled: [...document.querySelectorAll("button")].filter((b) => b.disabled).map((b) => b.textContent.trim()),
    save: [...document.querySelectorAll("button")].some((b) => /save|create/i.test(b.textContent)),
  }));
  check("a new invoice can be filled in with no saved customers", inputs.fields > 3 && inputs.save, JSON.stringify(inputs));

  // A failed load has to be said out loud. Silence reads as "your account is
  // empty", which on real books is the most frightening thing the app could
  // say -- and on Settings it would invite saving blank details over good ones.
  const FAILS = [
    ["/", "invoices", "New here?"],
    ["/invoices", "invoices", "No invoices yet"],
    ["/quotes", "quotes", "No quotes yet"],
    ["/receipts", "receipts", "No receipts or bills yet"],
    ["/receipts/review", "receipts", "Nothing waiting on review"],
    ["/clients", "clients", "No customers yet"],
    ["/files", "receipts", "No scanned or uploaded documents yet"],
    ["/expenses", "receipts", "Total excl. VAT"],
    ["/vat", "invoices", "Box 1"],
    ["/money", "invoices", "Owed to you"],
    ["/recurring", "recurring_expenses", "No recurring expenses set up yet"],
    ["/recurring/invoices", "recurring_invoices", "No recurring invoices set up yet"],
    ["/settings", "business_profile", "Business name"],
    ["/feedback", "feedback", null],
  ];
  for (const [path, table, quiet] of FAILS) {
    db.fail = { [`GET ${table}`]: 40 };
    crashed = [];
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" }).catch(() => {});
    await sleep(1400);
    const t = await bodyText(page);
    // Plain English, not the database's own wording.
    check(`${path} says so in plain English when the load fails`, /Couldn't load [^.]+\. (Check your connection and try again|You can still)/.test(t), t.replace(/\s+/g, " ").slice(0, 300));
    check(`${path} doesn't show the server's own error`, !/PGRST|JSON object|mock failure|\bcode\b/i.test(t), t.replace(/\s+/g, " ").slice(0, 300));
    if (quiet) check(`${path} doesn't pretend it's empty`, !t.includes(quiet), t.replace(/\s+/g, " ").slice(0, 300));
    check(`${path} doesn't hang on Loading`, !t.includes("Loading…"), t.replace(/\s+/g, " ").slice(0, 200));
  }
  db.fail = {};

  for (const [path] of ROUTES) console.log("TEXT", path, JSON.stringify((seen[path] ?? "").replace(/\s+/g, " ").slice(0, 420)));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
