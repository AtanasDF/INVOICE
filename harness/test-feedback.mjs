// The feedback route on its own dev server: the row saved as the sender,
// the email to the maker through a stand-in for Resend, and what happens
// when Resend fails or the note is too long. Mocked database, no real
// email.
import http from "node:http";
import { spawn } from "node:child_process";
import { startMockServer } from "./mock-server.mjs";
import { makeDb, UID } from "./mockdb.mjs";

const WEB = "/Users/nasko/Desktop/INVOICE/web";
const PORT = 3309;
const MOCK = 3557;
const STUB = 3398;
const base = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

// Resend, standing in: records what it was sent, answers as told.
const stub = { status: 200, sent: [] };
const stubServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    stub.sent.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(raw || "{}") });
    res.writeHead(stub.status, { "content-type": "application/json" });
    res.end(JSON.stringify(stub.status === 200 ? { id: "email_1" } : { message: "boom" }));
  });
});
stubServer.listen(STUB);

const db = makeDb();
db.tables.feedback = [];
const { server: mock } = startMockServer(MOCK, db);

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  RESEND_API_KEY: "fake-resend-key",
  RESEND_API_BASE: `http://127.0.0.1:${STUB}`,
  FEEDBACK_TO: "maker@example.com",
  VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
};
const app = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], { cwd: WEB, env, stdio: ["ignore", "pipe", "pipe"] });
app.stderr.on("data", (d) => process.env.VERBOSE && console.log("dev:", String(d).trim()));

const post = (body, token = "harness-token") =>
  fetch(`${base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "HarnessBrowser/1.0", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

try {
  for (let i = 0; i < 180; i++) {
    const res = await post({}, "").catch(() => null);
    if (res) { await res.text(); break; }
    await sleep(1000);
  }

  let res = await post({ message: "Hello" }, "");
  check("a stranger is refused", res.status === 401 && db.tables.feedback.length === 0, String(res.status));

  res = await post({ message: "The Save button is hidden on my phone.", category: "Confusing", page: "/settings" });
  let body = await res.json();
  const row = db.tables.feedback[0];
  check("a signed-in note is saved as the sender's own row", res.status === 200 && db.tables.feedback.length === 1 && row.user_id === UID && row.message === "The Save button is hidden on my phone." && row.category === "Confusing" && row.page === "/settings", JSON.stringify({ status: res.status, row }));
  check("...and the answer carries its id and says it was emailed", body.id === row.id && body.emailed === true, JSON.stringify(body));
  const mail = stub.sent[0];
  check("the email went to the maker, from feedback@, Reply-to the sender", mail && mail.path === "/emails" && mail.auth === "Bearer fake-resend-key" && mail.body.to[0] === "maker@example.com" && /feedback@invoiceover\.com/.test(mail.body.from) && mail.body.reply_to === "harness@example.com", JSON.stringify(mail?.body).slice(0, 300));
  check("subject holds the category and page; the text holds the words, the sender, the page, the browser and the build", mail && mail.body.subject === "Feedback: Confusing — /settings" && mail.body.text.startsWith("The Save button is hidden on my phone.") && mail.body.text.includes("From: harness@example.com (" + UID) && mail.body.text.includes("Page: /settings") && mail.body.text.includes("Browser: HarnessBrowser/1.0") && mail.body.text.includes("Build: abcdef1"), mail?.body.text);
  check("the HTML is escaped", mail && !mail.body.html.includes("<script") && mail.body.html.includes("The Save button"));

  res = await post({ message: "x".repeat(5001) });
  body = await res.json();
  check("5,001 characters are refused in plain words, nothing saved", res.status === 400 && /Keep it under 5,000 characters \(this is 5,001\)/.test(body.error) && db.tables.feedback.length === 1, JSON.stringify(body));
  res = await post({ message: "   " });
  body = await res.json();
  check("an empty note is refused", res.status === 400 && body.error === "Write something first.", JSON.stringify(body));

  stub.status = 500;
  res = await post({ message: "Resend is down but I still want this kept", category: "Bug", page: "/scan" });
  body = await res.json();
  check("with Resend failing the row is still saved and the answer says not emailed", res.status === 200 && body.emailed === false && db.tables.feedback.length === 2 && db.tables.feedback[1].message.startsWith("Resend is down"), JSON.stringify({ status: res.status, body, n: db.tables.feedback.length }));
  stub.status = 200;

  res = await post({ message: "<script>alert(1)</script> & \"quotes\"", category: "Other", page: "/" });
  const last = stub.sent.at(-1);
  check("a script in the note reaches the email escaped, the row as typed", res.status === 200 && !last.body.html.includes("<script>") && last.body.html.includes("&lt;script&gt;") && db.tables.feedback.at(-1).message === "<script>alert(1)</script> & \"quotes\"", last.body.html.slice(0, 200));
} catch (e) {
  console.log("ERROR", e.message);
  results.push(false);
} finally {
  app.kill();
  stubServer.close();
  mock.close();
  console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
}
