// Checks that cannot fail.
//
// Two turned up by accident on 2026-09-23. Both were NEGATIVE assertions --
// "this word must not be on the page" -- naming a word the app never produces
// anywhere. They had been green since the day they were written, and one of
// them was guarding the scanner's whole camera-refusal screen.
//
// A negative check earns nothing unless the thing it forbids could actually
// appear. So: for every `!...includes("X")` and `!/X/.test(...)` in a suite,
// look for X in the app's own source. Found nowhere, the check is decoration.
//
// It cannot be certain, and the limit is worth stating plainly: a check that
// says "this email must never use the word 'deleted'" is VALUABLE precisely
// because the word is nowhere, and looks identical to a dead one. So this is a
// list to review, never a verdict, and it is not wired into run-all.sh. The
// definitive answer comes from mutation: break the app on purpose and see which
// suites notice. Run: node audit-negatives.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = "/Users/nasko/Desktop/INVOICE/web/src";
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
});
// Entities, because JSX writes don&apos;t and a suite writes Don.t.
const source = walk(APP).map((f) => readFileSync(f, "utf8")).join("\n")
  .replace(/&apos;|&#39;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/&nbsp;/g, " ");

// Words no component will ever contain because they come from somewhere else:
// Next's own error boundary, the browser, or the operating system. A negative
// check for one of these is doing its job, not decorating.
const NOT_OURS = [
  "application error", "failed to fetch", "networkerror", "load failed",
  "unhandled", "hydration", "is not defined", "cannot read properties",
  "undefined", "[object", "nan", "infinity", "don't allow",
];

// Words that are about the harness's own data, not the app's wording.
const NOT_WORDING = /^[\d\s£.,:%/-]*$|^(true|false|null|undefined|nan|infinity)$/i;

const suites = readdirSync(".").filter((f) => /^test-.*\.mjs$/.test(f));
const suspect = [];
for (const f of suites) {
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    if (!/check\(|!\s*\//.test(line) && !/!\w[\w.]*\.includes\(/.test(line)) return;
    const found = [
      ...line.matchAll(/!\s*[\w.()\[\]]+\.includes\("([^"]{3,60})"\)/g),
      ...line.matchAll(/!\/([^/\\]{3,60})\/[gimsuy]*\.test\(/g),
    ].map((m) => m[1]);
    for (const raw of found) {
      // A regex alternation passes if ANY branch exists in the app.
      const parts = raw.split("|").map((p) => p.replace(/\\[sdwSDWb]\*?|\\/g, "").trim()).filter(Boolean);
      if (!parts.length) continue;
      if (parts.some((p) => NOT_WORDING.test(p))) continue;
      if (NOT_OURS.some((n) => raw.toLowerCase().includes(n))) continue;
      // Tested as the regex it is, so "Don.t Allow" and "a|b" behave as written.
      let anyReal = false;
      for (const p of parts) {
        try { anyReal = anyReal || new RegExp(p, "i").test(source); }
        catch { anyReal = anyReal || source.toLowerCase().includes(p.toLowerCase()); }
      }
      if (!anyReal) suspect.push({ f, line: i + 1, raw, code: line.trim().slice(0, 110) });
    }
  });
}
console.log(`${suspect.length} negative assertion(s) naming text found nowhere in web/src:\n`);
for (const s of suspect) console.log(`${s.f}:${s.line}\n  forbids: ${JSON.stringify(s.raw)}\n  ${s.code}\n`);
