// The source half of test-camera-dark, which runs without a browser: the CSS
// that gives the camera its light values back in dark mode, the panels that
// carry it, and the lock-on green as a token rather than a hex in a class.
import fs from "node:fs";
import { REPO } from "./repo.mjs";

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const css = fs.readFileSync(`${REPO}/web/src/app/globals.css`, "utf8");
const cap = fs.readFileSync(`${REPO}/web/src/components/DocumentCapture.tsx`, "utf8");
const tip = fs.readFileSync(`${REPO}/web/src/components/Tip.tsx`, "utf8");

const block = /\[data-theme="dark"\] \.paper-sheet,\s*\[data-theme="dark"\] \.camera-screen \{([^}]*)\}/.exec(css)?.[1] ?? "";
check("dark mode has a rule for .camera-screen", block.length > 0);
check("it puts white back as white", /--paper:\s*#ffffff/.test(block));
check("it puts the dark ink back", /--n-900:\s*#171717/.test(block) && /--n-200:\s*#e5e5e5/.test(block) && /--n-400:\s*#a3a3a3/.test(block));
check("it puts red-600 back, so white words on the failure box can be read", /--color-red-600:\s*oklch\(57\.7%/.test(block));
check("the paper sheet keeps its own accent, apart from the camera", /\[data-theme="dark"\] \.paper-sheet \{\s*--accent: #404040;/.test(css));

const panels = (cap.match(/className=\{?[`"]camera-screen /g) ?? []).length;
check("the four camera panels carry it", panels === 4, String(panels));
const review = cap.slice(cap.lastIndexOf("{review}") - 400, cap.lastIndexOf("{review}"));
check("the review sheet is outside them, so it still follows the lights", /<\/div>\s*\{review\}/.test(cap.slice(cap.lastIndexOf("{review}") - 20, cap.lastIndexOf("{review}") + 8)) && review.length > 0);

check("the lock-on green is a token", /--lock-on:\s*#4ade80/.test(css) && /--color-lock-on:\s*var\(--lock-on\)/.test(css));
check("no class in the camera writes the green as a hex", !/\[#4ADE80\]/i.test(cap));
check("the canvas outline is the same green", /const GREEN = "#4ADE80"/.test(cap));
check('the dark tip\'s "Got it" is ink-on-dark, not white (near-black in dark mode)', /dark \? "text-ink-on-dark\/80"/.test(tip) && !/text-white\/80/.test(tip));

const passed = results.filter(Boolean).length;
console.log(JSON.stringify({ passed, total: results.length }));
process.exit(passed === results.length ? 0 : 1);
