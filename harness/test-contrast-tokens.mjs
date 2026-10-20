// Contrast, worked out from the source in every theme.
//
// test-readable measures what is painted, which is the honest way -- but only
// on the pages it visits, with the data it seeds. A grey that fails on a
// screen it never opens (a public invoice footer, a picked row in a price
// comparison, the hint inside the signature pad) is never measured at all.
// This reads every className in web/src that sets BOTH a text colour and a
// background colour, or a text colour alone (which then sits on the page or
// a card), works out each pair from the --n-* scale in globals.css for each of
// the six themes, and fails any pair under WCAG AA: 4.5:1, or 3:1 for large
// text (text-xl and up, or text-lg bold).
//
// Colour is decoded the way the browser does it: hex for the scale, oklch for
// Tailwind's red/amber/green/blue, and dark mode's own overrides of those.
import fs from "node:fs";
import path from "node:path";
import { REPO } from "./repo.mjs";

const APP = `${REPO}/web/src`;
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const css = fs.readFileSync(`${APP}/app/globals.css`, "utf8");
const twTheme = fs.readFileSync(`${REPO}/web/node_modules/tailwindcss/theme.css`, "utf8");

const vars = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const blockAfter = (sel) => {
  const i = css.indexOf(sel);
  if (i < 0) throw new Error(`no ${sel} in globals.css`);
  const open = css.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    if (css[j] === "}" && --depth === 0) return css.slice(open + 1, j);
  }
};
const tw = vars(twTheme);
const root = vars(blockAfter(":root {"));
const THEMES = {
  grey: root,
  slate: { ...root, ...vars(blockAfter('[data-theme="slate"] {')) },
  sand: { ...root, ...vars(blockAfter('[data-theme="sand"] {')) },
  forest: { ...root, ...vars(blockAfter('[data-theme="forest"] {')) },
  ink: { ...root, ...vars(blockAfter('[data-theme="ink"] {')) },
  dark: { ...root, ...vars(blockAfter('[data-theme="dark"] {')) },
};

const oklchToRgb = (L, C, H) => {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  // Out-of-gamut channels are clipped, as the browser paints them.
  return lin.map((v) => Math.min(1, Math.max(0, v)));
};
const hexToLin = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
};
const lum = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
const resolve = (t, value, depth = 0) => {
  if (depth > 8) return null;
  value = value.trim();
  const v = value.match(/^var\(--([\w-]+)\)$/);
  if (v) return token(t, v[1], depth + 1);
  if (value.startsWith("#")) return lum(hexToLin(value));
  const o = value.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/);
  if (o) return lum(oklchToRgb(+o[1] / 100, +o[2], +o[3]));
  return null;
};
const token = (t, name, depth = 0) => {
  const theme = THEMES[t];
  if (name in theme) return resolve(t, theme[name], depth);
  if (name in tw) return resolve(t, tw[name], depth);
  return null;
};
// What a utility paints with. bg-white and text-white are --paper; neutral is the scale.
const colour = (t, kind) => {
  if (kind === "white") return token(t, "paper");
  if (kind === "black") return 0;
  if (kind === "ink-on-dark") return token(t, "ink-on-dark");
  if (kind === "accent") return token(t, "accent");
  if (kind === "accent-soft") return token(t, "accent-soft");
  const m = kind.match(/^neutral-(\d+)$/);
  if (m) return token(t, `n-${m[1]}`);
  return token(t, `color-${kind}`);
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const SKIP = new Set(["node_modules", ".next", "vendor"]);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });

const COLOUR = "(white|black|ink-on-dark|accent-soft|accent|neutral-\\d+|(?:red|amber|green|blue)-\\d+)";
const TEXT = new RegExp(`(?:^|\\s)text-${COLOUR}(?=\\s|$)`);
// An opaque background, or one at 90% and up, which reads as the colour.
const BG = new RegExp(`(?:^|\\s)bg-${COLOUR}(?:/9\\d)?(?=\\s|$)`);
// Any other background utility (bg-lock-on, bg-black/60, a gradient) is a
// colour this cannot decode, so the pair is left to test-readable.
const ANY_BG = /(?:^|\s)bg-(?!clip-|origin-|repeat|no-repeat|cover|contain|center|fixed|local|scroll|auto|none(?=\s|$))[\w-]+(?:\/\d+)?(?=\s|$)/;
// Measured by hand where the background is set in another string: each says why.
const ALLOWED = [
  // BIG_SCAN is bg-neutral-900: pale writing on the darkest tone, about 12:1, in every theme.
  ["app/page.tsx", "text-sm font-normal text-neutral-300"],
  // An icon beside its words, not text, and aria-hidden: 1.4.11 asks 3:1 only of graphics needed to understand.
  ["app/receipts/new/page.tsx", "DocumentIcon className"],
];
// Text that has no contrast requirement: a disabled control is exempt
// (WCAG 1.4.3), and so is a pale glyph somebody cannot read anyway.
const EXEMPT = /(?:^|\s)(?:pointer-events-none\s+absolute\s+inset-0)?(?:opacity-[1-4]\d)(?=\s|$)/;
const failures = [];
let pairs = 0;
for (const file of walk(APP)) {
  const rel = path.relative(APP, file);
  const src = fs.readFileSync(file, "utf8");
  // A string literal or template that looks like a class list.
  for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\n\\]|\\.)*)\1/g)) {
    const cls = m[2].replace(/\$\{[^}]*\}/g, " ");
    const text = cls.match(TEXT);
    if (!text || EXEMPT.test(cls)) continue;
    const bg = cls.match(BG);
    if (!bg && ANY_BG.test(cls)) continue;
    const near = src.slice(Math.max(0, m.index - 40), m.index + m[0].length);
    if (ALLOWED.some(([f, s]) => rel === f && near.includes(s))) continue;
    // Light writing with no background of its own sits on a dark one set
    // further up the tree, which a string cannot see: only dark-on-light is
    // assumed to be on the page.
    if (!bg && /^(white|ink-on-dark|accent-soft|neutral-(?:50|100|200))$/.test(text[1])) continue;
    // The camera's panels carry .camera-screen, which puts the light values
    // back in dark mode, and are black by nature: light writing with no
    // background of its own is on black, dark writing is on a panel set
    // further up.
    const camera = rel === "components/DocumentCapture.tsx";
    if (camera && !bg && /^(black|neutral-(?:[6-9]\d\d))$/.test(text[1])) continue;
    const large = /(?:^|\s)text-(?:xl|[2-9]xl)(?=\s|$)/.test(cls) || (/(?:^|\s)text-lg(?=\s|$)/.test(cls) && /(?:^|\s)font-(?:bold|semibold)(?=\s|$)/.test(cls));
    const need = large ? 3 : 4.5;
    const line = src.slice(0, m.index).split("\n").length;
    for (const t of Object.keys(THEMES)) {
      const fg = colour(camera ? "grey" : t, text[1]);
      const backs = bg ? [bg[1]] : camera ? ["black"] : ["white", "neutral-50"];
      for (const b of backs) {
        const bl = colour(camera ? "grey" : t, b);
        if (fg == null || bl == null) continue;
        pairs++;
        const r = ratio(fg, bl);
        if (r < need) failures.push(`${rel}:${line} ${t}: text-${text[1]} on ${bg ? "bg-" : "(page) "}${b} = ${r.toFixed(2)}:1, needs ${need}`);
      }
    }
  }
}
check(`the source pairs were found and measured (${pairs})`, pairs > 1000, String(pairs));
for (const f of failures) console.log("LOW", f);
check(`every text colour clears AA on its own background, in all six themes (${failures.length} below)`, failures.length === 0, String(failures.length));
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
