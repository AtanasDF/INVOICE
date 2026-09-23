// Every server route, called the way a stranger would call it. The ones
// that cost money (the AI reads), the ones that send email, and the ones
// that run with the service role must all refuse. The few that are open by
// design are listed as open, so the list itself is the record of which is
// which.
const BASE = process.env.BASE ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const call = async (path, { method = "POST", body = {}, headers = {} } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body),
  }).catch((e) => ({ status: 0, text: async () => String(e) }));
  const text = await res.text?.().catch(() => "") ?? "";
  return { status: res.status, text: text.slice(0, 200) };
};

// Signed-in only: an anonymous caller must be turned away, not served.
const SIGNED_IN_ONLY = [
  ["/api/scan", { pages: [] }, "reads a document with the AI"],
  ["/api/contact-scan", { pages: [] }, "reads a business card"],
  ["/api/price-guide", { description: "plasterboard" }, "asks the AI what something costs"],
  ["/api/invoice-from-text", { text: "hello" }, "writes an invoice from a description"],
  ["/api/send-invoice", { to: "nobody@example.com" }, "sends an invoice by email"],
  ["/api/invoice-template", { images: [] }, "reads an invoice with the AI (signed-in only since 2026-09-22)"],
  ["/api/quote-requests/send", { requestId: "x" }, "emails suppliers"],
];

// The email import webhook: the Cloudflare Worker posts scanned receipts
// here with a shared secret, and it writes to his records with the service
// role, so a stranger must never get in.
const WEBHOOK_ONLY = [["/api/inbox/ingest", "puts emailed receipts into his records"]];

// Run by the cron with a shared secret, with the service role behind them.
const CRON_ONLY = [
  ["/api/reminders/send", "chases customers for payment"],
  ["/api/notifications/check", "pushes notifications"],
  ["/api/recurring-invoices/generate", "creates invoices"],
  ["/api/photos/age", "emails old photographs away and clears them"],
];

// Open by design, and safe: they read public data or answer a private
// link's own token. They must still not blow up on rubbish.
const OPEN_BY_DESIGN = [
  ["/api/address-search", "GET", "?postcode=BS14DJ"],
  ["/api/company-search", "GET", "?q=test"],
  ["/api/company-check", "GET", "?number=00000000"],
  ["/api/invoice-links/seen", "POST", ""],
  ["/api/quote-links/seen", "POST", ""],
  ["/api/quote-links/respond", "POST", ""],
  ["/api/quote-requests/respond", "POST", ""],
];

try {
  for (const [path, body, what] of SIGNED_IN_ONLY) {
    const bare = await call(path, { body });
    check(`${path} (${what}) turns away a stranger`, bare.status === 401 || bare.status === 403, `${bare.status} ${bare.text}`);
    const faked = await call(path, { body, headers: { authorization: "Bearer not-a-real-token" } });
    check(`${path} refuses a made-up token`, faked.status === 401 || faked.status === 403, `${faked.status} ${faked.text}`);
  }

  for (const [path, what] of WEBHOOK_ONLY) {
    const bare = await call(path, { body: { from: "x@y.z" } });
    check(`${path} (${what}) refuses without the webhook secret`, bare.status === 401 || bare.status === 403, `${bare.status} ${bare.text}`);
    const wrong = await call(path, { body: { from: "x@y.z" }, headers: { authorization: "Bearer wrong-secret" } });
    check(`${path} refuses the wrong webhook secret`, wrong.status === 401 || wrong.status === 403, `${wrong.status} ${wrong.text}`);
  }

  for (const [path, what] of CRON_ONLY) {
    const bare = await call(path, { method: "GET" });
    check(`${path} (${what}) refuses without the cron secret`, bare.status === 401 || bare.status === 403, `${bare.status} ${bare.text}`);
    const wrong = await call(path, { method: "GET", headers: { authorization: "Bearer wrong-secret" } });
    check(`${path} refuses the wrong cron secret`, wrong.status === 401 || wrong.status === 403, `${wrong.status} ${wrong.text}`);
  }

  for (const [path, method, query] of OPEN_BY_DESIGN) {
    const res = await call(`${path}${query}`, { method, body: { token: "x".repeat(43) } });
    check(`${path} is open by design and doesn't fall over`, res.status < 500, `${res.status} ${res.text}`);
    check(`${path} gives nothing away in its answer`, !/service_role|supabase\.co|password|secret|SUPABASE|eyJ/i.test(res.text), res.text);
  }

  // Nothing anywhere should echo a key or a stack trace.
  const noisy = await call("/api/scan", { body: { pages: [{ mediaType: "image/png", data: "not-base64" }] } });
  check("a bad request doesn't return a stack trace", !/at \w+ \(|node_modules/.test(noisy.text), noisy.text);
} catch (e) { console.log("ERROR", e.message); }
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
