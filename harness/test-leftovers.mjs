// The leftovers sweep (cloud brief 17, notes/leftovers.md list c): the small
// things every audit since 18/10 wrote down and left. Most live in routes and
// page state no logic suite reaches, so these read the source for the shape
// of the fix -- enough to fail the day somebody undoes one. Where the fix is
// a lib function, it is run for real.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const raw = (f) => fs.readFileSync(`${REPO}/web/src/${f}`, "utf8");
const src = (f) => raw(f).replace(/^\s*\/\/[^\n]*$/gm, "");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const routes = walk(`${REPO}/web/src/app/api`).filter((f) => f.endsWith("route.ts")).map((f) => [path.relative(`${REPO}/web/src`, f), fs.readFileSync(f, "utf8")]);

// API routes
check("every email route can be pointed at the Resend stand-in", routes.every(([, s]) => !/fetch\("https:\/\/api\.resend\.com/.test(s)),
  routes.filter(([, s]) => /fetch\("https:\/\/api\.resend\.com/.test(s)).map(([f]) => f).join(", "));
const bareCompare = routes.filter(([, s]) => /!==\s*`Bearer \$\{/.test(s)).map(([f]) => f);
check("no cron or webhook secret is compared with !==", bareCompare.length === 0, bareCompare.join(", "));
for (const r of ["inbox/ingest", "reminders/send", "notifications/check", "notifications/weekly", "recurring-invoices/generate", "photos/age"]) {
  check(`${r}: checks its secret with bearerMatches`, /bearerMatches\(/.test(src(`app/api/${r}/route.ts`)));
}
const { bearerMatches } = await import("./gen/lib/bearer.js");
check("bearerMatches: the right secret passes", bearerMatches("Bearer s3cret", "s3cret") === true);
check("bearerMatches: a wrong one of the same length fails", bearerMatches("Bearer s3creT", "s3cret") === false);
check("bearerMatches: a prefix of it fails", bearerMatches("Bearer s3cre", "s3cret") === false);
check("bearerMatches: no secret set refuses everything", bearerMatches("Bearer ", "") === false && bearerMatches("Bearer undefined", undefined) === false);
check("bearerMatches: no header fails", bearerMatches(null, "s3cret") === false);

const ingest = src("app/api/inbox/ingest/route.ts");
check("inbox import runs on either reader key, not only Anthropic's", /GEMINI_API_KEY \|\| process\.env\.ANTHROPIC_API_KEY/.test(ingest) && !/!anthropicKey/.test(ingest));

const address = src("app/api/address-search/route.ts");
check("address-search: a postcodes.io failure on the mileage lookup answers 503, not a thrown 500",
  /if \(body\.where === true\)[\s\S]{0,400}try \{[\s\S]{0,300}getJson[\s\S]{0,300}\} catch[\s\S]{0,300}status: 503/.test(address));

const check1 = src("app/api/company-check/route.ts");
check("company-check: strangers and accounts count against separate totals", /isSignedIn\(/.test(check1) && /"signed-in" : "anon"/.test(check1) && !/"check:global"|"check-report:global"/.test(check1));
check("company-check: the comment no longer calls /check-company public like the Free page", !/Public, like the Free invoice page/.test(raw("app/api/company-check/route.ts")));
const checker = src("components/check-company/CompanyChecker.tsx");
check("/check-company sends the sign-in with both of its requests", (checker.match(/signedInHeaders\(\)/g) ?? []).length >= 2 && /authHeaders\(\)\.catch/.test(checker));

// The invoice page and its store
const storage = src("lib/storage.ts");
const updateDraft = storage.slice(storage.indexOf("async updateDraft("), storage.indexOf("async markSentWithNumber("));
check("an invoice's draft edit only ever touches a draft", /\.eq\("id", id\)\.eq\("status", "draft"\)\.select\("id"\)/.test(updateDraft) && /isn.t a draft any more, or has gone/.test(updateDraft));
const inv = src("app/invoices/[id]/page.tsx");
const saveDraft = inv.slice(inv.indexOf("async function saveDraftOnly"), inv.indexOf("function openSendPanel"));
check("Save draft: a failed read-back after a good save doesn't say it didn't save",
  /return;\s*\}\s*try \{\s*setInvoice\(await invoicesStore\.get\(invoice\.id\)\)/.test(saveDraft) && /Saved, but the page couldn't load it back/.test(saveDraft));
check("Send: a failed read-back closes the panel, so Confirm can't be pressed on an issued invoice",
  /reading the invoice back", err\);\s*setSendPanelOpen\(false\)/.test(inv));
check("storage: the plan comment names migration-044, which is live", /migration-044/.test(raw("lib/storage.ts")) && !/by then the intent is already/.test(raw("lib/storage.ts")));

const req = src("app/quotes/requests/[id]/page.tsx");
check("quote requests: no action falls back to 'Something went wrong.'", !/Something went wrong/.test(req));
const runs = req.match(/\brun\((?:async )?\(\) =>/g) ?? [];
check("quote requests: run() takes a failure sentence from every caller", /async function run\(action: \(\) => Promise<void>, failed: string, done\?: string\)/.test(req) && runs.length >= 9);

const clients = src("app/clients/page.tsx");
check("/clients: a settings load that fails is said beside the draft figures it affects", /\(\) => setProfileFailed\(true\)/.test(clients) && /profileFailed && clientInvoices\.some/.test(clients));

// ── Part two: the printed sheet's other shapes, offline, the iPhone list ──
const { displayWidth, sheetText, sheetCsv } = await import("./gen/lib/sheetFile.js");
check("displayWidth: a CJK character takes two columns, an accent none", displayWidth("東京") === 4 && displayWidth("café") === 4 && displayWidth("abc") === 3);
const txt = sheetText({ title: "Invoice", blocks: [{ kind: "table", table: { head: ["Item", "Total"], rows: [["東京の仕事", "£10.00"], ["Plaster", "£20.00"]] } }] });
const [cjk, latin] = txt.split("\n").filter((l) => /£/.test(l));
check("plain text: totals line up under a CJK description", displayWidth(cjk.slice(0, cjk.indexOf("£"))) === displayWidth(latin.slice(0, latin.indexOf("£"))), JSON.stringify([cjk, latin]));
const csv = sheetCsv({ title: "Invoice", blocks: [{ kind: "text", lines: ["Total due: £480.00", "Registered name: Acme Ltd. Company number: 123."] }] });
check("spreadsheet: a label and a value split into two cells", /^\uFEFF?Total due,£480\.00$/m.test(csv), csv);
check("spreadsheet: a line with two labels in it stays one cell", /^"?Registered name: Acme Ltd\. Company number: 123\."?$/m.test(csv), csv);
const sheet = src("lib/sheetFile.ts");
check("sheet: a labour/materials heading row is read with its lines", /th\[scope=rowgroup\]/.test(sheet));
// Both behaviours run for real in test-statement-cells and test-sheet-order;
// these only notice if the code that does them goes.
check("sheet: a block inside a cell is read with a space, not run together", /const block = n !== cell && startsLine\(n\)/.test(sheet) && /tagName === "BR"/.test(sheet));
check("sheet: a sheet wrapped in one element is read child by child", /only\.length === 1 && !\(only\[0\] instanceof HTMLTableElement\)/.test(sheet));
check("sheet: tables are read from the copy with the hidden parts taken out", /clone\.querySelectorAll\("table"\)/.test(sheet) && !/child\.querySelectorAll\("table"\)/.test(sheet));
check("sheet: an SVG child can't throw on className", /child\.classList\.contains\("print:hidden"\)/.test(sheet) && !/child\.className\.includes/.test(sheet));
check("sheet: the title is read as written, not upper-cased by the style, and printed once", /querySelector\("h1"\)\?\.textContent/.test(sheet) && /titleDropped/.test(sheet));
check("sheet: a figure on its own line is paired with the label above it", /function pairFigures/.test(sheet));

const { documentFileName } = await import("./gen/lib/documentName.js");
check("file name: the invoice PDF keeps its usual shape", documentFileName("invoice", "INV-042") === "Invoice-INV-042.pdf" && documentFileName("quote", "Q-0001") === "Quote-Q-0001.pdf");
check("file name: letters outside ASCII are kept, slashes are not", documentFileName("invoice", "Зарплата/7") === "Invoice-Зарплата-7.pdf", documentFileName("invoice", "Зарплата/7"));
check("file name: Save as on /i/ and /q/ uses the same name", /documentFileName\("invoice", data\.invoice\.number, ""\)/.test(src("components/invoice/PublicInvoiceView.tsx")) && /documentFileName\("quote", q\.number, ""\)/.test(src("components/quote/PublicQuoteView.tsx")));
check("file name: the emailed attachment is named the same way", /documentFileName\(/.test(src("app/api/send-invoice/route.ts")));

const { moneyIn } = await import("./gen/lib/money.js");
check("Free page money: a discount reads −£50.00, not £-50.00", moneyIn("£", -50) === "−£50.00" && moneyIn("€", 1234.5) === "€1,234.50" && moneyIn("£", -0.001) === "£0.00");
check("the Free page's formatMoney is that one", /export const formatMoney = moneyIn;/.test(src("components/invoice/InvoiceDocument.tsx")));
// Class order is Prettier's business, so look for the class, not its place.
const wraps = (name) => new RegExp(`className="[^"]*\\bwrap-anywhere\\b[^"]*">\\{${name}`, "g");
check("long names wrap on the Free sheet and the quote", (src("components/invoice/InvoiceDocument.tsx").match(wraps("(?:d\\.issuer|i)\\.name")) ?? []).length === 3 &&
  wraps("profile\\.businessName").test(src("components/quote/QuoteDocument.tsx")) && wraps("client\\?\\.name").test(src("components/quote/QuoteDocument.tsx")));

const { pagesToPdf, PDF_LOCKED, PICTURE_KIND } = await import("./gen/lib/documentPdf.js");
const dataUrl = (f, type) => `data:${type};base64,${fs.readFileSync(`${REPO}/harness/convert-files/${f}`).toString("base64")}`;
const refused = async (pages) => pagesToPdf(pages, "t").then(() => null, (e) => e.message);
check("one PDF: a password-protected PDF is refused in words, not copied in as garbage", (await refused([{ dataUrl: dataUrl("locked.pdf", "application/pdf"), mediaType: "application/pdf" }])) === PDF_LOCKED);
check("one PDF: a WEBP picture is refused in words, not pdf-lib's", (await refused([{ dataUrl: dataUrl("photo.webp", "image/webp"), mediaType: "image/webp" }])) === PICTURE_KIND);
check("/copy says those two as they are", /err\.message === PDF_LOCKED \|\| err\.message === PICTURE_KIND/.test(src("app/copy/page.tsx")));

const { parseCsv, convertFiles } = await import("./gen/lib/convert.js");
check("a semicolon CSV from European Excel reads as columns", JSON.stringify(parseCsv("Item;Price\nPlaster;12,50\n")[1]) === JSON.stringify(["Plaster", "12,50"]));
const bad = await convertFiles([new File(["a,b\n1,2\n"], "good.csv", { type: "text/csv" }), new File(["{nope"], "broken.json", { type: "application/json" })], "csv").then(() => null, (e) => e);
check("several files in: the one that failed is named", bad?.file === "broken.json", String(bad));

const { buildReport } = await import("./gen/lib/companyReportBuild.js");
const lateAt = (now) => buildReport({ profile: { company_name: "X", company_number: "1", accounts: { next_accounts: { due_on: "2026-07-14", overdue: false } } }, missing: [] }, new Date(now)).accounts;
check("Companies House: at 00:30 BST the day after the deadline, the accounts are overdue", lateAt("2026-07-14T23:30:00Z")?.overdue === true, JSON.stringify(lateAt("2026-07-14T23:30:00Z")));
check("and at 23:30 BST on the day itself they are not", lateAt("2026-07-14T22:30:00Z")?.overdue === false);

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const fd = await import("./gen/lib/freeInvoiceDraft.js");
const sig = "data:image/png;base64," + "A".repeat(5000);
fd.saveSignature(sig, "A. Person");
const draft = { ...fd.defaultDraft(), signature: sig };
fd.writeFreeInvoiceDraft(draft);
check("Free draft: the saved signature isn't written into the draft a second time", !store.get("free-invoice-draft").includes("AAAAAAAAAA"));
check("and it comes back when the draft is read", fd.readFreeInvoiceDraft()?.signature === sig);
fd.writeFreeInvoiceDraft({ ...draft, signature: "data:image/png;base64,BBBB" });
check("a signature that isn't the saved one is still kept in the draft", fd.readFreeInvoiceDraft()?.signature === "data:image/png;base64,BBBB");

const sw = fs.readFileSync(`${REPO}/web/public/sw.js`, "utf8");
const offline = fs.readFileSync(`${REPO}/web/public/offline.html`, "utf8");
check("offline page: Try again reloads the page asked for, not the dashboard", /<a href="">Try again<\/a>/.test(offline) && !/href="\/"/.test(offline));
check("offline page: it no longer promises nothing typed was lost", !/Nothing has been lost/.test(offline));
check("and the worker's cache moved on, so phones get the new copy", /const CACHE = "invoiceover-v4";/.test(sw));
check("error page: a missing chunk after a deploy reloads instead of re-running the old bundle", /STALE_CHUNK[\s\S]{0,200}window\.location\.reload\(\)/.test(src("app/error.tsx")) || /stale \? \(\) => window\.location\.reload\(\) : reset/.test(src("app/error.tsx")));
check("sign-out closes the notifications still on the lock screen", /clearShownNotifications\(\)/.test(src("lib/signOut.ts")) && /getNotifications\(\)/.test(src("lib/push.ts")));
for (const f of ["lib/receiptImages.ts", "lib/receiptImagesServer.ts", "lib/quoteRequests.ts"]) {
  check(`${f}: an uploaded photo is kept out of the browser cache`, /\.upload\([\s\S]{0,200}?cacheControl: PRIVATE_FILE_CACHE/.test(src(f)));
}
const nr = src("app/receipts/new/page.tsx");
check("new receipt: after a failed save the duplicate check reads the list again", /\(listsError \|\| listStale\.current\) && !confirmedDuplicate/.test(nr) && /Couldn't save receipt\."\)\);\s*listStale\.current = true;/.test(nr));
check("AnswerEntry: a file it can't open says so in its own words", !/errorText\(err, "Couldn't open that file\."\)/.test(src("components/quoteRequest/AnswerEntry.tsx")));
check("mileage: leaving with a trip typed asks first", /useConfirmLeave\(!saving && !!\(miles\.trim\(\) \|\| purpose\.trim\(\)\)/.test(src("app/mileage/page.tsx")));

const scan = src("app/scan/page.tsx");
check("/scan: storage that refuses doesn't take the page down", !/useState\(\(\) => typeof window !== "undefined" && localStorage/.test(scan) && /function engineWasChosen\(\)[\s\S]{0,80}try \{/.test(scan));
const caps = (s) => (s.match(/autoCapitalize="characters"\s+autoCorrect="off"\s+spellCheck=\{false\}/g) ?? []).length;
check("document-number boxes: no capitals or corrections forced on a reference", /aria-label="Document number"[^>]*autoCapitalize="characters" autoCorrect="off" spellCheck=\{false\}/.test(scan) && caps(src("app/receipts/review/page.tsx")) >= 1 && caps(src("app/receipts/page.tsx")) >= 1);
check("Compare: a long supplier name or note wraps instead of hiding behind a title", !/truncate" title=\{o\.name\}/.test(src("components/quoteRequest/Compare.tsx")) && !/max-w-28 truncate text-xs/.test(src("components/quoteRequest/Compare.tsx")));
check("receipts: the day a photo was emailed is on the tile, not only in its title", /Emailed to you\s*<span className="block">\{shortDate\(r\.details\.photoAgedAt, today\)\}/.test(src("app/receipts/page.tsx")));
const vh = walk(`${REPO}/web/src`).filter((f) => /\.tsx$/.test(f) && /min-h-screen|max-h-\[\d+vh\]/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(`${REPO}/web/src`, f));
check("no screen-height that iPhone Safari measures past its toolbars", vh.length === 0, vh.join(", "));
check("signature pad: a long press doesn't raise the loupe or the callout", /touch-none select-none[^"]*\[-webkit-touch-callout:none\]/.test(src("components/free-invoice/SignaturePad.tsx")));
check("recurring expenses: the empty state no longer says it goes in on its own", !/it goes in with your expenses on the day/.test(src("app/recurring/page.tsx")));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
if (results.some((r) => !r)) process.exit(1);
