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
check("/check-company sends the sign-in with both of its requests", (checker.match(/authHeaders\(\)/g) ?? []).length >= 2);

// The invoice page and its store
const storage = src("lib/storage.ts");
const updateDraft = storage.slice(storage.indexOf("async updateDraft("), storage.indexOf("async markSentWithNumber("));
check("an invoice's draft edit only ever touches a draft", /\.eq\("id", id\)\.eq\("status", "draft"\)\.select\("id"\)/.test(updateDraft) && /already been sent/.test(updateDraft));
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

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
if (results.some((r) => !r)) process.exit(1);
