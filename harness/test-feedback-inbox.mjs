// The start-of-session read of feedback: new rows appended to the inbox
// file as unticked lines, a tick and a note next to one surviving every
// later run, nothing written twice, the service key never printed. A
// stand-in for Supabase's REST and admin endpoints answers here.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const HERE = new URL(".", import.meta.url).pathname;
const KEY = "service-role-key-that-must-never-print-9f8e7d";
const PORT = 3417;

const rows = [
  { id: "aaaaaaaa-0000-0000-0000-000000000001", user_id: "u1", message: "The Save button\nis hidden", category: "Confusing", page: "/settings", created_at: "2026-07-01T09:05:00Z" },
  { id: "bbbbbbbb-0000-0000-0000-000000000002", user_id: "u2", message: "Love it", category: null, page: null, created_at: "2026-07-02T10:00:00Z" },
  { id: "cccccccc-0000-0000-0000-000000000003", user_id: "u1", message: "Scan failed twice", category: "Bug", page: "/scan", created_at: "2026-07-03T11:30:00Z" },
];
const users = [{ id: "u1", email: "tester@example.com" }, { id: "u2", email: "second@example.com" }];
let unauthorised = 0;
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${KEY}`) { unauthorised++; res.writeHead(401); res.end("{}"); return; }
  if (req.url.startsWith("/rest/v1/feedback")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(rows)); return; }
  if (req.url.startsWith("/auth/v1/admin/users")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ users })); return; }
  res.writeHead(404); res.end("{}");
});
server.listen(PORT);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-inbox-"));
const inbox = path.join(dir, "feedback-inbox.md");
// Spawned, not spawnSync: the stand-in server lives in this process and
// has to answer while the script runs.
const runWith = (extra) => new Promise((resolve) => {
  const child = spawn("node", [path.join(HERE, "feedback-inbox.mjs")], { env: { ...process.env, SUPABASE_URL: `http://localhost:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: KEY, INBOX_FILE: inbox, TZ: "UTC", ...extra } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => resolve({ out: out.trim(), code }));
});
const run = () => runWith({});

try {
  await new Promise((r) => server.once("listening", r));
  let r = await run();
  let file = fs.readFileSync(inbox, "utf8");
  check("first run: three new, the file made with its header", r.code === 0 && r.out === "3 new" && file.startsWith("# Feedback inbox"), JSON.stringify(r));
  const lines = () => fs.readFileSync(inbox, "utf8").split("\n").filter((l) => l.startsWith("- ["));
  check("one line per row, oldest first, with the sender's address", lines().length === 3 && /^- \[ \] aaaaaaaa · 01 Jul 2026, 10:05 · tester@example.com · Confusing · \/settings — The Save button is hidden$/.test(lines()[0]), lines()[0]);
  check("no category reads Other, no page a question mark", /· second@example.com · Other · \? — Love it$/.test(lines()[1]), lines()[1]);
  check("the key is not in the output or the file", !r.out.includes(KEY) && !file.includes(KEY));

  r = await run();
  check("second run: nothing new, nothing added", r.out === "0 new" && lines().length === 3, JSON.stringify({ out: r.out, n: lines().length }));

  file = fs.readFileSync(inbox, "utf8").replace("- [ ] aaaaaaaa", "- [x] aaaaaaaa").replace("The Save button is hidden", "The Save button is hidden — handled 2026-09-23: fixed in f70d483");
  fs.writeFileSync(inbox, file);
  rows.push({ id: "dddddddd-0000-0000-0000-000000000004", user_id: "u9", message: "  spaced   out  ", category: "Other", page: "/", created_at: "2026-07-04T08:00:00Z" });
  r = await run();
  check("a tick and a note survive, the new row is appended after", r.out === "1 new" && lines().length === 4 && lines()[0].startsWith("- [x] aaaaaaaa") && lines()[0].includes("handled 2026-09-23") && lines()[3].startsWith("- [ ] dddddddd"), JSON.stringify(lines()));
  check("an unknown sender shows as its id, and whitespace is folded", /· u9 · Other · \/ — spaced out$/.test(lines()[3]), lines()[3]);
  check("every call carried the key, none were refused", unauthorised === 0, String(unauthorised));

  const bad = await runWith({ SUPABASE_SERVICE_ROLE_KEY: "", ENV_FILE: path.join(dir, "missing.env") });
  check("with no key it says what to do and touches nothing", bad.code === 2 && /vercel env pull/.test(bad.out) && lines().length === 4, JSON.stringify(bad));
  const down = await runWith({ SUPABASE_URL: "http://localhost:1" });
  check("with the database unreachable it says so and touches nothing", down.code === 3 && /Could not read the feedback table/.test(down.out) && lines().length === 4, JSON.stringify(down));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  server.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
