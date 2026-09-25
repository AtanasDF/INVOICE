// Backlog item 24: the same documents through both reading engines, timed
// and scored. Not a test and not in run-all.sh -- every run spends real
// Anthropic and Gemini credit (one read per document per engine).
//
// It runs the app's own reader (src/lib/scanExtraction.ts, compiled here
// the way run-all.sh compiles the logic suites) with the keys from
// web/.env.local loaded into this process and never printed. Documents
// come from gen-bench-docs.py, with the truth in bench-docs/manifest.json.
// Reads go one at a time so the timings are of the engine, not of ten
// requests fighting for the connection.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { REPO } from "./repo.mjs";
const HERE = new URL(".", import.meta.url).pathname;
const WEB = `${REPO}/web`;
const only = process.argv[2];

for (const line of fs.readFileSync(`${WEB}/.env.local`, "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
// Only the engines whose key is here: on 2026-09-21 the local .env.local
// had Gemini's and an empty ANTHROPIC_API_KEY, so the Claude half waited.
const ENGINES = [["gemini", "GEMINI_API_KEY"], ["claude", "ANTHROPIC_API_KEY"]].filter(([e, k]) => process.env[k] || console.log(`${e}: skipped, ${k} is not set`)).map(([e]) => e);
if (!ENGINES.length) process.exit(1);

fs.mkdirSync(`${HERE}gen-bench`, { recursive: true });
fs.writeFileSync(`${HERE}gen-bench/package.json`, '{"type":"module"}');
try { fs.symlinkSync(`${WEB}/node_modules`, `${HERE}gen-bench/node_modules`); } catch {}
execSync(`${WEB}/node_modules/.bin/tsc -p tsconfig.bench.json`, { cwd: HERE, stdio: "ignore" });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".js") ? [`${d}/${e.name}`] : []));
for (const f of walk(`${HERE}gen-bench/lib`)) {
  const t = fs.readFileSync(f, "utf8");
  const t2 = t.replace(/from "@\/lib\/([\w-]+)"/g, 'from "./$1.js"');
  if (t2 !== t) fs.writeFileSync(f, t2);
}
const { extractDocuments } = await import(`${HERE}gen-bench/lib/scanExtraction.js`);

// BENCH_DIR points the bench at another folder of documents with its own
// manifest.json -- the real ones copied out of the app on 2026-09-22 live
// in the session scratchpad and never in the repo.
const DIR = process.env.BENCH_DIR ? process.env.BENCH_DIR.replace(/\/?$/, "/") : `${HERE}bench-docs/`;
const TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
const manifest = JSON.parse(fs.readFileSync(`${DIR}manifest.json`, "utf8")).filter((d) => !only || d.file === only);
const close = (a, b) => a !== null && a !== undefined && Math.abs(Math.abs(Number(a)) - Math.abs(b)) < 0.011;
const results = [];
for (const engine of ENGINES) {
  for (const d of manifest) {
    const base64 = fs.readFileSync(`${DIR}${d.file}`).toString("base64");
    const mediaType = TYPES[d.file.split(".").pop().toLowerCase()] ?? "image/jpeg";
    const t0 = performance.now();
    let r = null, error = null;
    try { r = (await extractDocuments([{ mediaType, base64 }], [], engine))[0]; } catch (e) { error = String(e.message).slice(0, 120); }
    const ms = Math.round(performance.now() - t0);
    const first = d.vendor.toLowerCase().split(" ")[0];
    const row = {
      engine, file: d.file, ms, error,
      type: r?.documentType === d.documentType,
      vendor: !!r?.vendor && r.vendor.toLowerCase().includes(first),
      date: r?.date === d.date,
      total: close(r?.totalAmount, d.totalAmount),
      vat: close(r?.vatAmount, d.vatAmount),
      number: !!r && (d.invoiceNumber === null ? r.invoiceNumber == null || r.invoiceNumber === "" : r.invoiceNumber === d.invoiceNumber),
      // A manifest without a line count (the real documents) doesn't score it.
      lines: d.lines == null ? true : (r?.lineItems?.length ?? 0) === d.lines,
      got: r ? { type: r.documentType, vendor: r.vendor, date: r.date, total: r.totalAmount, vat: r.vatAmount, number: r.invoiceNumber, lines: r.lineItems?.length ?? 0 } : null,
      want: { type: d.documentType, vendor: d.vendor, date: d.date, total: d.totalAmount, vat: d.vatAmount, number: d.invoiceNumber, lines: d.lines },
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}
fs.writeFileSync(`${DIR}results.json`, JSON.stringify(results, null, 1));

const FIELDS = ["type", "vendor", "date", "total", "vat", "number", "lines"];
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
console.log("\n| engine | docs | read | median s | mean s | slowest s | " + FIELDS.join(" | ") + " | all seven |");
console.log("|---|---|---|---|---|---|" + FIELDS.map(() => "---").join("|") + "|---|");
for (const engine of ENGINES) {
  const rows = results.filter((r) => r.engine === engine);
  const ok = rows.filter((r) => !r.error);
  const times = ok.map((r) => r.ms / 1000);
  const counts = FIELDS.map((f) => rows.filter((r) => r[f]).length);
  const all = rows.filter((r) => FIELDS.every((f) => r[f])).length;
  console.log(`| ${engine} | ${rows.length} | ${ok.length} | ${median(times).toFixed(1)} | ${(times.reduce((a, b) => a + b, 0) / (times.length || 1)).toFixed(1)} | ${Math.max(0, ...times).toFixed(1)} | ${counts.join(" | ")} | ${all} |`);
}
