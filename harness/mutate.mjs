// Mutation testing: break the app on purpose, and see which suites notice.
//
// The only honest answer to "is this check worth anything?" A suite that stays
// green while the thing it covers is broken is decoration, however many checks
// it prints. Two such checks were found by accident on 2026-09-23; this looks
// for the rest on purpose.
//
//   node mutate.mjs apply    -- make every mutation, printing each
//   node mutate.mjs revert   -- put web/src back (git checkout)
//   node mutate.mjs list     -- show them without touching anything
//
// Between apply and revert: rebuild, run the harness, and check that each
// mutation's `expect` suites went red. Any that did not is a hole.
//
// NEVER COMMIT A MUTATED TREE. On 2026-09-24 I did exactly that: eight
// mutations were applied, and a `git add -A` for an unrelated notes file swept
// all of them into a commit that went to main, which deploys. So `apply` now
// leaves a marker file behind, and the pre-commit hook it installs refuses any
// commit while that marker exists. `revert` removes it.
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, chmodSync } from "node:fs";
import { execSync } from "node:child_process";
import { REPO } from "./repo.mjs";

const REPO = REPO;
const MARKER = `${REPO}/.git/MUTATED`;
const HOOK = `${REPO}/.git/hooks/pre-commit`;

// A hook, not a promise to remember. It lives in .git so it is never itself
// committed, and it is written fresh each time in case it has been lost.
function guard() {
  mkdirSync(`${REPO}/.git/hooks`, { recursive: true });
  writeFileSync(HOOK, `#!/bin/sh
if [ -f "${MARKER}" ]; then
  echo "REFUSED: the tree is deliberately broken by harness/mutate.mjs."
  echo "Run:  node harness/mutate.mjs revert"
  exit 1
fi
`);
  chmodSync(HOOK, 0o755);
}

const APP = `${REPO}/web/src`;

// Each one breaks something a person would actually notice.
const MUTATIONS = [
  { file: "lib/today.ts", find: 'timeZone: "Europe/London"', replace: 'timeZone: "UTC"',
    // Not test-dates: that one covers reading a printed date and date
    // arithmetic, neither of which asks what day it is now. Naming it here
    // made a correct suite look like a hole (2026-09-24).
    what: "the app asks UTC what day it is, not London", expect: ["test-midnight"] },
  { file: "lib/cis.ts", find: "/ 100", replace: "/ 200",
    what: "CIS is deducted at half the rate", expect: ["test-cis"] },
  { file: "lib/invoiceBalance.ts", find: "return Math.max(0, pence(total) - pence(credited) - pence(paid)) / 100;",
    replace: "return Math.max(0, pence(total) - pence(paid)) / 100;",
    what: "credit notes stop coming off what is owed", expect: ["test-credit-rollback", "test-payments"] },
  { file: "lib/peopleCheck.ts", find: "if (!/captcha|turnstile/.test(m)) return null;", replace: "return null;",
    what: "Cloudflare's own words reach the front door again", expect: ["test-people-check"] },
  { file: "lib/photoAgeing.ts", find: "else if (!added(r)) skipped", replace: "else if (false) skipped",
    what: "a photograph with no record of when it arrived may be let go", expect: ["test-photo-ageing"] },
  { file: "lib/addressLookup.ts", find: "  return m ? `${m[1]} ${m[2]}` : null;",
    replace: "  return m ? value : null;",
    what: "a postcode comes back exactly as typed, never tidied", expect: ["test-address-fields", "test-address-words"] },
  { file: "lib/scanLimit.ts", find: "starts again tomorrow morning", replace: "ERR_DAY_LIMIT",
    what: "the daily wall speaks in error codes", expect: ["test-scan-limit-text", "test-scan-wall"] },
  { file: "lib/reminderTemplates.ts", find: "days: 7", replace: "days: 9",
    what: "the chase-up after the due date moves by two days", expect: ["test-reminder-clock"] },

  // Added 2026-09-24, for the night's own work. A suite written today is no
  // more trustworthy than one written in September until something breaks the
  // thing it covers and it says so.
  { file: "lib/errorText.ts", find: "  console.error(fallback, err);\n  return fallback;",
    replace: "  console.error(fallback, err);\n  return message || fallback;",
    what: "the database's own words reach a person again",
    expect: ["test-write-fails", "test-half-saved", "test-quotes"] },
  { file: "app/recurring/invoices/page.tsx", find: "    if (generating.current) return;\n    generating.current = true;\n",
    replace: "",
    what: "Make it now can be pressed twice, making two draft invoices",
    expect: ["test-double-press"] },
  { file: "app/mileage/page.tsx", find: "    if (savingTrip.current) return;\n    savingTrip.current = true;\n",
    replace: "",
    what: "one journey can be claimed twice", expect: ["test-double-press"] },
  { file: "app/receipts/review/page.tsx", find: 'setRowError({ id: r.id, message: "A bill to be paid needs a due date." })',
    replace: 'setError("A bill to be paid needs a due date.")',
    what: "a refusal about one bill goes back to the top of the page",
    expect: ["test-refusal-place"] },
  { file: "app/recurring/invoices/page.tsx", find: '<Link href={`/invoices/${made.id}`} className="font-medium underline">Open it</Link>',
    replace: "<span />",
    what: "the draft invoice just made is unreachable again", expect: ["test-said-so"] },
  { file: "app/clients/page.tsx", find: '{merged && <p role="status"',
    replace: "{merged && <p",
    what: "the merge result is printed but never announced", expect: ["test-said-so"] },
  { file: "lib/zip.ts", find: "    lv.setUint32(14, crc, true);", replace: "    lv.setUint32(14, 0, true);",
    what: "every file in a saved zip carries a wrong checksum", expect: ["test-save-these"] },
  { file: "lib/zip.ts", find: "    return dot > 0 ? `${name.slice(0, dot)} (${n + 1})${name.slice(dot)}` : `${name} (${n + 1})`;",
    replace: "    return name;",
    what: "two documents in one zip are given the same name", expect: ["test-save-these"] },
  { file: "components/ContactField.tsx", find: 'const word = kind === "client" ? "customer" : "supplier";',
    replace: 'const word = kind === "client" ? "client" : "supplier";',
    what: "the app calls a customer a client again", expect: ["test-vocabulary"] },
  // Added 2026-09-25, for everything built since the list above. The suites
  // for the reverse charge, the VAT checks and the help chat were all written
  // in the last few days and none had been judged by anything but their own
  // author on the day.
  { file: "lib/reverseCharge.ts", find: 'export const REVERSE_CHARGE_WORDING = "Reverse charge: VAT Act 1994 Section 55A applies";',
    replace: 'export const REVERSE_CHARGE_WORDING = "Reverse charge applies";',
    what: "the invoice drops the statute the Regulations require it to name",
    expect: ["test-reverse-charge"] },
  { file: "lib/vat.ts", find: "  reverse_charge: 0,", replace: "  reverse_charge: 0.2,",
    what: "a reverse-charge line charges the customer the VAT they are meant to account for themselves",
    expect: ["test-reverse-charge"] },
  // PAIRED with "nobody is ever asked whether the reverse charge applies"
  // further down, which rewrites the same line. Whichever comes first wins and
  // the other is skipped, so in a whole-run pass only this one applies. They
  // are different faults and both worth having -- ignoring a written
  // declaration is not the same as never asking at all -- so run the other one
  // on its own when you want it. Both were proved individually on 2026-09-25.
  { file: "lib/reverseChargePrompt.ts", find: "  if (!vatRegistered || cisRate === null || endUserDeclared) return null;",
    replace: "  if (!vatRegistered || cisRate === null) return null;",
    what: "a customer who has declared in writing they are the end user is asked anyway",
    expect: ["test-reverse-charge"] },
  { file: "lib/vatCheckRules.ts", find: "  const day = ukDate(when);", replace: "  const day = when.slice(0, 10);",
    what: "the day a VAT check was kept is asked of UTC, not London",
    expect: ["test-vat-checks"] },
  { file: "lib/vatCheckRules.ts", find: 'export const vatCheckKey = (n: string) => n.replace(/[^a-z0-9]/gi, "").toUpperCase().replace(/^(GB|XI)/, "");',
    replace: 'export const vatCheckKey = (n: string) => n.replace(/[^a-z0-9]/gi, "").toUpperCase();',
    what: "GB123456789 and 123456789 become two separate histories for one supplier",
    expect: ["test-vat-checks"] },
  { file: "lib/vatCheckRules.ts", find: "  return key ? checks.filter((c) => c.vatNumber === key && c.consultationNumber) : [];",
    replace: "  return key ? checks.filter((c) => c.vatNumber === key) : [];",
    what: "a lookup with no reference from HMRC is shown as evidence of a check",
    expect: ["test-vat-checks"] },
  { file: "lib/helpChat.ts", find: "  return messages.slice(-Math.max(1, window));", replace: "  return messages;",
    what: "the whole conversation is sent to the model every time, and the bill grows with it",
    expect: ["test-help-chat", "test-help-chat-live"] },
  { file: "lib/helpChat.ts", find: 'export const helpChatOn = () => (process.env.NEXT_PUBLIC_HELP_CHAT ?? "") === "on";',
    replace: "export const helpChatOn = () => true;",
    what: "the help chat is on for everybody, switch or no switch",
    expect: ["test-help-chat"] },
  { file: "app/api/help-chat/route.ts",
    find: '  if (!answer || interaction.status === "failed" || interaction.status === "incomplete" || interaction.status === "budget_exceeded") {',
    replace: '  if (!answer || interaction.status === "failed") {',
    what: "an answer cut off mid-sentence is handed to somebody as though it were finished",
    expect: ["test-help-chat"] },
  { file: "lib/helpPrompt.ts", find: "Never invent an address:",
    replace: "Addresses may be guessed:",
    what: "the chat is free to send somebody to a page that does not exist",
    expect: ["test-help-chat"] },
  { file: "lib/helpFacts.ts", find: '{ route: "/check-company",', replace: '{ route: "/companies-house",',
    what: "the chat is grounded in a page the app does not have",
    expect: ["test-help-chat"] },
  { file: "app/api/notifications/check/route.ts", find: "  return addDays(todayISO(), days);",
    replace: "  const d = new Date();\n  d.setUTCDate(d.getUTCDate() + days);\n  return d.toISOString().slice(0, 10);",
    what: "the bills-due window is counted from UTC's idea of today again",
    expect: ["test-utc-today"] },
  { file: "components/free-invoice/FreeInvoiceBuilder.tsx", find: "Photograph one you&apos;ve sent before and the next is filled in for you, or build one here. Print it, save it as a file, or keep it in your invoices.",
    replace: "Build an invoice or a quote and print it or save it, no sign-in needed.",
    what: "the free page tells strangers it needs no account, while the gate turns them away",
    expect: ["test-free-draft"] },

  { file: "components/DocumentCapture.tsx", find: 'cvStatus === "loading" ? "Getting ready \u2014 the first time takes a moment. You can take the photo yourself now."',
    replace: 'false ? "Getting ready \u2014 the first time takes a moment. You can take the photo yourself now."',
    what: "the scanner's cold start says nothing while the page-finder starts",
    expect: ["test-cold-start"] },
  { file: "app/receipts/page.tsx", find: "highlight === r.id ? \" ring-2 ring-neutral-900\" : \"\"",
    replace: '""',
    what: "the receipt you tapped is no longer picked out from the list", expect: ["test-open-receipt"] },

  // ---- Added 2026-09-25, for the night's work --------------------------------
  // Each of these breaks something built tonight. A suite written the same
  // night is exactly the one least entitled to be trusted.
  { file: "components/invoice/IssuedInvoice.tsx",
    find: "{vatRegistered && reverseChargeNote(invoice.items) && (",
    replace: "{false && reverseChargeNote(invoice.items) && (",
    what: "an invoice charges no VAT and never says why -- not a legal reverse-charge invoice",
    expect: ["test-reverse-charge"] },
  { file: "lib/reverseCharge.ts",
    find: "const parts = lines.map((l) => `${money(l.vat)} at ${Math.round(l.rate * 100)}% on ${money(l.net)}`);",
    replace: "const parts = lines.map(() => `some VAT`);",
    what: "the reverse-charge note stops saying how much the customer owes HMRC",
    expect: ["test-reverse-charge"] },
  { file: "lib/reverseChargePrompt.ts",
    find: "if (!vatRegistered || cisRate === null || endUserDeclared) return null;",
    replace: "return null;",
    what: "nobody is ever asked whether the reverse charge applies",
    expect: ["test-reverse-charge"] },
  { file: "lib/vatNumber.ts",
    find: "return (sum + check) % 97 === 0 || (sum + check + 55) % 97 === 0;",
    replace: "return true;",
    what: "a mistyped VAT number is accepted as real",
    expect: ["test-vat-number", "test-vat-lookup"] },
  { file: "app/receipts/new/page.tsx",
    find: 'aria-invalid={error === MISSING_TOTAL || undefined}',
    replace: "",
    what: "a refusal stops saying which box it is about",
    expect: ["test-error-on-the-field"] },
  { file: "app/AppShell.tsx",
    find: "    target.current?.focus();",
    replace: "",
    what: "following a link leaves focus on the page you just left",
    expect: ["test-terms-of-use"] },
  { file: "app/AppShell.tsx",
    find: '    pathname === "/security" ||',
    replace: "",
    what: "reporting a security problem requires an account first",
    expect: ["test-terms-of-use"] },
  { file: "components/help/Walkthrough.tsx",
    find: "{!reduced && (",
    replace: "{true && (",
    what: "somebody who asked for less movement is offered a player anyway",
    expect: ["test-help"] },
];

const cmd = process.argv[2] ?? "list";
if (cmd === "revert") {
  // `git checkout -- <path>` restores from the INDEX, not from HEAD. If the
  // mutated files were ever staged -- which one `git add -A` does -- it
  // faithfully restores the mutations and reports success. That is exactly how
  // they reached main a second time, minutes after being taken off it. So the
  // index is reset first, and HEAD is named explicitly.
  execSync("git reset -q -- web/src", { cwd: REPO });
  execSync("git checkout HEAD -- web/src", { cwd: REPO });
  if (existsSync(MARKER)) unlinkSync(MARKER);
  const dirty = execSync("git status --porcelain web/src", { cwd: REPO }).toString().trim();
  console.log(dirty ? "STILL DIRTY:\n" + dirty : "web/src is back to clean.");
  process.exit(0);
}

let applied = 0;
for (const m of MUTATIONS) {
  const path = `${APP}/${m.file}`;
  let text;
  try { text = readFileSync(path, "utf8"); } catch { console.log(`SKIP ${m.file} (no such file)`); continue; }
  if (!text.includes(m.find)) { console.log(`SKIP ${m.file}: cannot find ${JSON.stringify(m.find)}\n    Either the code moved and the mutation needs fixing, or an EARLIER mutation in this run already rewrote that line -- two mutations on one line always leave the second skipped. Check before assuming the first.`); continue; }
  console.log(`${cmd === "apply" ? "BREAK" : "would break"}: ${m.what}\n    ${m.file}: ${JSON.stringify(m.find)} -> ${JSON.stringify(m.replace)}\n    expect red: ${m.expect.join(", ")}`);
  if (cmd === "apply") { writeFileSync(path, text.replace(m.find, m.replace)); applied++; }
}
if (cmd === "apply" && applied) {
  guard();
  writeFileSync(MARKER, `${applied} mutations applied by harness/mutate.mjs\n`);
  console.log(`\n${applied} mutation(s) applied, and committing is now blocked until you revert.`);
  console.log("Rebuild, run the harness, then: node mutate.mjs revert");
}
