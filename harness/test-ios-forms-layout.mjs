// The iPhone Safari fixes for forms, inputs and layout (cloud brief 13,
// notes/ios-safari.md findings 1, 2, 5, 6, 20, 21, 22 and 23).
//
// Every one of them is invisible in the harness's desktop Chrome: it does not
// zoom into a small box, has no Dynamic Island, never reloads a tab behind
// your back and honours beforeunload. So this reads the source, like
// test-no-hardcoded-colour, and pins each fix where it lives -- a class
// dropped in a refactor would otherwise come back with nobody noticing until
// Atanas did, on the phone. The draft and storage rules are exercised for
// real off the compiled lib.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { REPO } from "./repo.mjs";
import {
  INVOICE_EDIT_PREFIX,
  QUOTE_DRAFT_KEY,
  QUOTE_EDIT_PREFIX,
  decodeDraft,
  draftKey,
  encodeDraft,
  hasWork,
  invoiceEditDraftFields,
  quoteDraftFields,
} from "./gen/lib/formDraft.js";
import {
  PERSONAL_LOCAL_KEYS,
  PERSONAL_LOCAL_PREFIXES,
  PERSONAL_SESSION_PREFIXES,
  accountBoot,
  forgetOtherAccount,
  personalPrefixed,
} from "./gen/lib/accountSwitch.js";
import { ANSWER_PREFIX, mergeAnswer } from "./gen/lib/answerDraft.js";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const SRC = path.join(REPO, "web/src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

// Outside any @layer: Tailwind v4 puts its utilities in a layer, and only an
// unlayered rule beats text-sm whatever the order.
function unlayered(text, needle) {
  const at = text.indexOf(needle);
  if (at < 0) return false;
  let depth = 0;
  const stack = [];
  for (let i = 0; i < at; i++) {
    if (text[i] === "{") {
      const head = text.slice(text.lastIndexOf("}", i) + 1, i).trim();
      stack.push(head);
      depth++;
    } else if (text[i] === "}") {
      stack.pop();
      depth--;
    }
  }
  return !stack.some((h) => h.startsWith("@layer"));
}

// --- #1: tapping a box zooms the page ---
const zoomRule = /@media \(pointer: coarse\)\s*\{\s*input,\s*select,\s*textarea\s*\{\s*font-size:\s*max\(16px,\s*1rem\);/;
check("#1 every input, select and textarea is at least 16px on a touch screen", zoomRule.test(css),
  "iOS zooms into any box under 16px and leaves the page zoomed");
check("#1 ...in an unlayered rule, so text-sm and text-xs cannot win", unlayered(css, "font-size: max(16px, 1rem)"));
const layout = code("app/layout.tsx");
check("#1 ...and not by stopping zoom altogether", !/maximumScale|userScalable|maximum-scale|user-scalable/.test(layout),
  "maximum-scale=1 takes pinch-zoom away from everybody who needs it");

// --- #2: the receipt line price that dropped its decimal point ---
const receiptNew = code("app/receipts/new/page.tsx");
check("#2 receipt lines keep what was typed (NumberInput), so 2.50 can be typed",
  /<NumberInput aria-label="Qty"/.test(receiptNew) && /<NumberInput aria-label="Price"/.test(receiptNew));
const parseOffenders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx$/.test(e.name) && /parseFloat\(e\.target\.value\)/.test(fs.readFileSync(full, "utf8"))) parseOffenders.push(path.relative(SRC, full));
  }
})(SRC);
check("#2 no box anywhere reads itself with parseFloat as it is typed", parseOffenders.length === 0,
  `"2." is stored as 2 and written back, so the dot vanishes: ${parseOffenders.join(", ")}`);

// --- #5: the Feedback pill drawn over every overlay ---
const pageIn = css.match(/main > \*\s*\{\s*animation:\s*page-in[^;]*;/);
check("#5 the page-in animation does not hold its end state",
  !!pageIn && /\bbackwards\b/.test(pageIn[0]) && !/\b(both|forwards)\b/.test(pageIn[0]),
  `a finished opacity animation that is held keeps every page a stacking context for good: ${pageIn?.[0]}`);

// --- #6: forms that kept their work only in memory ---
const NOW = new Date("2026-10-20T12:00:00Z");
check("#6 a new quote and an edited quote are kept under different keys",
  draftKey("quote") === QUOTE_DRAFT_KEY && draftKey("quote", "q1") === QUOTE_EDIT_PREFIX + "q1");
check("#6 an edited draft invoice is kept per invoice, and nowhere without one",
  draftKey("invoice-edit", "i1") === INVOICE_EDIT_PREFIX + "i1" && draftKey("invoice-edit") === "");
check("#6 the new-quote key is cleared when a different account signs in", PERSONAL_LOCAL_KEYS.includes(QUOTE_DRAFT_KEY));
check("#6 ...and so is every per-record key",
  PERSONAL_LOCAL_PREFIXES.includes(QUOTE_EDIT_PREFIX) && PERSONAL_LOCAL_PREFIXES.includes(INVOICE_EDIT_PREFIX) && PERSONAL_SESSION_PREFIXES.includes(ANSWER_PREFIX));
check("#6 personalPrefixed picks the per-record keys and nothing else",
  JSON.stringify(personalPrefixed(["invoice-edit:a", "quote-edit:b", "theme", "tip:scan", "new-receipt-draft"])) === JSON.stringify(["invoice-edit:a", "quote-edit:b"]));

const quote = { clientId: "c1", number: "Q-7", date: "2026-10-20", validUntil: "2026-11-19", items: [{ description: "Fit kitchen", quantity: 1, unitPrice: 1200, vatRate: "standard", photo: "data:image/jpeg;base64,AAAA" }], notes: "", deposit: { kind: "percent", value: 25 }, extra: "dropped" };
const qBack = decodeDraft("quote", encodeDraft("quote", quote, NOW), NOW);
check("#6 a quote comes back with its lines and deposit", qBack?.fields.items[0].unitPrice === 1200 && qBack?.fields.deposit?.value === 25 && qBack?.fields.number === "Q-7");
check("#6 ...and nothing that was not a quote field is stored", !JSON.stringify(qBack).includes("dropped") && !JSON.stringify(qBack).includes("data:image"));
check("#6 a quote with only a customer picked is not offered back", !hasWork("quote", quoteDraftFields({ ...quote, items: [{ description: "", quantity: 1, unitPrice: 0 }], deposit: null })));
const edit = invoiceEditDraftFields({ clientId: "c1", date: "2026-10-20", dueDate: "", paymentTerms: "30 days", items: [], cisRate: 20, notes: "", tagsInput: "" });
check("#6 an edited invoice with every line removed is still a change worth keeping", hasWork("invoice-edit", edit),
  "emptying a draft is as much an edit as typing into one; only the page's baseline can say it changed");
check("#6 a kept edit older than the limit is not offered", decodeDraft("invoice-edit", encodeDraft("invoice-edit", edit, new Date("2026-08-01T12:00:00Z")), NOW) === null);

const quoteForm = code("components/quote/QuoteForm.tsx");
check("#6 the quote form keeps itself, per quote when editing", /useFormDraft\("quote",[^;]*scope: draftScope/.test(quoteForm) && /draftScope=\{q\.id\}/.test(code("app/quotes/[id]/page.tsx")));
check("#6 ...and drops the copy once it has saved", /await onSave\([^;]*;\s*kept\.finish\(\);/.test(quoteForm));
const invoicePage = code("app/invoices/[id]/page.tsx");
check("#6 editing a draft invoice keeps it per invoice, measured against what was saved",
  /useFormDraft\("invoice-edit",[^;]*scope: params\.id, baseline: draftBaseline/.test(invoicePage));
check("#6 ...waits until the invoice has loaded before keeping anything", /draftBaseline === undefined/.test(invoicePage));
check("#6 ...and once sent, the kept copy goes", /markSentWithNumber\(invoice\.id\);\s*kept\.finish\(\);/.test(invoicePage));

const answer = { lines: { a: { text: "12.50", unavailable: false, note: "" }, gone: { text: "9", unavailable: false, note: "" } }, delivery: "25", vatIncluded: true, validUntil: "2026-11-01", note: "" };
const fresh = { lines: { a: { text: "", unavailable: false, note: "" }, b: { text: "", unavailable: false, note: "" } }, delivery: "", vatIncluded: false, validUntil: "", note: "" };
const merged = mergeAnswer(JSON.stringify({ draft: answer, name: "Bob" }), fresh, "");
check("#6 a supplier's prices come back after the phone reloads /r/",
  merged?.draft.lines.a.text === "12.50" && merged?.draft.delivery === "25" && merged?.name === "Bob");
check("#6 ...only for lines the request still has", merged && !("gone" in merged.draft.lines) && merged.draft.lines.b.text === "");
check("#6 ...and anything unreadable is no draft at all", mergeAnswer("{not json", fresh, "") === null && mergeAnswer(null, fresh, "") === null);
const publicView = code("components/quoteRequest/PublicRequestView.tsx");
check("#6 the /r/ page restores only once it is on the device, so the server render still matches",
  /useSyncExternalStore\(\(\) => \(\) => \{\}, \(\) => true, \(\) => false\)/.test(publicView) && /readAnswer\(token/.test(publicView) && /clearAnswer\(token\);\s*setDeclining/.test(publicView));

// The boot script really removes the per-record keys, run as the browser runs it.
function store(entries) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}
const AUTH = "sb-test-auth-token";
const session = JSON.stringify({ user: { id: "B" } });
const local = store({ [AUTH]: session, "last-account": "A", "invoice-edit:1": "x", "invoice-edit:2": "x", "quote-edit:9": "x", "new-quote-draft": "x", theme: "dark", "tip:scan": "1" });
const sess = store({ "quote-request-answer:tok": "x", "unrelated": "1" });
vm.runInNewContext(accountBoot(AUTH), { localStorage: local, sessionStorage: sess, atob: (s) => Buffer.from(s, "base64").toString() });
check("#6 a different account's arrival removes every per-record draft before anything renders",
  JSON.stringify(local.keys()) === JSON.stringify([AUTH, "last-account", "theme", "tip:scan"].sort()),
  JSON.stringify(local.keys()));
check("#6 ...and the supplier answer kept in the tab", JSON.stringify(sess.keys()) === JSON.stringify(["unrelated"]), JSON.stringify(sess.keys()));
const same = store({ [AUTH]: session, "last-account": "B", "invoice-edit:1": "x" });
vm.runInNewContext(accountBoot(AUTH), { localStorage: same, sessionStorage: store({}), atob: () => "" });
check("#6 ...but the same person coming back keeps theirs", same.keys().includes("invoice-edit:1"));
globalThis.localStorage = store({ "last-account": "A", "quote-edit:3": "x", "new-invoice-draft": "x", theme: "dark" });
globalThis.sessionStorage = store({ "quote-request-answer:t": "x" });
forgetOtherAccount("B");
check("#6 a sign-in without a page load clears them too",
  JSON.stringify(globalThis.localStorage.keys()) === JSON.stringify(["last-account", "theme"]) && globalThis.sessionStorage.keys().length === 0,
  JSON.stringify([globalThis.localStorage.keys(), globalThis.sessionStorage.keys()]));

const guard = code("lib/leaveGuard.ts");
const settings = code("app/settings/page.tsx");
check("#6 Settings' link and Back guard lives in leaveGuard.ts, once", /export function useNavigationGuard/.test(guard) && /useNavigationGuard\(dirty, setLeaving\)/.test(settings) && !/pushState/.test(settings),
  "two copies of the history trick drift apart");
for (const [rel, what] of [
  ["components/quoteRequest/RequestForm.tsx", "the quote-request list"],
  ["components/quoteRequest/AnswerEntry.tsx", "a supplier's prices typed in by hand"],
  ["app/clients/new/page.tsx", "a new customer or supplier"],
  ["app/feedback/page.tsx", "a feedback message"],
]) {
  check(`#6 ${what} asks before a link or Back throws it away`, /useConfirmLeave\(!saving/.test(code(rel)));
}

// --- #20: no way back in the home-screen app ---
for (const [rel, href] of [
  ["app/invoices/[id]/page.tsx", "/invoices"],
  ["app/invoices/new/page.tsx", "/invoices"],
  ["app/receipts/new/page.tsx", "/receipts"],
  ["app/receipts/review/page.tsx", "/receipts"],
  ["app/clients/new/page.tsx", "/clients"],
]) {
  check(`#20 ${rel} has a way back that is not the browser's`, new RegExp(`<Link href=[{"][^>]*${href.replace("/", "\\/")}[^>]*>← `).test(code(rel)),
    "the home-screen app has no back button, and the Menu was the only way out");
}
const issuedLinks = (invoicePage.match(/>← Invoices<\/Link>/g) ?? []).length;
check("#20 ...on the issued invoice as well as the draft", issuedLinks === 2, `found ${issuedLinks}`);

// --- #21: larger text running off the screen ---
const addAnything = code("components/AddAnything.tsx");
check("#21 + Add scrolls inside itself instead of running off the bottom", /max-h-\[calc\(100dvh-1rem\)\][^"]*overflow-y-auto/.test(addAnything));
const builder = code("components/free-invoice/FreeInvoiceBuilder.tsx");
check("#21 the Free page's bottom bar wraps rather than pushing More off the edge", /fixed inset-x-0 bottom-0 z-10 flex flex-wrap/.test(builder));
check("#21 Save as never starts off the left edge of a phone", /max-w-\[calc\(100vw-2rem\)\]/.test(code("components/SaveAsMenu.tsx")));
const lineForms = ["app/invoices/new/page.tsx", "app/invoices/[id]/page.tsx", "app/recurring/invoices/page.tsx", "components/quote/QuoteForm.tsx", "app/receipts/new/page.tsx"];
const cramped = lineForms.filter((rel) => {
  const c = code(rel);
  const btn = c.match(/aria-label=\{`Remove (?:line|item) \$\{[^}]+\}`\}[\s\S]{0,80}?className="([^"]+)"/) ?? c.match(/className="([^"]+)"[^>]*>\s*✕/);
  return !btn || !/\bcol-span-12\b/.test(btn[1]) || !/\bsm:col-span-1\b/.test(btn[1]) || !/\bmin-w-11\b/.test(btn[1]);
});
check("#21 a line's ✕ gets its own row on a phone, instead of a twelfth of one", cramped.length === 0,
  `a 44px target in a ~24px column pushes the row off the screen: ${cramped.join(", ")}`);

// --- #22: landscape and the Dynamic Island ---
check("#22 .safe-x pads both sides by the safe area, on screen only",
  /@media screen\s*\{\s*\.safe-x\s*\{\s*padding-left:\s*max\(1rem,\s*env\(safe-area-inset-left\)\);\s*padding-right:\s*max\(1rem,\s*env\(safe-area-inset-right\)\);/.test(css),
  "unlayered and unconditional it would beat print:px-0 and indent the printed invoice");
const shell = code("app/AppShell.tsx");
check("#22 the header, <main> and the footer all use it",
  /className="safe-x mx-auto flex max-w-4xl/.test(shell) && /<main [^>]*className="safe-x /.test(shell) && /<footer className="safe-x /.test(shell));
check("#22 the Feedback pill keeps clear of the right-hand inset", /right: "calc\(1\.25rem \+ env\(safe-area-inset-right\)\)"/.test(shell));

// --- #23: the keyboard, fixed bars and scrolling behind overlays ---
check("#23 an open overlay holds the page still", /html:has\(\[aria-modal="true"\]\)\s*\{\s*overflow:\s*hidden;/.test(css));
check("#23 ...and a list inside one stops at its ends", /\[aria-modal="true"\] \.overflow-y-auto\s*\{\s*overscroll-behavior:\s*contain;/.test(css));
const unmarked = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx$/.test(e.name)) {
      const c = fs.readFileSync(full, "utf8");
      for (const m of c.matchAll(/role="dialog"[\s\S]{0,200}?className="[^"]*\bfixed inset-0\b|className="[^"]*\bfixed inset-0\b[^"]*"[\s\S]{0,40}?role="dialog"/g)) {
        if (!/aria-modal="true"/.test(m[0])) unmarked.push(path.relative(SRC, full));
      }
      // The + Add sheet: a dialog inside a fixed overlay.
      if (/fixed inset-0/.test(c) && /role="dialog"/.test(c) && !/aria-modal="true"/.test(c)) unmarked.push(path.relative(SRC, full));
    }
  }
})(SRC);
check("#23 every full-screen dialog says it is modal, which is what locks the page", unmarked.length === 0, [...new Set(unmarked)].join(", "));
check("#23 a fixed bar steps aside while the keyboard is up",
  /html:has\(:is\(input:not\([^)]*\), textarea, select\):focus\) \.hide-while-typing\s*\{\s*display:\s*none;/.test(css) &&
  /hide-while-typing fixed z-10/.test(shell) && /hide-while-typing fixed inset-x-0 bottom-0/.test(builder));
check("#23 the File library viewer keeps Previous and Next out of the home-indicator strip",
  /paddingBottom: "calc\(1rem \+ env\(safe-area-inset-bottom\)\)"/.test(code("app/files/page.tsx")));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
