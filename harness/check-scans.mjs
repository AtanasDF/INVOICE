// Marking the printed pile against the answer key (Atanas, 2026-09-23: "I want
// to scan at least 100 different documents and see how that goes. If a scan
// doesn't go through we are learning from it").
//
// He photographs the documents in the app and exports them; this compares what
// the reader made of each one against test-documents/expected.json and prints
// what it got wrong -- not just that it failed. That list is what the next
// scanner work is built from, so the output is a written record, not a score.
//
//   node check-scans.mjs scanned.json
//   node check-scans.mjs scanned.json --md > ../notes/scan-results.md
//
// `scanned.json` is whatever came out of the app, in any of these shapes:
//   [{ id: "D-001", vendor, date, gross, vat, type, invoiceNumber }, ...]
//   { "D-001": { ... }, ... }
// The id is the one printed at the foot of each sheet. A document with no id
// is reported as unmatched rather than quietly ignored.
import fs from "node:fs";

const KEY = new URL("./test-documents/expected.json", import.meta.url).pathname;
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const asMarkdown = args.includes("--md");

if (!file) {
  console.error("usage: node check-scans.mjs <scanned.json> [--md]");
  process.exit(2);
}

const expected = JSON.parse(fs.readFileSync(KEY, "utf8"));
const byId = new Map(expected.map((e) => [e.id, e]));

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, v]) => ({ id, ...v }));

// Money to pence, so 1234.5 and "£1,234.50" compare equal and nothing hinges
// on floating point.
const pence = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
// Dates in whatever order they came back, compared as a real day.
const day = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  return s;
};
// Suppliers are compared loosely: "Travis Perkins Ltd" for "Travis Perkins" is
// a right answer, and marking it wrong would bury the real failures.
const name = (v) => String(v ?? "").toLowerCase().replace(/\b(ltd|limited|plc|llp|uk|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const nameMatches = (got, want) => {
  const a = name(got), b = name(want);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

const fields = [
  ["vendor", (g, e) => nameMatches(g.vendor, e.vendor), (g) => g.vendor],
  ["date", (g, e) => (e.date === null ? day(g.date) === null || g.date === undefined : day(g.date) === day(e.date)), (g) => day(g.date)],
  ["total", (g, e) => pence(g.gross) === pence(e.gross), (g) => g.gross],
  ["VAT", (g, e) => e.vat === null || pence(g.vat) === pence(e.vat), (g) => g.vat],
  ["type", (g, e) => !g.type || g.type === e.type, (g) => g.type],
  ["number", (g, e) => !e.invoiceNumber || !g.invoiceNumber || String(g.invoiceNumber).trim() === String(e.invoiceNumber).trim(), (g) => g.invoiceNumber],
];

const marked = [];
const unmatched = [];
for (const got of rows) {
  const e = byId.get(got.id);
  if (!e) {
    unmatched.push(got.id ?? "(no id)");
    continue;
  }
  const wrong = fields
    .filter(([, ok]) => !ok(got, e))
    .map(([label, , show]) => ({ field: label, got: show(got) ?? "(nothing)", want: label === "total" ? e.gross : label === "VAT" ? e.vat : label === "date" ? e.date : label === "type" ? e.type : label === "number" ? e.invoiceNumber : e.vendor }));
  marked.push({ id: e.id, design: e.design, hard: e.hard, supplier: e.vendor, wrong });
}

const read = marked.filter((m) => m.wrong.length === 0);
const missed = marked.filter((m) => m.wrong.length > 0);
const notTried = expected.filter((e) => !rows.some((r) => r.id === e.id));

// What went wrong, by field and by design: one document failing is an anecdote,
// six of the same design failing is the next piece of work.
const tally = (list, pick) => {
  const m = new Map();
  for (const x of list) for (const k of pick(x)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const byField = tally(missed, (m) => m.wrong.map((w) => w.field));
const byDesign = tally(missed, (m) => [m.design]);

const out = [];
const say = (s = "") => out.push(s);

if (asMarkdown) {
  say(`# What the reader made of the printed pile`);
  say();
  say(`Marked by \`harness/check-scans.mjs\` against \`test-documents/expected.json\`.`);
  say();
  say(`**${read.length} of ${marked.length} read correctly.** ${notTried.length} not tried, ${unmatched.length} unmatched.`);
  say();
  if (byField.length) {
    say(`## What it got wrong, by field`);
    say();
    say(`| Field | Wrong on |`);
    say(`|---|---|`);
    for (const [f, n] of byField) say(`| ${f} | ${n} |`);
    say();
  }
  if (byDesign.length) {
    say(`## By design`);
    say();
    say(`| Design | Wrong |`);
    say(`|---|---|`);
    for (const [d, n] of byDesign) say(`| ${d} | ${n} |`);
    say();
  }
  if (missed.length) {
    say(`## Every one it got wrong`);
    say();
    for (const m of missed) {
      say(`**${m.id}** — ${m.supplier} (${m.design})${m.hard ? ` · *${m.hard}*` : ""}`);
      for (const w of m.wrong) say(`- ${w.field}: read **${w.got}**, should be **${w.want}**`);
      say();
    }
  }
  if (notTried.length) {
    say(`## Not tried yet`);
    say();
    say(notTried.map((e) => e.id).join(", "));
    say();
  }
} else {
  say(`${read.length} of ${marked.length} read correctly.`);
  if (unmatched.length) say(`${unmatched.length} had an id that is not in the key: ${unmatched.join(", ")}`);
  if (notTried.length) say(`${notTried.length} not tried: ${notTried.map((e) => e.id).join(", ")}`);
  say();
  for (const m of missed) {
    say(`${m.id}  ${m.supplier} (${m.design})`);
    if (m.hard) say(`   hard: ${m.hard}`);
    for (const w of m.wrong) say(`   ${w.field}: read ${w.got}, should be ${w.want}`);
  }
  if (byField.length) {
    say();
    say(`Worst fields: ${byField.map(([f, n]) => `${f} (${n})`).join(", ")}`);
    say(`Worst designs: ${byDesign.map(([d, n]) => `${d} (${n})`).join(", ")}`);
  }
}
console.log(out.join("\n"));
