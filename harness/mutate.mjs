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

const REPO = "/Users/nasko/Desktop/INVOICE";
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

const APP = "/Users/nasko/Desktop/INVOICE/web/src";

// Each one breaks something a person would actually notice.
const MUTATIONS = [
  { file: "lib/today.ts", find: 'timeZone: "Europe/London"', replace: 'timeZone: "UTC"',
    what: "the app asks UTC what day it is, not London", expect: ["test-midnight", "test-dates"] },
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
];

const cmd = process.argv[2] ?? "list";
if (cmd === "revert") {
  execSync("git checkout -- web/src", { cwd: REPO });
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
  if (!text.includes(m.find)) { console.log(`SKIP ${m.file}: cannot find ${JSON.stringify(m.find)} -- the code moved, fix the mutation`); continue; }
  console.log(`${cmd === "apply" ? "BREAK" : "would break"}: ${m.what}\n    ${m.file}: ${JSON.stringify(m.find)} -> ${JSON.stringify(m.replace)}\n    expect red: ${m.expect.join(", ")}`);
  if (cmd === "apply") { writeFileSync(path, text.replace(m.find, m.replace)); applied++; }
}
if (cmd === "apply" && applied) {
  guard();
  writeFileSync(MARKER, `${applied} mutations applied by harness/mutate.mjs\n`);
  console.log(`\n${applied} mutation(s) applied, and committing is now blocked until you revert.`);
  console.log("Rebuild, run the harness, then: node mutate.mjs revert");
}
