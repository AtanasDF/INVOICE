// notes/audit-components.md, sections 1-4, and notes/audit-failure-paths.md
// (every screen with the network taken away), held where they can be held
// without a browser.
//
// Every finding in those sections was read in the code and fixed on
// wip/audit-components-1 (2026-10-19). The fixes are all one of four shapes
// -- a ref checked on entry, a load error kept apart from the empty state, a
// sentence written for people instead of a library's, a confirm that names
// what goes -- and each shape is easy to undo by a tidy-up that thinks the
// ref is redundant beside `disabled`. So this reads the source, as
// test-utc-today does, and runs the two pieces of lib code the wording now
// depends on. It runs anywhere, cloud sessions included.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";
import { authFailed, customerFailed, saveFailed } from "./gen/lib/errorText.js";
import { getFxRate } from "./gen/lib/fx.js";

const APP = `${REPO}/web/src`;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");
const code = (f) => read(f).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const quiet = console.error;

// ── 3. Error text: the sign-in library's words ─────────────────────────
console.error = () => {};
const auth = (code, message) => Object.assign(new Error(message), { __isAuthError: true, code, status: 400 });
const wrong = authFailed(auth("invalid_credentials", "Invalid login credentials"), "Couldn't sign you in just now.");
check("a wrong password is said in plain words, not GoTrue's", !/Invalid login credentials/.test(wrong) && /don't match/.test(wrong), wrong);
const wait = authFailed(auth("over_email_send_rate_limit", "For security purposes, you can only request this after 42 seconds."), "x");
check("the wait is said as a wait", wait === "Wait 42 seconds, then try again.", wait);
const limit = authFailed(auth("over_email_send_rate_limit", "email rate limit exceeded"), "x");
check("the email rate limit is said in plain words", !/rate limit/.test(limit) && /few minutes/.test(limit), limit);
const unknown = authFailed(auth("unexpected_failure", "Database error saving new user"), "Couldn't make the account just now.");
check("an auth error with no plain words falls back to the caller's sentence", unknown === "Couldn't make the account just now.", unknown);
const offline = authFailed(Object.assign(new TypeError("Load failed"), { __isAuthError: true }), "x");
check("a dropped connection on the sign-in path says so", /connection/.test(offline) && !/Load failed/.test(offline), offline);
const ours = "You haven't said yes to our email yet. Open it and tap the button, or send it again below.";
check("the app's own sentence still goes through", authFailed(new Error(ours), "x") === ours);
check("a database error still goes through saveFailed", authFailed({ code: "23505", message: "duplicate key" }, "x") === "That one is already there.");

// ── 3. The exchange rate, offline ──────────────────────────────────────
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new TypeError("Load failed"); };
let fx = "";
try { await getFxRate("USD", "GBP"); } catch (err) { fx = saveFailed(err, "Couldn't fetch an exchange rate -- enter one manually."); }
globalThis.fetch = realFetch;
check("an offline exchange-rate fetch names the rate service, not 'your records'", /exchange-rate/.test(fx) && /manually/.test(fx) && !/records/.test(fx), fx);
console.error = quiet;

// ── 3. Nothing shows a thrown message as it comes ──────────────────────
const SKIP = new Set(["node_modules", ".next", "vendor"]);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
const ui = [...walk(path.join(APP, "app")), ...walk(path.join(APP, "components"))].filter((f) => !f.includes(`${path.sep}api${path.sep}`));
const raw = ui.filter((f) => /instanceof Error\s*&&\s*\w+\.message\s*\?\s*\w+\.message/.test(code(path.relative(APP, f))));
check("no screen shows err.message because it is an Error", raw.length === 0, raw.map((f) => path.relative(APP, f)).join(", "));
const sign = code("components/SignInCard.tsx");
check("SignInCard never hands an auth error to saveFailed", !/saveFailed\(/.test(sign));
check("a link's error_description is never shown as written", !/reason\.replace\(/.test(sign) && !/setError\(\s*reason\b/.test(sign));
check("reset-password says GoTrue's errors in plain words", /authFailed\(/.test(code("app/reset-password/page.tsx")) && !/saveFailed\(/.test(code("app/reset-password/page.tsx")));
check("Settings' sign-in email says GoTrue's errors in plain words", /resetPasswordForEmail[\s\S]{0,200}authFailed\(/.test(code("app/settings/page.tsx")));
check("PriceFinder no longer runs a fetch error through errorText", !/errorText\(/.test(code("components/PriceFinder.tsx")));
check("emailing an invoice says PDF_FAILED when the PDF can't be made", /currentPdf\(\)[\s\S]{0,200}PDF_FAILED/.test(code("components/SendInvoicePanel.tsx")));
check("emailing a file says PDF_FAILED when the PDF can't be made", /await file\(\)[\s\S]{0,200}PDF_FAILED/.test(code("components/EmailFileForm.tsx")));

// ── 1. Once-only: a ref checked on entry ───────────────────────────────
// [file, where the handler starts]. The guard must be an early return on a
// ref's .current within the handler's first lines -- not `disabled`, and
// not a useState value, which both closures of a double press share.
const ONCE = [
  ["app/invoices/page.tsx", "async function sameAgain("],
  ["app/invoices/[id]/page.tsx", "async function duplicateInvoice("],
  ["app/invoices/new/page.tsx", "async function save("],
  ["app/invoices/new/page.tsx", "async function addScannedClient("],
  ["app/clients/new/page.tsx", "async function addClient("],
  ["components/ContactField.tsx", "async function add("],
  ["components/quote/CustomerPicker.tsx", "async function save("],
  ["app/scan/page.tsx", "async function addAsSupplier("],
  ["app/receipts/new/page.tsx", "async function addReceipt("],
  ["components/quoteRequest/RequestForm.tsx", "async function save("],
  ["components/quoteRequest/AnswerEntry.tsx", "async function save("],
  ["app/quotes/requests/[id]/page.tsx", "async function run("],
  ["app/quotes/[id]/page.tsx", "async function run("],
  ["app/feedback/page.tsx", "async function submit("],
  ["components/help/HelpChat.tsx", "async function emailIt("],
  ["components/DocumentCapture.tsx", "function acceptBatch("],
  ["components/SignInCard.tsx", "async function confirmWithCode("],
  ["components/SignInCard.tsx", "async function resend("],
  ["components/SignInCard.tsx", "async function onSubmit("],
  ["app/settings/page.tsx", "async function emailSignInLink("],
  ["app/settings/page.tsx", "async function regenerateInboxToken("],
];
for (const [file, start] of ONCE) {
  const src = code(file);
  const at = src.indexOf(start);
  const body = at < 0 ? "" : src.slice(at, at + 900);
  check(`${file} ${start.replace(/^(async )?function /, "").replace("(", "")}: a ref is checked on entry`, at >= 0 && /if \(.*\b\w+\.current\b.*\) return/.test(body), at < 0 ? "handler not found" : body.slice(0, 200));
}
check("ScanLimitNotice's Read it now has its own ref", /carried\.current\) return/.test(code("components/ScanLimitNotice.tsx")));
// read(), not code(): this file has pick("image/*"), which the comment
// stripper takes for the start of a block comment.
check("the email-in address is made once at a time, and a failure ends the spinner", /makingNow\.current\) \{/.test(read("components/UploadPanel.tsx")) && /finally \{\s*makingNow\.current = false;\s*setMaking\(false\)/.test(read("components/UploadPanel.tsx")));

// ── 2. A failed load is not an empty list ──────────────────────────────
check("reminders: a failed read is an error, not an empty map", !/catch\([^)]*\)\s*=>\s*\{?\s*if \(live\) setSent\(new Map\(\)\)/.test(code("components/invoice/InvoiceReminders.tsx")) && /loadFailed\(/.test(code("components/invoice/InvoiceReminders.tsx")));
check("contact field: an unreachable register isn't 'nothing more'", /registerDown \?/.test(code("components/ContactField.tsx")));
check("company check: a shared link that fails keeps its number", /\.catch\(\(\) => \{[\s\S]{0,120}setQuery\(number\)/.test(code("components/check-company/CompanyChecker.tsx")));
for (const [file, word] of [["app/quotes/[id]/page.tsx", "Quote not found."], ["app/quotes/requests/[id]/page.tsx", "Request not found."]]) {
  check(`${file}: '${word}' only when the load worked`, new RegExp(`!error && <p[^>]*>${word.replace(".", "\\.")}`).test(code(file)));
}
check("new quote / new request don't promise a form they don't show", !/You can still fill this in/.test(read("app/quotes/new/page.tsx") + read("app/quotes/requests/new/page.tsx")));
check("statement: no Loading for ever beside an error", /error\s*\?\s*""/.test(code("app/clients/[id]/statement/page.tsx")));
check("money: the figures are gated on the LOAD error, not Mark paid's", /loadError \? null :/.test(code("app/money/page.tsx")));
check("new invoice: the lists' load has a rejection handler", /setLoadError\(loadFailed\(/.test(code("app/invoices/new/page.tsx")));
check("mileage: unloaded trips are loaded before pricing, never taken as 0", /milesSoFar\(fresh,/.test(code("app/mileage/page.tsx")) && /amount: priced\.amount/.test(code("app/mileage/page.tsx")));
check("/scan: a failed lists load has its own note", /listsFailed &&/.test(code("app/scan/page.tsx")) && /setListsFailed\(true\)/.test(code("app/scan/page.tsx")));

// ── 4. A removal asks, and names what goes ─────────────────────────────
check("Archive asks, by name", /if \(next && !window\.confirm\(`Archive \$\{c\.name\}/.test(code("app/clients/page.tsx")));
check("Reset to defaults names the categories that go", /lost\.join\(", "\)/.test(code("app/settings/page.tsx")) && /onClick=\{resetCategories\}/.test(code("app/settings/page.tsx")));
check("Forget my saved signature asks", /function forgetSaved\(\) \{\s*if \(!window\.confirm\(/.test(code("components/free-invoice/DraftEditor.tsx")));
check("Clear form says the Free page draft goes too", /also=\{imported \?/.test(code("app/invoices/new/page.tsx")) && /\$\{also \?/.test(code("components/ClearFormButton.tsx")));
check("removing a repeating expense says which", /repeating expense "\$\{description\}"/.test(code("app/recurring/page.tsx")));
check("removing a repeating invoice says who to", /repeating invoice to \$\{to\}/.test(code("app/recurring/invoices/page.tsx")));

// ── Network taken away (notes/audit-failure-paths.md) ──────────────────
// The shapes, generally, so a new screen can't bring one back: a copy that
// says "Copied" whether or not it was, a link read that turns a failure into
// "no link", and a bare res.json() whose SyntaxError reaches the screen.
const uiCode = ui.map((f) => [path.relative(APP, f), code(path.relative(APP, f))]);
const blindCopy = uiCode.filter(([, s]) => /clipboard\s*\.writeText\([^;]*\)\s*\.catch\(\(\) => \{\}\)/.test(s)).map(([f]) => f);
check("no copy swallows a refused write and says Copied anyway", blindCopy.length === 0, blindCopy.join(", "));
const blindLink = uiCode.filter(([, s]) => /for(Quote|Invoice)\([^)]*\)\.catch\(\(\) => null\)/.test(s)).map(([f]) => f);
check("a failed link read is not drawn as 'no link yet'", blindLink.length === 0, blindLink.join(", "));
// These two parse inside a try whose catch never shows the error.
const PARSE_OK = new Set(["components/AddressFields.tsx", "components/VatNumberInput.tsx"]);
const bareParse = uiCode.filter(([f, s]) => !PARSE_OK.has(f) && /await res\.json\(\)\s*[;)]/.test(s)).map(([f]) => f);
check("no screen parses a reply without a catch (a timeout page is HTML)", bareParse.length === 0, bareParse.join(", "));
const routes = walk(path.join(APP, "app", "api")).map((f) => code(path.relative(APP, f)));
check("no route tells a person the name of a missing server key", !routes.some((s) => /NextResponse\.json\(\{ error: `[^`]*\$\{keyName\}/.test(s)));
check("no scan reply is a bare status code", !/failed \(\$\{res\.status\}\)/.test(code("lib/scanClient.ts")) && !/\(\$\{res\.status\}\)/.test(code("app/clients/new/page.tsx")));

console.error = () => {};
const cust = customerFailed(new TypeError("Load failed"), "That didn't work. Try again.");
check("a customer offline isn't told about 'your records'", !/records/.test(cust) && /connection/.test(cust), cust);
check("a customer still gets the route's own sentence", customerFailed(new Error("This quote has expired."), "x") === "This quote has expired.");
console.error = quiet;
for (const f of ["components/quote/PublicQuoteView.tsx", "components/quoteRequest/PublicRequestView.tsx"]) {
  check(`${f}: says failures with customerFailed`, /customerFailed\(/.test(code(f)) && !/saveFailed\(/.test(code(f)));
}

// A load error kept apart from the one that Clear, Add or Send wipes.
for (const f of ["app/recurring/page.tsx", "app/recurring/invoices/page.tsx"]) {
  const s = code(f);
  check(`${f}: the load error is its own, and gates the empty state`, /\.catch\(\(err\) => setLoadError\(loadFailed\(/.test(s) && /items\.length === 0 && !error && !loadError &&/.test(s));
}
check("feedback: a send doesn't wipe the history's load error", /setLoadError\(loadFailed\(/.test(code("app/feedback/page.tsx")));
check("receipts: 'isn't here any more' never after a failed load", /openMissing = !loading && !loadFailedNow &&/.test(code("app/receipts/page.tsx")));
const nr = code("app/receipts/new/page.tsx");
check("new receipt: the lists' error is its own line", /setListsError\(loadFailed\(/.test(nr));
check("new receipt: the duplicate check never runs against a list that didn't load", /if \(\(listsError \|\| listStale\.current\) && !confirmedDuplicate\)[\s\S]{0,120}receiptsStore\.all\(\)/.test(nr) && /duplicateOf\(saved\)/.test(nr));
check("contact field: adding from the register asks the saved list again first", /async function add\(\)[\s\S]{0,700}await clientsStore\.all\(\)[\s\S]{0,300}clientsStore\.add\(/.test(code("components/ContactField.tsx")));
check("/scan: its load failures say so with loadFailed", !/saveFailed\(err, "Couldn't load/.test(code("app/scan/page.tsx")));

// A change that saved is never reported as one that didn't.
const inv = code("app/invoices/[id]/page.tsx");
check("credit note: a status update that fails says the note is saved", /creditNotesStore\.add\([\s\S]{0,500}syncStatus\([^;]*\)\.catch\(/.test(inv) && /credit note is saved, but/.test(inv));
check("credit note removal: a status failure doesn't put it back on screen", /creditNotesStore\.remove\(id\);\s*\} catch \(err\) \{[\s\S]{0,700}return;\s*\}/.test(inv));
check("payment removal: a failed re-read doesn't say it couldn't be removed", /paymentsStore\.remove\(id\);\s*\} catch \(err\) \{[\s\S]{0,120}return;\s*\}/.test(inv));
check("send: a failed read-back doesn't say it wasn't sent", /markSentWithNumber\(invoice\.id\);\s*(?:kept\.finish\(\);\s*)?\} catch/.test(inv));
check("merge: a failed re-read doesn't say the merge failed", /mergeInto\([\s\S]{0,400}\.then\([\s\S]{0,200}The merge went through/.test(code("app/clients/page.tsx")));
check("turn into invoice: the payment terms are read inside the claim's release", /terms = \(await clientsStore\.all\(\)\)[\s\S]{0,140}\} catch \(err\) \{\s*await quotesStore\.releaseClaim/.test(code("app/quotes/[id]/page.tsx")));

// Library and browser words.
check("mileage: an offline postcode lookup is our sentence, not 'Load failed'", /fetch\("\/api\/address-search"[^;]*\.catch\(\(\) => \{\s*throw new Error\(/.test(code("app/mileage/page.tsx")));
check("reading a supplier's quote doesn't run a fetch error through errorText", !/errorText\(err, "Couldn't read their quote/.test(code("components/quoteRequest/AnswerEntry.tsx")));
check("save these: the file builder's throw is said plainly", /buildExport\([^)]*\)\.catch\(/.test(code("components/SaveThese.tsx")));
check("push: the browser's subscribe error is said plainly", /pushManager\.subscribe[\s\S]{0,200}\} catch[\s\S]{0,200}throw new Error\("Couldn't turn notifications on/.test(code("lib/push.ts")));
check("reset link: no signal is not 'run out'", /"offline"/.test(code("app/reset-password/page.tsx")) && /establishSession\(\)\.catch\(/.test(code("app/reset-password/page.tsx")));
check("/copy: only closing the share sheet is silent", /name === "AbortError"/.test(code("app/copy/page.tsx")));

// Nobody stuck, nothing quietly short.
const files = code("app/files/page.tsx");
check("files: missing pages say so with a retry, never 'Loading page…' for good", /failed: true/.test(files) && /pagesFailed \?/.test(files) && /onClick=\{\(\) => loadPages\(preview\)\}/.test(files));
check("files: a document whose pages didn't load is never saved short", /loadedPages\.length < previewTotalPages - 1\) throw/.test(files));
check("files: the email form hears a failed file as a failure", !/makeFile\(\)[\s\S]{0,40}\} catch \{[\s\S]{0,120}return null;/.test(files) && !/catch \{\s*setFileError\([^)]*\);\s*return null;/.test(files));
check("logo: a failed read isn't kept for the session", /cache\.delete\(ref\)/.test(code("lib/logo.ts")));
check("settings: a saved logo that didn't show isn't 'No logo yet'", /\) : logoUrl \? \(/.test(code("app/settings/page.tsx")));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
