// The chat's fences, with the switch ON and both services stood in for.
//
// This is the first thing in the app that costs money every time somebody
// uses it, with no natural limit: scanning has one, because people only have
// so many receipts, but one bored person can send a thousand messages, and an
// open model endpoint is a free model for anybody who finds the address.
//
// So what is tested here is not the answer -- it is every fence in front of
// the answer, and all of them are reached BEFORE a single token is spent:
// signed in, capped per account, a capped question, and the conversation
// window trimmed on the SERVER. A window enforced only by the page that
// sends the request is not a limit at all, and that is the one worth
// proving, so the stand-in records what the route actually sent.
import http from "node:http";
import { spawn } from "node:child_process";
import { HELP_CHAT_LIMITS } from "./gen/lib/helpChat.js";

const WEB = "/Users/nasko/Desktop/INVOICE/web";
const PORT = 3323;
const STUB = 3573;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const GOOD = "good-token";
// What the model stand-in does next: "fail" answers 500 (fast, so the
// per-account cap can be reached without waiting on retries), "busy" 429.
let mode = "fail";
const sent = [];

const stub = http.createServer((req, res) => {
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  // Supabase's own user endpoint, which is how the route checks the bearer.
  if ((req.url ?? "").startsWith("/auth/v1/user")) {
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (bearer !== GOOD) return send(401, { message: "invalid token" });
    return send(200, { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "someone@example.com" });
  }
  // Anything else is the model.
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    sent.push(raw);
    if (mode === "busy") return send(429, { error: { code: 429, message: "RESOURCE_EXHAUSTED" } });
    send(500, { error: { code: 500, message: "INTERNAL" } });
  });
});
await new Promise((r) => stub.listen(STUB, r));

const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
    NEXT_PUBLIC_HELP_CHAT: "on",
    GEMINI_API_KEY: "harness-key",
    GEMINI_API_BASE: `http://127.0.0.1:${STUB}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
  // Its own process group, so the whole tree can be killed at the end.
  // Killing `npx` alone leaves the `next dev` it started holding the port,
  // and the next run of this suite then dies on EADDRINUSE -- which is what
  // happened the first time it was run twice.
  detached: true,
});
let serverLog = "";
app.stdout.on("data", (d) => (serverLog += d));
app.stderr.on("data", (d) => (serverLog += d));

const ask = (messages, token = GOOD) =>
  fetch(`${base}/api/help-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(60000),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const one = (text) => [{ role: "you", text }];

try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${base}/api/help-chat`, { method: "POST", signal: AbortSignal.timeout(3000) })).status) break; } catch {}
    await sleep(1000);
  }

  // ---- Signed in, or nothing -------------------------------------------
  let r = await ask(one("how do I send an invoice?"), null);
  check("no token is refused", r.status === 401, JSON.stringify(r));
  check("and told to sign in, in plain words", /sign in/i.test(r.body?.error ?? ""), r.body?.error);
  r = await ask(one("how do I send an invoice?"), "not-a-real-token");
  check("a bad token is refused", r.status === 401, JSON.stringify(r));

  // ---- Nothing asked ---------------------------------------------------
  r = await ask([]);
  check("an empty conversation is refused", r.status === 400, JSON.stringify(r));
  r = await ask([{ role: "you", text: "   " }]);
  check("whitespace is not a question", r.status === 400, JSON.stringify(r));
  // Rubbish in the array must not reach the model or throw a 500.
  r = await ask([{ role: "you" }, null, 7, { text: "real question" }]);
  check("rubbish in the messages does not crash the route", r.status !== 500, JSON.stringify(r));

  // ---- A question, not a pasted document -------------------------------
  const before = sent.length;
  r = await ask(one("x".repeat(HELP_CHAT_LIMITS.maxQuestion + 1)));
  check("an over-long question is refused", r.status === 400, JSON.stringify(r));
  check("and refused without spending anything", sent.length === before, `${sent.length} vs ${before}`);
  check("its refusal leads to the email", /email/i.test(r.body?.error ?? ""), r.body?.error);

  // ---- The window is the spending limit, enforced here ------------------
  // The browser trims too, but a limit only the browser applies is no limit:
  // this request sends thirty messages on purpose.
  sent.length = 0;
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "app" : "you", text: `message ${i}` }));
  await ask(many);
  const payload = sent.join("\n");
  check("the model was asked something", sent.length > 0, String(sent.length));
  check("the newest message was sent", payload.includes("message 29"));
  check("the oldest was not", !payload.includes('message 0"'), "message 0 reached the model");
  // Six messages means message 24..29.
  check("exactly the window went, no more", !payload.includes('message 23"'), "message 23 reached the model");
  check("the grounding went with it", /Send an invoice/.test(payload), "the walkthroughs were not in the prompt");
  check("the three rules went with it", /cannot see their records/.test(payload) && /not their accountant/.test(payload));
  // Nothing about THEIR records can go, because the route never reads any.
  check("no account id was sent to the model", !payload.includes("11111111-1111-1111-1111-111111111111"), "the user's id reached the model");
  check("no email address was sent to the model", !payload.includes("someone@example.com"), "the user's email reached the model");

  // ---- What the model's own failures are said as ------------------------
  r = await ask(one("what is a quote?"));
  check("a model outage is not shown as a model outage", r.status === 503 && !/gemini|internal|500/i.test(r.body?.error ?? ""), JSON.stringify(r));
  check("it says what still works", /walkthrough/i.test(r.body?.error ?? ""), r.body?.error);
  mode = "busy";
  r = await ask(one("what is a quote?"));
  check("the model being busy reads as busy, not broken", r.status === 429 && /lot of questions/i.test(r.body?.error ?? ""), JSON.stringify(r));
  check("and still leads to the email", /email/i.test(r.body?.error ?? ""), r.body?.error);

  // ---- The per-account cap --------------------------------------------
  // The stand-in goes back to answering 500, so a 429 can now only have come
  // from the cap. It matters: the route says the same words for "your
  // account has had a lot this hour" and "the model is busy" -- which is
  // right for the person, both mean try later and here is what still works,
  // but it means the wording cannot tell the two apart. Reading a model 429
  // as the cap is exactly what this check did on its first run, and it
  // passed while proving nothing.
  mode = "fail";
  let capped = null;
  for (let i = 0; i < HELP_CHAT_LIMITS.perUser + 5 && !capped; i++) {
    const res = await ask(one(`question ${i}`));
    if (res.status === 429) capped = res;
  }
  check("the per-account cap stops it", !!capped, `never capped within ${HELP_CHAT_LIMITS.perUser + 5} tries`);
  check("the cap's refusal says what still works", /walkthrough/i.test(capped?.body?.error ?? ""), capped?.body?.error);
  check("the cap's refusal leads to the email", /email/i.test(capped?.body?.error ?? ""), capped?.body?.error);
  // Once capped, nothing more is spent.
  const spentAtCap = sent.length;
  await ask(one("one more"));
  check("a capped account spends nothing further", sent.length === spentAtCap, `${sent.length} vs ${spentAtCap}`);
} catch (err) {
  console.log("ERROR", err?.message ?? err);
  console.log(serverLog.slice(-1500));
  results.push(false);
} finally {
  try { process.kill(-app.pid, "SIGKILL"); } catch { app.kill("SIGKILL"); }
  stub.close();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
