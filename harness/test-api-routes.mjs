// notes/audit-api-routes.md, held where it can be held without a server: every
// route under web/src/app/api, read as source. It runs anywhere, cloud
// sessions included, and complements test-route-guards, which calls the
// routes as a stranger but cannot see a limit that only exists in one
// instance's memory, or a provider's sentence written into somebody's records.
//
// Each check below is a hole the audit found open (2026-10-20) or a fence it
// found standing that a tidy-up could take down. Undoing any fix turns its
// check red; the audit note says which is which.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";

const API = `${REPO}/web/src/app/api`;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const code = (r) => strip(fs.readFileSync(path.join(API, r, "route.ts"), "utf8"));

const onDisk = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name === "route.ts") onDisk.push(path.relative(API, dir).split(path.sep).join("/"));
  }
};
walk(API);

// Who may call each route. The same decision test-route-guards records by
// calling them; here it decides which rules below apply.
const SIGNED_IN = ["scan", "contact-scan", "invoice-template", "invoice-from-text", "price-guide", "help-chat",
  "send-invoice", "send-document", "quote-requests/send", "feedback", "vat-check"];
const CRON = ["reminders/send", "notifications/check", "notifications/weekly", "recurring-invoices/generate", "photos/age"];
const WEBHOOK = ["inbox/ingest"];
const OPEN = ["error", "address-search", "company-search", "company-check", "invoice-links/seen", "quote-links/seen",
  "quote-links/respond", "quote-requests/respond"];
const all = [...SIGNED_IN, ...CRON, ...WEBHOOK, ...OPEN];
check("every route on disk is classified here", onDisk.every((r) => all.includes(r)), onDisk.filter((r) => !all.includes(r)).join(", "));
check("...and every classified route exists", all.every((r) => onDisk.includes(r)), all.filter((r) => !onDisk.includes(r)).join(", "));

// ── The gate comes first ──────────────────────────────────────────────
// Nothing outward (a model, Resend, HMRC, a service-role client) may run
// before the caller is known. Measured inside the exported handler, from
// its first line to the first outward call.
const OUTWARD = /\bfetch\(|extract\w*\(|invoiceFromText\(|priceGuide\(|interactions\.create\(|createClient\([^)]*(SERVICE_ROLE|serviceRole|serviceKey)/;
const handler = (src) => src.slice(src.search(/export async function (GET|POST)\(/));
for (const r of SIGNED_IN) {
  const h = handler(code(r));
  const gate = h.search(/if \(!user\)/);
  const out = h.search(OUTWARD);
  check(`${r}: the sign-in check comes before anything outward`, gate > 0 && (out < 0 || gate < out), `gate at ${gate}, first outward call at ${out}`);
}
for (const r of CRON) {
  const h = handler(code(r));
  const gate = h.search(/authorization["')]*\s*!==\s*`Bearer \$\{cronSecret\}`|authHeader !== `Bearer \$\{cronSecret\}`/);
  check(`${r}: the cron secret is checked before anything outward`, gate > 0 && gate < h.search(OUTWARD), `gate at ${gate}`);
  check(`${r}: a missing CRON_SECRET refuses rather than opening`, /!cronSecret \|\|/.test(h));
}
{
  const h = handler(code("inbox/ingest"));
  const gate = h.search(/authHeader !== `Bearer \$\{webhookSecret\}`/);
  check("inbox/ingest: the webhook secret is checked before anything outward", gate > 0 && gate < h.search(OUTWARD), `gate at ${gate}`);
  check("inbox/ingest: a missing INBOX_WEBHOOK_SECRET refuses rather than opening", /!webhookSecret \|\|/.test(h));
}

// ── Limits that are limits ────────────────────────────────────────────
// A count kept in one serverless instance's memory forgets on every cold
// start and is kept separately by each instance, so "100 a day" and "60 an
// hour overall" meant neither. Every route that sends email or spends a
// paid model call without the scan allowance behind it counts in the
// database (allowShared, migration-018), per account AND overall.
const COUNTED = {
  "send-invoice": ["send:user:", "send:global"],
  "quote-requests/send": ["send:user:", "send:global"],
  "send-document": ["send-doc:user:", "send-doc:global"],
  feedback: ["feedback:", "feedback:global"],
  "invoice-from-text": ["text:", "text:global"],
  "price-guide": ["price:", "price:global"],
  "help-chat": ["help:", "help:global"],
};
for (const [r, [mine, everyone]] of Object.entries(COUNTED)) {
  const src = code(r);
  check(`${r}: no count kept only in this instance's memory`, !/\ballow\(|\brelease\(/.test(src), (src.match(/\b(allow|release)\([^)]*\)/g) ?? []).join(" "));
  check(`${r}: counted per account in the database`, new RegExp(`allowShared\\(\`${mine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(src) || new RegExp(`allowShared\\(key,`).test(src) && src.includes(`\`${mine}`));
  check(`${r}: and overall, so many accounts together have a ceiling`, src.includes(`allowShared("${everyone}"`));
}
for (const r of ["send-invoice", "send-document", "quote-requests/send"]) {
  check(`${r}: the daily cap is in the database too`, /allowShared\(`\$\{key\}:day`/.test(code(r)));
}
// The scan routes keep a per-instance burst guard on purpose: the real budget
// is the per-account allowance in the database (migration-036), asked before
// the read and spent after it.
for (const r of ["scan", "contact-scan", "invoice-template"]) {
  const src = handler(code(r));
  check(`${r}: the database allowance is asked before the read`, src.indexOf("allowScans(") > 0 && src.indexOf("allowScans(") < src.search(/extract\w*\(/));
  check(`${r}: and spent only after it`, src.indexOf("spendScans(") > src.search(/extract\w*\(/));
}

// ── The email import counts documents, not emails ─────────────────────
{
  const src = code("inbox/ingest");
  const h = handler(src);
  const loop = h.search(/for \(let n = 0; n < Math\.max\(1, usableAttachments\.length\); n\+\+\)/);
  check("inbox/ingest: the mailbox's hourly cap is counted once per document read", loop > 0 && h.indexOf("allowShared(`inbox:user:", loop) > loop, `loop at ${loop}`);
  check("inbox/ingest: ...and so is the overall one", loop > 0 && h.indexOf('allowShared("inbox:global"', loop) > loop);
  check("inbox/ingest: ...before the first document is read", loop > 0 && loop < h.search(/extractDocuments\(/));
  // What the owner reads in a needs-review row is the app's own sentence.
  const calls = h.match(/fileUnread\([^;]*\);/g) ?? [];
  check("inbox/ingest: there are unread-filing calls to check", calls.length >= 2, String(calls.length));
  check("inbox/ingest: no provider's or Postgres's text is written into a row the owner reads",
    calls.every((c) => !/\.message/.test(c) || /RELAYED_ERRORS\.has\(message\)\s*\?\s*message/.test(c)), calls.join(" | "));
}

// ── What goes back to somebody ────────────────────────────────────────
// A provider's or Postgres's own words never reach a person, and nothing
// reaches a stranger. The cron and webhook routes answer only Vercel's cron
// and our own Worker, which hold the secret, so their raw messages are
// allowed -- they are what the log of a failed run is read from.
for (const r of [...SIGNED_IN, ...OPEN]) {
  const src = code(r);
  check(`${r}: no raw error message in a response`, !/NextResponse\.json\(\s*\{[^}]*\b(err|error|e|\w+Err)\??\.message/.test(src), (src.match(/NextResponse\.json\(\s*\{[^}]*\.message[^}]*\}/g) ?? []).join(" | "));
  check(`${r}: no stack in a response`, !/\.stack\b[^\n]*NextResponse|NextResponse[^\n]*\.stack\b/.test(src));
  check(`${r}: no secret's value in a response`, !/NextResponse\.json\([^)]*process\.env\.(\w*KEY|\w*SECRET)/.test(src));
}
for (const r of ["scan", "contact-scan", "invoice-template", "invoice-from-text", "price-guide"]) {
  const src = code(r);
  check(`${r}: a model failure reaches the person only as one of the app's own sentences`,
    /RELAYED(_ERRORS)?\.has\(message\)\)?\s*\{?\s*(console\.error\([^;]*;\s*)?return NextResponse\.json\(\{ error: message/.test(src));
}

// ── Service-role reads are scoped to one owner ────────────────────────
// The public link routes run as the service role, so every row they read
// after the token resolves is pinned to that token's owner.
for (const r of ["invoice-links/seen", "quote-links/seen", "quote-links/respond", "quote-requests/respond"]) {
  const src = code(r);
  const reads = src.match(/admin\.from\("\w+"\)[^;]*;/g) ?? [];
  check(`${r}: every service-role read is scoped to the link's owner`, reads.length > 0 && reads.every((q) => /\.eq\("user_id", (view|done)\.(user_id|owner_id)\)/.test(q)), reads.filter((q) => !/\.eq\("user_id"/.test(q)).join(" | "));
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
