// Quotes sent and gone quiet: a nudge on the list, ready to text.
//
// Counted from when the quote was really sent (quotes.sent_at, migration-042),
// and from its own date -- saying "dated", not "sent" -- when there is no send
// time: quotes from before the column, or a database it has not reached.
import { makeDb, launchSignedIn, signIn, sleep, bodyText, newId, day, clickText, SUPA } from "./mockdb.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const db = makeDb();
Object.assign(db.tables, { receipts: [], credit_notes: [], invoice_payments: [], quote_links: [] });
const C = newId();
db.tables.clients.push({ id: C, user_id: "x", name: "Jane Customer", email: "jane@example.com", phone: "07700 900123", address: "", kind: "client", archived: false, is_company: false, reminders_enabled: true, vat_number: "", payment_terms: "", default_currency: "", contact_person: "" });
db.tables.business_profile.push({ business_name: "Harness Plastering Ltd", vat_registered: true });
const ago = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const quote = (o) => ({ id: newId(), user_id: "x", client_id: C, number: "Q-1", date: day(-9), valid_until: day(21), items: [{ description: "Skim", quantity: 1, unitPrice: 500, vatRate: "standard" }], notes: "", status: "sent", invoice_id: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, ...o });
// No send time: the quote's own date, said as such.
const QUIET = quote({ number: "Q-QUIET", date: day(-9) });
// Drafted three weeks ago and sent six days ago: counted from the send.
const SENT = quote({ number: "Q-SENT", date: day(-21), sent_at: ago(6) });
// Drafted three weeks ago but only sent two days ago. Counted from its date
// this was nagged about before the customer had it -- the bug.
const JUST_SENT = quote({ number: "Q-JUST-SENT", date: day(-21), sent_at: ago(2) });
// A draft to send from its page, twice: once with the column, once without.
const TO_SEND = quote({ number: "Q-TO-SEND", status: "draft", date: day(-3) });
const TO_SEND_OLD_DB = quote({ number: "Q-OLD-DB", status: "draft", date: day(-3) });
// Reopened after an answer: not a new send, so it keeps the first one.
const DECLINED = quote({ number: "Q-DECLINED", status: "declined", date: day(-20), sent_at: ago(15), vat_registered: true });
const FRESH = quote({ number: "Q-FRESH", date: day(-1) });
const DRAFT = quote({ number: "Q-DRAFT", status: "draft", date: day(-30) });
const ACCEPTED = quote({ number: "Q-ACCEPTED", status: "accepted", date: day(-30) });
const EXPIRED = quote({ number: "Q-EXPIRED", date: day(-40), valid_until: day(-2) });
db.tables.quotes.push(QUIET, SENT, JUST_SENT, FRESH, DRAFT, ACCEPTED, EXPIRED, TO_SEND, TO_SEND_OLD_DB, DECLINED);
// A database without migration-042: PostgREST refuses any write naming
// sent_at, as it does for a column it has never heard of.
let noSentAtColumn = false;
const refused = [];
const intercept = (req, u) => {
  if (!noSentAtColumn || u.origin !== SUPA || !u.pathname.startsWith("/rest/v1/quotes") || req.method() !== "PATCH") return false;
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (!("sent_at" in body)) return false;
  refused.push(body);
  req.respond({ status: 400, headers: { "Access-Control-Allow-Origin": "*", "content-type": "application/json" }, body: JSON.stringify({ code: "PGRST204", message: "Could not find the 'sent_at' column of 'quotes' in the schema cache" }) });
  return true;
};
const { browser, page } = await launchSignedIn(db, { base: BASE, profile: "profile-quote-chase", intercept });
try {
  await signIn(page, BASE);
  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Quotes"), { timeout: 15000 });
  await sleep(600);
  const t = await bodyText(page);
  const section = await page.evaluate(() => [...document.querySelectorAll("section")].find((x) => x.innerText.includes("Waiting on an answer"))?.innerText ?? "");
  check("a quiet quote with no send time is raised, counted from its date", t.includes("Waiting on an answer") && section.includes("Q-QUIET") && section.includes("dated 9 days ago"), section.slice(0, 200));
  check("...and never claims a send nobody recorded", !section.includes("sent 9 days ago"), section.slice(0, 200));
  check("one with a send time counts from the send, not its date", section.includes("Q-SENT") && section.includes("sent 6 days ago") && !section.includes("dated 21 days ago"), section.slice(0, 300));
  check("drafted long ago but sent two days ago is left alone", !section.includes("Q-JUST-SENT"), section.slice(0, 300));
  check("a quote sent yesterday is left alone", !section.includes("Q-FRESH"));
  check("drafts, accepted and expired ones are left alone", !section.includes("Q-DRAFT") && !section.includes("Q-ACCEPTED") && !section.includes("Q-EXPIRED"));
  check("the total and how long it holds are shown", section.includes("£600.00") && section.includes("holds until"), section.slice(0, 220));
  const msg = await page.evaluate(() => document.querySelector("#text-customer-message")?.value ?? "");
  check("the message is ready to send", /just checking you got the quote for £600\.00/.test(msg) && /any thoughts/i.test(msg), msg);
  const sms = await page.evaluate(() => document.querySelector('a[href^="sms:"]')?.getAttribute("href") ?? "");
  check("it goes to their mobile", sms.startsWith("sms:+447700900123"), sms.slice(0, 60));
  check("WhatsApp is there too", await page.evaluate(() => !!document.querySelector('a[href^="https://wa.me"]')));
  check("fits 375px", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  // ---- Sending stamps the time ------------------------------------------
  const markSent = async (id) => {
    await page.goto(`${BASE}/quotes/${id}`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Mark as sent" && !b.disabled), { timeout: 15000 });
    await clickText(page, "Mark as sent");
    await sleep(900);
  };
  const before = Date.now();
  await markSent(TO_SEND.id);
  const sentRow = db.tables.quotes.find((x) => x.id === TO_SEND.id);
  const stamp = Date.parse(sentRow.sent_at ?? "");
  check("Mark as sent records when", sentRow.status === "sent" && stamp >= before - 60_000 && stamp <= Date.now() + 60_000, JSON.stringify({ status: sentRow.status, sent_at: sentRow.sent_at }));
  check("...in the same write as the VAT setting it went out under", sentRow.vat_registered === true, String(sentRow.vat_registered));

  await page.goto(`${BASE}/quotes/${DECLINED.id}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Reopen" && !b.disabled), { timeout: 15000 });
  const firstSend = DECLINED.sent_at;
  await clickText(page, "Reopen");
  await sleep(900);
  const reopened = db.tables.quotes.find((x) => x.id === DECLINED.id);
  check("reopening an answered quote keeps the first send time", reopened.status === "sent" && reopened.sent_at === firstSend, JSON.stringify({ status: reopened.status, sent_at: reopened.sent_at }));

  // ---- A database without the column -------------------------------------
  noSentAtColumn = true;
  await markSent(TO_SEND_OLD_DB.id);
  const oldRow = db.tables.quotes.find((x) => x.id === TO_SEND_OLD_DB.id);
  const err = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent ?? "");
  check("without migration-042 the send is refused once, then goes through", refused.length === 1 && oldRow.status === "sent" && !err, JSON.stringify({ refused: refused.length, status: oldRow.status, err }));
  check("...still keeping the VAT setting (033 is there, 042 is not)", oldRow.vat_registered === true && !("sent_at" in oldRow), JSON.stringify(oldRow));
  await page.goto(`${BASE}/quotes`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.body.innerText.includes("Quotes"), { timeout: 15000 });
  await sleep(600);
  check("the list still loads with quotes that carry no sent_at at all", (await bodyText(page)).includes("Q-OLD-DB"));
} catch (e) { console.log("ERROR", e.message); }
finally { await browser.close(); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length })); }
