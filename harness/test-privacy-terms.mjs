// Privacy and terms (item 11). Needed before a penny goes on advertising, and
// both have to be readable *before* anyone hands over an email address -- so
// the real checks here are that they open signed out, that they are linked
// from every page, and that they say the two things people would be angry to
// find out later: that scanned pictures are sent away to be read, and that the
// tax figures are estimates rather than advice.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, UID } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const db = makeDb();
Object.assign(db.tables, { receipts: [], recurring_expenses: [], invoice_payments: [] });
db.tables.business_profile.push({ user_id: UID, business_name: "Nasko Plastering", vat_registered: false, invoice_prefix: "INV-", invoice_next_number: 1 });
const { browser, page } = await launchSignedIn(db, { base: BASE, width: 390, profile: "profile-legal" });

const footerLinks = () => page.evaluate(() => [...document.querySelectorAll("footer a")].map((a) => a.getAttribute("href")));

try {
  // Signed out, which is the case that matters.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/privacy`, { waitUntil: "networkidle0" });
  await sleep(700);
  check("a stranger can read the privacy page", new URL(page.url()).pathname === "/privacy", page.url());
  let text = await bodyText(page);
  check("it says what is kept, in plain words", /Your invoices, receipts and photographs are yours/.test(text), text.slice(0, 300));
  check("it admits the pictures are sent away to be read", /read the documents you scan/.test(text) && /Google/.test(text) && /Anthropic/.test(text), text.slice(0, 1200));
  check("it names who stores the records", /Supabase/.test(text) && /Vercel/.test(text) && /Resend/.test(text), text.slice(0, 1200));
  check("it mentions the flyer code, since that is the one thing tracked", /flyer/i.test(text), text.slice(0, 900));
  check("it says how to get everything deleted", /deleted/.test(text) && /Feedback/.test(text), text.slice(0, 1500));
  check("it names the regulator to complain to", /Information Commissioner/.test(text), text.slice(0, 1500));
  check("no advertising cookies are claimed or used", /none for advertising/i.test(text), text.slice(0, 1500));

  await page.goto(`${BASE}/terms`, { waitUntil: "networkidle0" });
  await sleep(700);
  check("a stranger can read the terms", new URL(page.url()).pathname === "/terms", page.url());
  text = await bodyText(page);
  check("the terms say it is not an accountant", /It is not an accountant/.test(text) && /not advice/.test(text), text.slice(0, 800));
  check("...and that a machine reading a document can be wrong", /machines misread/.test(text), text.slice(0, 1200));
  check("...and that consumer rights are not signed away", /rights you have as a consumer/.test(text), text.slice(0, 2000));
  check("...and which country's law applies", /English law/.test(text), text.slice(-200));

  // The one public page written to be FOUND rather than to be used: ranking
  // for "free invoice template UK" needs something a stranger can open, and
  // since nothing works before an account, the honest version answers the
  // question instead of pretending to be a tool.
  await page.goto(`${BASE}/how-to-invoice`, { waitUntil: "networkidle0" });
  await sleep(700);
  check("a stranger can read the invoicing guide", new URL(page.url()).pathname === "/how-to-invoice", page.url());
  const guide = await bodyText(page);
  check("it answers the question it is found for", /unique invoice number/i.test(guide) && /VAT number/i.test(guide), guide.slice(0, 400));
  check("...covers the two things this trade gets wrong", /Materials are not deducted from/.test(guide) && /Never reuse a number/.test(guide), guide.slice(0, 900));
  check("...does not pretend to be advice", /isn't tax advice/i.test(guide) && /GOV\.UK/.test(guide), guide.slice(-400));
  check("...and ends at the sign-up rather than a dead end", await page.evaluate(() => [...document.querySelectorAll("main a")].some((a) => a.getAttribute("href") === "/" && /Make an account/i.test(a.textContent))));
  const meta = await page.evaluate(() => ({ title: document.title, desc: document.querySelector('meta[name="description"]')?.content ?? "" }));
  check("...and says what it is, for a search result", /invoice/i.test(meta.title) && /UK/.test(meta.title) && meta.desc.length > 60, JSON.stringify(meta));

  // Linked from everywhere, or nobody finds them.
  const links = await footerLinks();
  check("the legal pages and the guide are all linked in the footer", links.includes("/privacy") && links.includes("/terms") && links.includes("/how-to-invoice"), JSON.stringify(links));

  await signIn(page, BASE);
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
  await sleep(800);
  const inApp = await footerLinks();
  check("...and from inside the app as well", inApp.includes("/privacy") && inApp.includes("/terms"), JSON.stringify(inApp));

  // A customer's invoice is not the place for our terms.
  await page.emulateMediaType("print");
  await sleep(200);
  const printed = await page.evaluate(() => {
    const f = document.querySelector("footer");
    return f ? getComputedStyle(f).display : "none";
  });
  await page.emulateMediaType("screen");
  check("the footer does not print", printed === "none", printed);

  check("fits 320px", await page.setViewport({ width: 320, height: 680 }).then(() => sleep(300)).then(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  await browser.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
