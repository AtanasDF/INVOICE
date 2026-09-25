// Colours written into a component instead of taken from the theme. The
// house style forbids it, and the spending chart showed exactly why: its
// bars were #171717, which is the grey theme's darkest ink, so in dark mode
// they were black bars on a near-black card. Nobody would have found that
// without opening the page in dark mode and looking.
//
// This reads the source rather than a screen, because that is where the
// rule lives and because a hex nobody has rendered yet is still a hex.
import fs from "fs";
import path from "path";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const SRC = `${REPO}/web/src`;

// Places a fixed colour is RIGHT, each for a reason, not because it was
// easier. Anything not on this list has to follow the theme.
const ALLOWED = {
  "components/DocumentCapture.tsx":
    "the camera is black by nature: the lock-on green must stay the same green whatever the app looks like",
  "components/ThemePicker.tsx":
    "the swatches ARE the themes -- they have to show their own colours, not the current one",
  "components/free-invoice/SignaturePad.tsx":
    "the ink is going on a printed invoice; the pad itself is bg-sheet, which is paper and never themed",
  "app/opengraph-image.tsx":
    "generated as a PNG on the server, where none of the app's CSS exists",
  "app/global-error.tsx":
    "replaces the whole document when the layout itself has thrown, so no stylesheet is loaded",
  "components/SpendChart.tsx":
    "fallbacks only, used if a variable is missing; the real values are read off the page",
};

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx$/.test(entry.name)) files.push(full);
  }
})(SRC);

const offenders = [];
for (const file of files) {
  const rel = path.relative(SRC, file);
  const text = fs.readFileSync(file, "utf8");
  // Strip comments first: a hex NAMED in a comment explaining the rule is
  // not a hex being used, and this suite's own commit messages are full of
  // them.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  if (!hexes.length) continue;
  if (ALLOWED[rel]) continue;
  offenders.push(`${rel}: ${[...new Set(hexes)].slice(0, 4).join(", ")}`);
}

check("no component writes a colour in by hand", offenders.length === 0, JSON.stringify(offenders));

// The list of exceptions must not rot: one that no longer has any hex in it
// is an exception protecting nothing, and the next person to add one there
// gets a free pass they should not have.
const stale = Object.keys(ALLOWED).filter((rel) => {
  const full = path.join(SRC, rel);
  if (!fs.existsSync(full)) return true;
  const code = fs.readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return !/#[0-9a-fA-F]{3,8}\b/.test(code);
});
check("every exception still has something to except", stale.length === 0, JSON.stringify(stale));
check("and every one of them says why", Object.values(ALLOWED).every((why) => why.length > 40));

// The theme's own tokens: a colour that must never invert needs a name, or
// somebody will reach for a hex again.
const globals = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
for (const token of ["--ink-on-dark", "--sheet"]) {
  const dark = globals.slice(globals.indexOf('[data-theme="dark"]'));
  check(`${token} is defined and never redefined by the dark theme`,
    globals.includes(`${token}:`) && !dark.includes(`${token}:`),
    `defined: ${globals.includes(`${token}:`)}, redefined in dark: ${dark.includes(`${token}:`)}`);
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
