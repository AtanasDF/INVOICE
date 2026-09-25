// Every door, tried by somebody who has no business opening it.
//
// A wrong number is a bug. A route that answers somebody else's records is
// a breach, and it is the one kind of failure this app cannot apologise its
// way out of -- these are real accounting records belonging to real people.
//
// So: hit every API route with no session, with a made-up bearer token, and
// with a token-shaped string that is not a token. Assert three things each
// time. It must refuse. It must not leak a record. And the refusal must not
// hand back Postgres's or Supabase's own wording, which is the thing that
// tells an attacker what is behind the door.
//
// Run against a server pointed at a Supabase that says "no" to everything,
// so nothing here can touch a real record even by accident.
import http from "node:http";
import { spawn } from "node:child_process";
import { REPO } from "./repo.mjs";

const WEB = `${REPO}/web`;
const PORT = 3322;
const STUB = 3572;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// A Supabase that knows nobody and holds nothing.
//
// `knowsSomebody` is the positive control. Every refusal below could come
// from the stub failing rather than from the door being locked, and a
// suite that cannot tell those apart proves nothing -- so at the end it is
// switched on, and the same routes must stop answering 401.
let knowsSomebody = false;
const stub = http.createServer((req, res) => {
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.url?.startsWith("/auth/v1/user")) {
    return knowsSomebody
      ? send(200, { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", email: "someone@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" })
      : send(401, { message: "invalid claim: missing sub claim", code: 401 });
  }
  if (req.url?.startsWith("/rest/v1/")) return send(200, []);
  send(404, { message: "not found" });
});
await new Promise((r) => stub.listen(STUB, r));

const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon",
    SUPABASE_SERVICE_ROLE_KEY: "stub-service",
    CRON_SECRET: "stub-cron-secret",
    INBOX_WEBHOOK_SECRET: "stub-inbox-secret",
  },
  stdio: ["ignore", "ignore", "ignore"],
});

// Every route, how it is called, and whether it is a door with a lock or a
// door with a token. The token ones are open ON PURPOSE -- a customer
// opening an invoice link has no account and never will -- so what is
// checked there is that a wrong token gets nothing.
const GUARDED = [
  ["POST", "/api/contact-scan", { image: "data:image/png;base64,iVBOR" }],
  ["POST", "/api/scan", { image: "data:image/png;base64,iVBOR" }],
  ["POST", "/api/invoice-template", { image: "data:image/png;base64,iVBOR" }],
  ["POST", "/api/invoice-from-text", { text: "hello" }],
  ["POST", "/api/send-invoice", { to: "a@b.c", pdf: "x", confirmed: true }],
  ["POST", "/api/send-document", { to: "a@b.c", pdf: "x", confirmed: true }],
  ["POST", "/api/price-guide", { items: ["screws"] }],
  ["POST", "/api/quote-requests/send", { requestId: "x" }],
  ["POST", "/api/feedback", { kind: "Bug", message: "hello", page: "/" }],
];
const CRON = ["/api/reminders/send", "/api/recurring-invoices/generate", "/api/notifications/check", "/api/notifications/weekly", "/api/photos/age"];
const TOKEN_DOORS = [
  ["POST", "/api/quote-links/respond", { token: "a".repeat(43), answer: "accepted" }],
  ["POST", "/api/quote-links/seen", { token: "a".repeat(43) }],
  ["POST", "/api/invoice-links/seen", { token: "a".repeat(43) }],
  ["POST", "/api/quote-requests/respond", { token: "a".repeat(43), prices: {} }],
];

const call = (method, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(60000),
  }).then(async (r) => ({ status: r.status, text: (await r.text()).slice(0, 600) }));

// Anything that would tell somebody what is behind the door.
const LEAKY = /(supabase|postgres|PGRST|relation ".*" does not exist|service_role|anon key|SUPABASE_|at Object\.|\/Users\/|node_modules|stack)/i;

try {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${base}/api/vat-check?number=`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch {}
    await sleep(1000);
  }

  // ---- Locked doors, no key --------------------------------------------------
  const refused = [], leaked = [];
  for (const [method, path, body] of GUARDED) {
    for (const headers of [{}, { authorization: "Bearer not-a-real-token" }, { authorization: "Bearer " + "z".repeat(200) }]) {
      const r = await call(method, path, body, headers);
      if (r.status !== 401 && r.status !== 403) refused.push(`${path} ${JSON.stringify(headers).slice(0, 30)} -> ${r.status} ${r.text.slice(0, 80)}`);
      if (LEAKY.test(r.text)) leaked.push(`${path} -> ${r.text.slice(0, 120)}`);
    }
  }
  check(`every signed-in route refuses a stranger (${GUARDED.length} routes, 3 ways each)`, refused.length === 0, JSON.stringify(refused.slice(0, 4)));
  check("and none of them says how it is built", leaked.length === 0, JSON.stringify(leaked.slice(0, 3)));

  // ---- The crons -------------------------------------------------------------
  const cronOpen = [], cronLeak = [];
  for (const path of CRON) {
    for (const headers of [{}, { authorization: "Bearer wrong-cron" }]) {
      const r = await call("GET", path, null, headers);
      if (r.status !== 401 && r.status !== 403) cronOpen.push(`${path} -> ${r.status} ${r.text.slice(0, 80)}`);
      if (LEAKY.test(r.text)) cronLeak.push(`${path} -> ${r.text.slice(0, 120)}`);
    }
  }
  check(`the scheduled jobs cannot be run by anybody (${CRON.length})`, cronOpen.length === 0, JSON.stringify(cronOpen.slice(0, 4)));
  check("and they give nothing away either", cronLeak.length === 0, JSON.stringify(cronLeak.slice(0, 3)));
  // The one that deletes. It must refuse loudest of all.
  const ageing = await call("GET", "/api/photos/age", null, {});
  check("the only job that removes anything refuses hardest", ageing.status === 401 || ageing.status === 403, JSON.stringify(ageing));

  // ---- Doors with a token, tried with the wrong one --------------------------
  const tokenLeaks = [], tokenOk = [];
  for (const [method, path, body] of TOKEN_DOORS) {
    for (const token of ["", "a".repeat(43), "../../etc/passwd", "' or 1=1 --", "null", "a".repeat(5000)]) {
      const r = await call(method, path, { ...body, token }, {});
      if (r.status === 200 && /"(number|total|amount|name|email|items)"\s*:/.test(r.text)) tokenOk.push(`${path} token=${token.slice(0, 12)} -> ${r.text.slice(0, 120)}`);
      if (LEAKY.test(r.text)) tokenLeaks.push(`${path} -> ${r.text.slice(0, 140)}`);
    }
  }
  check(`a wrong token opens nothing (${TOKEN_DOORS.length} links, 6 tokens each)`, tokenOk.length === 0, JSON.stringify(tokenOk.slice(0, 3)));
  check("and a wrong token is told nothing about the database", tokenLeaks.length === 0, JSON.stringify(tokenLeaks.slice(0, 3)));

  // ---- The customer pages themselves -----------------------------------------
  const pages = [];
  for (const path of ["/i/" + "a".repeat(43), "/q/" + "b".repeat(43), "/r/" + "c".repeat(43)]) {
    const r = await call("GET", path, null, {});
    if (LEAKY.test(r.text)) pages.push(`${path} -> ${r.text.slice(0, 140)}`);
    if (/"clientId"|"userId"|user_id/.test(r.text)) pages.push(`${path} leaked an id`);
  }
  check("a made-up customer link shows nothing of anybody's", pages.length === 0, JSON.stringify(pages.slice(0, 3)));

  // ---- Method confusion -------------------------------------------------------
  // A POST-only route answering a GET is how a link in an email becomes an
  // action.
  const wrongMethod = [];
  for (const [, path] of [...GUARDED, ...TOKEN_DOORS]) {
    const r = await call("GET", path, null, {});
    if (r.status === 200) wrongMethod.push(`${path} answered a GET with 200`);
  }
  check("nothing that acts answers a plain GET", wrongMethod.length === 0, JSON.stringify(wrongMethod.slice(0, 4)));

  // ---- The positive control ---------------------------------------------------
  // Everything above would also pass if the stub simply broke every request.
  // With a user behind the token, the same routes must stop saying 401 --
  // otherwise this whole file has been testing a broken stub.
  knowsSomebody = true;
  const stillRefusing = [];
  for (const [method, path, body] of GUARDED) {
    const r = await call(method, path, body, { authorization: "Bearer a-token-the-stub-now-accepts" });
    if (r.status === 401) stillRefusing.push(`${path} -> still 401`);
  }
  check("with a real session the same doors open (so the 401s meant something)", stillRefusing.length === 0, JSON.stringify(stillRefusing.slice(0, 4)));
} catch (e) { console.log("ERROR", e.message); results.push(false); }
finally {
  app.kill("SIGTERM");
  stub.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
