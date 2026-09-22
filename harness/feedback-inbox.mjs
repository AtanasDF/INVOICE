// Start-of-session read of the feedback table (Atanas, 2026-09-22: "so you
// can see them, and then we can work on them"). Every row not yet in
// notes/feedback-inbox.md is appended as one unticked line; lines already
// there are never rewritten, so a tick and a note next to it survive every
// run. Prints only how many were new. The service key is read from the env
// file and never printed.
//
//   node feedback-inbox.mjs                  reads web/.env.local
//   ENV_FILE=/path/prod.env node feedback-inbox.mjs
//   INBOX_FILE=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...   (the tests)
import fs from "node:fs";
import path from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const ENV_FILE = process.env.ENV_FILE ?? path.join(HERE, "..", "web", ".env.local");
const INBOX = process.env.INBOX_FILE ?? path.join(HERE, "..", "notes", "feedback-inbox.md");
const HEADER = `# Feedback inbox

One line per piece of feedback sent from the app, oldest first, appended by
\`harness/feedback-inbox.mjs\` at the start of a session. Tick a line and write what was
done after it (\`[x] … — handled 2026-09-23: fixed in a1b2c3d\`); the script never
rewrites a line it has already written.

`;

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] === name) return m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {}
  return "";
}

const url = (process.env.SUPABASE_URL || env("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/$/, "");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.log("SUPABASE_SERVICE_ROLE_KEY (or the URL) is not set in " + ENV_FILE + ".");
  console.log("From web/: vercel env pull --environment=production <a file in the scratchpad>, then ENV_FILE=<that file> node feedback-inbox.mjs, then remove the file.");
  process.exit(2);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (p) => {
  const res = await fetch(url + p, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${p} answered ${res.status}`);
  return res.json();
};

let rows, users;
try {
  rows = await get("/rest/v1/feedback?select=id,user_id,message,category,page,created_at&order=created_at.asc");
  users = (await get("/auth/v1/admin/users?per_page=1000")).users ?? [];
} catch (e) {
  console.log(`Could not read the feedback table at ${url}: ${e.message}. Nothing written.`);
  process.exit(3);
}
const email = new Map(users.map((u) => [u.id, u.email]));

const existing = fs.existsSync(INBOX) ? fs.readFileSync(INBOX, "utf8") : "";
const seen = new Set([...existing.matchAll(/^- \[[ xX]\] ([0-9a-f]{8})\b/gm)].map((m) => m[1]));
const london = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fresh = rows.filter((r) => !seen.has(r.id.slice(0, 8)));
const lines = fresh.map((r) => `- [ ] ${r.id.slice(0, 8)} · ${london(r.created_at)} · ${email.get(r.user_id) ?? r.user_id} · ${r.category ?? "Other"} · ${r.page ?? "?"} — ${String(r.message).replace(/\s+/g, " ").trim()}`);
fs.writeFileSync(INBOX, (existing || HEADER).replace(/\n*$/, "\n") + (lines.length ? lines.join("\n") + "\n" : ""));
console.log(`${fresh.length} new`);
