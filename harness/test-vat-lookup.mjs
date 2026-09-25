// Checking a VAT number against HMRC, with HMRC stood in for.
//
// HMRC's "Check a UK VAT number" API is the only thing that knows whether a
// number is real and whose it is: GB numbers left the EU's VIES service
// after Brexit, so nothing else can answer for Britain. It is
// application-restricted -- credentials from HMRC's Developer Hub -- which
// is why the route takes HMRC_API_BASE, exactly as the Companies House and
// Ideal Postcodes routes do, and why this suite can exercise the whole path
// without a real key.
//
// What is proved here is the part that can go wrong silently: that a number
// nobody holds is an ANSWER and not an outage; that an outage is not
// reported as "nobody holds it"; that our own credentials being refused is
// never said to the person; and that the same number is not asked for
// twice.
import http from "node:http";
import { spawn } from "node:child_process";
import { REPO } from "./repo.mjs";

const WEB = `${REPO}/web`;
const PORT = 3319;
const STUB = 3569;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// ---- The stand-in for HMRC -------------------------------------------------
const REGISTERED = {
  "220430231": { name: "TESCO STORES LIMITED", address: { line1: "Tesco House, Shire Park, Kestrel Way", postcode: "AL7 1GA", countryCode: "GB" } },
};
let mode = "normal";
let consultations = 1;
const stub = http.createServer((req, res) => {
  stub.log.push(req.url);
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.url === "/oauth/token") {
    if (mode === "no-token") return send(401, { code: "INVALID_CREDENTIALS" });
    return send(200, { access_token: "stub-server-token", expires_in: 14400, token_type: "bearer" });
  }
  // Both forms: with our own VAT number as well, HMRC issues a consultation
  // number -- the reference that proves the check was made.
  const two = /\/organisations\/vat\/check-vat-number\/lookup\/(\d+)\/(\d+)$/.exec(req.url ?? "");
  const m = two ?? /\/organisations\/vat\/check-vat-number\/lookup\/(\d+)$/.exec(req.url ?? "");
  if (m) {
    if (mode === "down") return send(500, { code: "INTERNAL_SERVER_ERROR" });
    if (mode === "refused") return send(403, { code: "FORBIDDEN" });
    // Our own number refused: HMRC answers 403 on the two-number form only.
    if (two && mode === "ours-refused") return send(403, { code: "FORBIDDEN" });
    const found = REGISTERED[m[1]];
    if (!found) return send(404, { code: "NOT_FOUND" });
    const target = { name: found.name, vatNumber: m[1], address: found.address };
    return two
      ? send(200, { target, requester: two[2], consultationNumber: `ref-${consultations++}`, processingDate: "2026-09-25T09:00:00+00:00" })
      : send(200, { target, processingDate: "2026-09-25T09:00:00+00:00" });
  }
  send(404, { code: "NOT_FOUND" });
});
stub.log = [];
await new Promise((r) => stub.listen(STUB, r));

const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], {
  cwd: WEB,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:1",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
    HMRC_API_BASE: `http://127.0.0.1:${STUB}`,
    HMRC_CLIENT_ID: "harness-client",
    HMRC_CLIENT_SECRET: "harness-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
app.stdout.on("data", (d) => (serverLog += d));
app.stderr.on("data", (d) => (serverLog += d));

const ask = (number, ip = "10.0.0.1") =>
  fetch(`${base}/api/vat-check?number=${encodeURIComponent(number)}`, { headers: { "x-forwarded-for": ip }, signal: AbortSignal.timeout(60000) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

try {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${base}/api/vat-check?number=`, { signal: AbortSignal.timeout(3000) })).ok) break; } catch {}
    await sleep(1000);
  }

  let r = await ask("GB 220 4302 31");
  check("a real number comes back with whose it is", r.status === 200 && r.body?.registered === true && /TESCO/.test(r.body?.name ?? ""), JSON.stringify(r));
  // line1, postcode, countryCode is the WHOLE of HMRC's address: checked
  // against their OpenAPI spec, not guessed. The first version of the route
  // read line1 through line8, which no response has ever carried.
  check("the address comes back in one line, in order", /^Tesco House, Shire Park, Kestrel Way, AL7 1GA, GB$/.test(r.body?.address ?? ""), r.body?.address);

  // Asked again: from memory, not from HMRC. A supplier's number is looked
  // up every time their invoice is scanned.
  const before = stub.log.filter((u) => u.includes("/lookup/")).length;
  await ask("220430231");
  check("the same number is not asked of HMRC twice", stub.log.filter((u) => u.includes("/lookup/")).length === before, String(before));

  // 404 from HMRC is the answer to the question, not a failure.
  r = await ask("660454836");
  check("a number nobody holds is an answer, not an outage", r.status === 200 && r.body?.registered === false && !r.body?.unavailable, JSON.stringify(r));

  // The check digits are done before anything leaves the machine.
  const asked = stub.log.length;
  r = await ask("220430232");
  check("a mistyped number is refused without asking HMRC", r.body?.format === "wrong" && stub.log.length === asked, JSON.stringify(r));
  check("and the refusal is in plain words", /don't add up/.test(r.body?.reason ?? ""), r.body?.reason);
  r = await ask("");
  check("an empty box asks nothing and is not an error", r.body?.format === "empty" && r.status === 200, JSON.stringify(r));
  r = await ask("GD001");
  check("a government department is recognised, not looked up", r.body?.format === "department", JSON.stringify(r));

  mode = "down";
  r = await ask("123456782", "10.0.0.2");
  check("HMRC being down is told apart from nobody holding the number", r.status === 503 && r.body?.unavailable === true && r.body?.registered === undefined, JSON.stringify(r));

  // Our key being wrong is OUR fault and must never be described to the
  // person as anything they can act on -- the Companies House key was
  // pasted wrong once and this is how it showed up.
  mode = "refused";
  r = await ask("765432126", "10.0.0.3");
  check("our own credentials being refused reads as an outage", r.status === 503 && r.body?.unavailable === true, JSON.stringify(r));
  check("and nothing of HMRC's wording reaches the person", !/FORBIDDEN|403|credential/i.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  check("the real reason is in our own log", /refused our credentials/.test(serverLog), serverLog.slice(-200));


  // ---- The reference that proves you checked ------------------------------
  // The credentials test above left the stand-in refusing everything.
  mode = "normal";
  // HMRC's verified check: given the supplier's number AND your own, it
  // returns a consultation number. Nobody else in the research offers it,
  // and it is the evidence HMRC asks for if they query the VAT reclaimed
  // against a supplier who turns out not to have been registered.
  const asked2 = stub.log.filter((u) => u.includes("/lookup/")).length;
  let v = await fetch(`${base}/api/vat-check?number=GB220430231&mine=GB660454836`, { headers: { "x-forwarded-for": "10.0.0.9" } }).then(async (x) => ({ status: x.status, body: await x.json() }));
  check("with our own number too, a reference comes back", v.status === 200 && /^ref-/.test(v.body?.consultationNumber ?? ""), JSON.stringify(v.body));
  check("and the day it was made", /^2026-09-25/.test(v.body?.checkedOn ?? ""), JSON.stringify(v.body?.checkedOn));
  check("it went to the two-number endpoint", stub.log.filter((u) => /\/lookup\/\d+\/\d+$/.test(u)).length === 1, JSON.stringify(stub.log.slice(-2)));

  // A reference is issued per request and dated. Answering a second request
  // from memory would hand back a reference to a check that did not happen.
  const first = v.body.consultationNumber;
  v = await fetch(`${base}/api/vat-check?number=GB220430231&mine=GB660454836`, { headers: { "x-forwarded-for": "10.0.0.9" } }).then(async (x) => ({ status: x.status, body: await x.json() }));
  check("a second check gets its own reference, never the cached one", v.body?.consultationNumber && v.body.consultationNumber !== first, `${first} then ${v.body?.consultationNumber}`);

  // Our own number refused is not the customer's problem: the answer they
  // wanted -- is this supplier registered -- is still there to be had.
  mode = "ours-refused";
  v = await fetch(`${base}/api/vat-check?number=GB220430231&mine=GB660454836`, { headers: { "x-forwarded-for": "10.0.0.10" } }).then(async (x) => ({ status: x.status, body: await x.json() }));
  check("if OUR number is refused, the plain answer still comes", v.status === 200 && v.body?.registered === true && !v.body?.consultationNumber, JSON.stringify(v.body));
  mode = "normal";

  // A mistyped number of our own is simply not sent: it would earn a 403
  // and cost a call.
  const before2 = stub.log.filter((u) => /\/lookup\/\d+\/\d+$/.test(u)).length;
  v = await fetch(`${base}/api/vat-check?number=GB220430231&mine=GB123`, { headers: { "x-forwarded-for": "10.0.0.11" } }).then(async (x) => ({ status: x.status, body: await x.json() }));
  check("a mistyped number of our own is left out rather than sent", stub.log.filter((u) => /\/lookup\/\d+\/\d+$/.test(u)).length === before2 && v.body?.registered === true, JSON.stringify(v.body));
  check("the lookups actually happened", stub.log.filter((u) => u.includes("/lookup/")).length > asked2, String(asked2));

  mode = "normal";

  // Without credentials the box still catches a typo and says nothing about
  // HMRC. Proved by a second server that has none -- started only once the
  // first has stopped, because two `next dev` in one folder trip over the
  // same build cache (the reason run-all.sh runs these one at a time).
  app.kill("SIGTERM");
  await sleep(2000);
  const bare = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT + 1)], {
    cwd: WEB,
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", SUPABASE_SERVICE_ROLE_KEY: "k", HMRC_API_BASE: `http://127.0.0.1:${STUB}`, HMRC_CLIENT_ID: "", HMRC_CLIENT_SECRET: "" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(`http://localhost:${PORT + 1}/api/vat-check?number=`, { signal: AbortSignal.timeout(3000) })).ok) break; } catch {}
      await sleep(1000);
    }
    const asked2 = stub.log.length;
    const res = await fetch(`http://localhost:${PORT + 1}/api/vat-check?number=220430231`, { signal: AbortSignal.timeout(60000) });
    const body = await res.json();
    check("with no credentials it says so rather than pretending", body.configured === false && body.format === "ok", JSON.stringify(body));
    check("and asks HMRC nothing at all", stub.log.length === asked2, String(stub.log.length - asked2));
    const typo = await fetch(`http://localhost:${PORT + 1}/api/vat-check?number=220430232`).then((r2) => r2.json());
    check("the check digits still catch a typo with no credentials", typo.format === "wrong", JSON.stringify(typo));
  } finally {
    bare.kill("SIGTERM");
  }
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  app.kill("SIGTERM");
  stub.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
