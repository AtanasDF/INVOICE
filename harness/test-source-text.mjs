// Every source file is plain text. Two held raw control bytes (a NUL in a
// regex class, a NUL as a key separator) where an escape belonged: they
// worked, but git stored both files as binary, so their history showed no
// diff at all, and grep skipped them. Found 2026-09-22 when a search for the
// old site name missed a sender line in one of them.
import fs from "node:fs";
import path from "node:path";
const ROOT = "/Users/nasko/Desktop/INVOICE";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const SKIP = new Set(["node_modules", "vendor", "gen", ".next", ".vercel", ".git", "uploads", "multi"]);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return SKIP.has(e.name) || e.name.startsWith("profile") ? [] : walk(p);
  return /\.(tsx?|m?js|json|sql|html|css|py|sh|md)$/.test(e.name) && !/ \d+\./.test(e.name) ? [p] : [];
});
const files = ["web/src", "web/public", "web/supabase", "worker/src", "harness"].flatMap((d) => walk(path.join(ROOT, d)));
const bad = files.filter((f) => fs.readFileSync(f).some((b) => b === 0 || b === 127 || (b < 32 && b !== 9 && b !== 10 && b !== 13)));
check(`no raw control bytes in ${files.length} source files`, files.length > 300 && bad.length === 0, JSON.stringify(bad.map((f) => f.slice(ROOT.length + 1))));
const utf8 = files.filter((f) => { try { new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(f)); return false; } catch { return true; } });
check("all of them are UTF-8", utf8.length === 0, JSON.stringify(utf8.map((f) => f.slice(ROOT.length + 1))));
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
