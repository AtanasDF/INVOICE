// A page must not promise what the front door refuses.
//
// THREE TIMES the app has told somebody they did not need an account, on a
// page that then demanded one:
//
//   1. The Free-invoice page kept "no sign-in needed" on its own heading for
//      three days after Atanas closed the whole app behind sign-in
//      (2026-09-22 -> found 2026-09-25). Nothing caught it because the suite
//      that reads that page signs in first and had never once arrived without
//      an account.
//   2. /check-company's page DESCRIPTION -- the line a search result shows --
//      said "Free, no account needed" (found 2026-09-27).
//   3. /check-company's own heading said "Free, nothing to join", and
//      /security told a security researcher "You do not need an account to
//      send it" while pointing them at /feedback, which is behind sign-in and
//      whose route answers 401. That page is public FOR THAT REASON: so
//      somebody who finds a hole is not told to sign up first. It then told
//      them to sign up first, while promising it had not. (Found 2026-09-28.)
//
// Each was written when it was true and outlived the rule. None was a coding
// mistake; all three were sentences nobody re-read. So this checks the
// sentences.
//
// It is deliberately blunt: ANY of these phrases anywhere in the app's source
// fails, and the fix is either to make it true or to say something else. If a
// phrase is ever genuinely correct -- on a page that really is public -- add it
// to ALLOWED below with the reason, which makes it a decision somebody took
// rather than a line that drifted.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";

const SRC = `${REPO}/web/src`;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// What a page must not claim. Written loosely on purpose: it is cheaper to
// re-word a sentence than to miss one.
const CLAIMS = [
  /no account needed/i,
  /nothing to join/i,
  /(do not|don't|dont) need an account/i,
  /without an account/i,
  /no sign[- ]?in needed/i,
  /without signing in/i,
  /no sign[- ]?up/i,
  /free to try, no/i,
];

// Phrases that are fine where they are, each with the reason. Empty today.
const ALLOWED = [
  // { file: "src/app/example/page.tsx", why: "that page IS public, see the Gate" },
];

const SKIP = new Set(["node_modules", ".next", "vendor"]);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

const files = walk(SRC);
check("there is source to read", files.length > 100, String(files.length));

const offenders = [];
for (const file of files) {
  const rel = path.relative(`${REPO}/web`, file);
  if (ALLOWED.some((a) => a.file === rel)) continue;
  // A comment explaining the rule is not a claim -- only what ships counts --
  // and the comments that explain THIS rule quote the very phrases it bans, so
  // stripping only single-line ones made the suite fail on its own fix. Block
  // comments are blanked line-for-line so the line numbers still point
  // somewhere real.
  const blank = (m) => m.replace(/[^\n]/g, "");
  const lines = fs
    .readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split("\n");
  lines.forEach((line, n) => {
    const code = line.replace(/\/\/.*/, "");
    if (!code.trim()) return;
    for (const claim of CLAIMS) {
      if (claim.test(code)) offenders.push(`${rel}:${n + 1} ${code.trim().slice(0, 90)}`);
    }
  });
}
check("no page tells anybody they can use it without an account", offenders.length === 0, offenders.join("\n    "));

// ---------------------------------------------------------------------------
// The Gate, so the list this is protecting is a real one
// ---------------------------------------------------------------------------
// If the app ever opens up, this suite must not quietly keep enforcing the old
// rule: the count below is what makes somebody come and look.
const shell = fs.readFileSync(`${SRC}/app/AppShell.tsx`, "utf8");
const gate = shell.slice(shell.indexOf("const isPublicPage"), shell.indexOf("useEffect", shell.indexOf("const isPublicPage")));
const exact = [...gate.matchAll(/pathname === "([^"]+)"/g)].map((m) => m[1]);
const prefixes = [...gate.matchAll(/pathname\.startsWith\("([^"]+)"\)/g)].map((m) => m[1]);
check("the Gate still names its public pages one by one", exact.length >= 6, JSON.stringify(exact));
check("...and the customer links are the only prefixes", JSON.stringify(prefixes.sort()) === JSON.stringify(["/i/", "/q/", "/r/"]), JSON.stringify(prefixes));
// Not an assertion about which pages -- an assertion that somebody decided.
// Changing the list is fine; changing it without reading this file is not.
check("the public list is still short enough to have been thought about", exact.length <= 10, `${exact.length}: ${exact.join(", ")}`);

// ---------------------------------------------------------------------------
// The one that reaches people who have not arrived yet
// ---------------------------------------------------------------------------
// A page's `description` is what a search result shows, so a false claim there
// is read by more people than the page itself.
const pages = files.filter((f) => f.endsWith("page.tsx"));
const metaOffenders = [];
for (const file of pages) {
  const text = fs.readFileSync(file, "utf8");
  const meta = /export const metadata[\s\S]{0,600}?\n\}/.exec(text)?.[0] ?? "";
  if (!meta) continue;
  for (const claim of CLAIMS) {
    if (claim.test(meta)) metaOffenders.push(path.relative(`${REPO}/web`, file));
  }
}
check("no page's search description promises it either", metaOffenders.length === 0, metaOffenders.join(", "));

// ---------------------------------------------------------------------------
// And the page written for people who have no account
// ---------------------------------------------------------------------------
// /security is public on purpose: "whoever finds a security problem almost
// certainly does not have an account, and telling them to make one first is
// how a report turns into a tweet" (the Gate's own words). It pointed them at
// /feedback, which is not public. Whatever it says, it must not claim the way
// in is open when it is not.
const security = fs.readFileSync(`${SRC}/app/security/page.tsx`, "utf8");
const feedbackIsPublic = exact.includes("/feedback");
const securityClaimsOpen = /(do not|don't) need an account/i.test(security.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""));
check("/security does not promise a way in that /feedback does not offer", !securityClaimsOpen || feedbackIsPublic, `claims open: ${securityClaimsOpen}, /feedback public: ${feedbackIsPublic}`);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
