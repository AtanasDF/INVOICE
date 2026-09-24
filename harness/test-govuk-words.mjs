// NOTE: not to be confused with test-plain-words.mjs, which is about the
// words a STRANGER must not meet on the front door. This one is about the
// words the app uses when something goes wrong. (This file was very nearly
// called test-plain-words too, and would have overwritten it.)
// The words the app uses when something has gone wrong, or when there is
// nothing to show yet.
//
// GOV.UK's content style guide is free, written by people who test this
// for a living, and not one of the twelve apps in
// notes/competitor-research.md follows it. Its rules that bite here: say
// what happened and what to do next; don't say "please", "sorry" or
// "invalid"; no exclamation marks; use contractions.
//
// It applies to what the APP says to the person using it. It does NOT
// apply to what the person sends a customer -- "Please find attached
// invoice 41" is how an invoice email is written, and "Sorry, I'm running
// about ten minutes late" is a text somebody chose to send. Those files
// are listed in CORRESPONDENCE below and are left alone on purpose;
// silently sweeping them would have made the app worse at its job.
//
// A source scan, not a browser run, because an error message that only
// appears on a dead connection or an expired link cannot be reached by
// clicking, and those are exactly the ones nobody re-reads.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../web/src/", import.meta.url).pathname;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// Written to a customer, not to the person using the app.
const CORRESPONDENCE = [
  "lib/invoiceEmail.ts",
  "lib/reminderTemplates.ts",
  "lib/customerText.ts",
  "lib/quoteRequestEmail.ts",
  "components/quote/PublicQuoteView.tsx",
  "app/api/quote-links/respond/route.ts",
  "app/api/quote-requests/respond/route.ts",
  "components/StatementDocument.tsx",
];
// A word list of company names and SIC codes from Companies House, which
// is their text, not ours.
const NOT_OURS = ["lib/companyHouseTerms.ts"];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) files.push(full);
  }
})(SRC);

// Comments are where the reasoning lives, and the reasoning quotes the
// wording it replaced. Only what ships is scanned.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const rel = (f) => f.slice(SRC.length);
const scanned = files.filter((f) => !NOT_OURS.includes(rel(f)));
check("there is source to scan", scanned.length > 100, String(scanned.length));

const ours = scanned.filter((f) => !CORRESPONDENCE.includes(rel(f)));
check("every correspondence file named still exists", CORRESPONDENCE.every((c) => files.some((f) => rel(f) === c)), JSON.stringify(CORRESPONDENCE.filter((c) => !files.some((f) => rel(f) === c))));

const hits = (list, re) => {
  const out = [];
  for (const f of list) {
    const body = stripComments(readFileSync(f, "utf8"));
    for (const line of body.split("\n")) {
      if (re.test(line)) out.push(`${rel(f)}: ${line.trim().slice(0, 90)}`);
    }
  }
  return out;
};

const please = hits(ours, /\bplease\b/i);
check("the app never says \"please\" to the person using it", please.length === 0, JSON.stringify(please.slice(0, 4)));

const sorry = hits(ours, /\bsorry\b/i);
check("the app never apologises instead of saying what happened", sorry.length === 0, JSON.stringify(sorry.slice(0, 4)));

// aria-invalid is an HTML attribute and a Status value is code, not words.
// aria-invalid is an HTML attribute, a Status value is code, and
// /expired|invalid/ is a test against what SUPABASE said, done precisely so
// that the person is shown our sentence instead of theirs.
const invalid = hits(ours, /\binvalid\b/i).filter((h) => !/aria-invalid|"invalid"|'invalid'|: "checking"|Status =|\/.*invalid.*\/i?\.test\(/.test(h));
check("nothing shown to a person calls anything \"invalid\"", invalid.length === 0, JSON.stringify(invalid.slice(0, 4)));

const oops = hits(scanned, /\boops\b|\bwhoops\b/i);
check("no \"oops\"", oops.length === 0, JSON.stringify(oops.slice(0, 3)));

// An exclamation mark inside a quoted sentence of four words or more.
const shouting = hits(scanned, /["`][^"`]{12,}!["`]/);
check("nothing is shouted at anybody", shouting.length === 0, JSON.stringify(shouting.slice(0, 4)));

// "Could not" and "Couldn't" said the same thing on different screens.
const stiff = hits(scanned, /"[^"]*\bCould not\b|`[^`]*\bCould not\b|>\s*Could not\b/);
check("one spelling of couldn't, not two", stiff.length === 0, JSON.stringify(stiff.slice(0, 4)));

// The two sentences that are said on more than one screen are said from
// one place, so they cannot drift apart again.
const errorText = readFileSync(join(SRC, "lib/errorText.ts"), "utf8");
check("the signed-out sentence has one home", /export const SIGNED_OUT/.test(errorText));
check("the two-passwords sentence has one home", /export const PASSWORDS_DIFFER/.test(errorText));
const retyped = hits(scanned.filter((f) => rel(f) !== "lib/errorText.ts"), /You've been signed out|two passwords are not the same/);
check("neither is retyped anywhere else", retyped.length === 0, JSON.stringify(retyped.slice(0, 3)));

// An empty state that only says what is missing leaves somebody looking at
// a blank screen wondering whether the app is broken. Every one of these
// says what to do next -- so each is longer than the "No ... yet." alone.
const bare = [];
for (const f of ours) {
  const body = stripComments(readFileSync(f, "utf8"));
  // Followed by a CLOSING tag: text that runs into a link ("... yet. <Link>
  // Scan one</Link>.") is a sentence that carries on, and flagging it as
  // bare was the check misreading the markup rather than the words.
  for (const m of body.matchAll(/>\s*(No [^<{}]{4,120}?)\s*<\//g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    if (!/\byet\b/.test(text)) continue;
    // Two sentences, or one that carries an instruction.
    if (/[.!?]\s+\S/.test(text)) continue;
    bare.push(`${rel(f)}: ${text}`);
  }
}
check("no empty state stops at \"nothing here yet\"", bare.length === 0, JSON.stringify(bare.slice(0, 4)));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
