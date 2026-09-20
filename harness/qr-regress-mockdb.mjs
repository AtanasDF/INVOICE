// Copy of mockdb.mjs for the quote-requests branch's dev server (Supabase URL localhost:5566).
// A fake signed-in session and an in-memory PostgREST, so signed-in pages can
// be clicked through headless without touching the real database. Every
// request to the Supabase host is answered here; nothing leaves the machine.
import puppeteer from "puppeteer-core";

export const SUPA = "http://localhost:5566";
export const UID = "00000000-0000-4000-8000-000000000001";
const OUT = new URL(".", import.meta.url).pathname;
let seq = 0;
export const newId = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function makeDb() {
  return {
    tables: { clients: [], invoices: [], quotes: [], credit_notes: [], business_profile: [] },
    log: [],
    fail: {}, // e.g. { "POST invoices": 1 } fails the next POST to invoices
    emails: [],
  };
}

function test(cell, expr) {
  let [op, ...rest] = expr.split(".");
  let negate = false;
  if (op === "not") { negate = true; [op, ...rest] = rest; }
  const val = rest.join(".");
  let r = true;
  if (op === "eq") r = String(cell) === val;
  else if (op === "neq") r = String(cell) !== val;
  else if (op === "is" && val === "null") r = cell === null || cell === undefined;
  else if (op === "in") r = val.replace(/[()]/g, "").split(",").includes(String(cell));
  return negate ? !r : r;
}

function matches(row, params) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or") {
      const parts = v.replace(/^\(|\)$/g, "").split(",");
      if (!parts.some((p) => { const i = p.indexOf("."); return test(row[p.slice(0, i)], p.slice(i + 1)); })) return false;
      continue;
    }
    if (!test(row[k], v)) return false;
  }
  return true;
}

const DEFAULTS = {
  quotes: () => ({ status: "draft", invoice_id: null, notes: "", items: [], valid_until: null, deposit_percent: null, deposit_amount: null, deposit_invoice_id: null, deposit_claimed: false, created_at: new Date().toISOString() }),
  invoices: () => ({ status: "draft", tags: [], notes: null }),
  invoice_links: () => ({ created_at: new Date().toISOString(), first_viewed_at: null, last_viewed_at: null, view_count: 0 }),
  quote_links: () => ({ created_at: new Date().toISOString(), first_viewed_at: null, last_viewed_at: null, view_count: 0, response: null, responded_at: null, responder_name: null }),
};

export function handle(db, method, path, search, headers, body) {
  if (path === "/rest/v1/rpc/record_invoice_link_view") {
    const link = (db.tables.invoice_links ?? []).find((l) => l.token === body?.p_token);
    if (!link) return { status: 200, json: [] };
    const now = new Date().toISOString();
    link.view_count = (link.view_count ?? 0) + 1;
    link.last_viewed_at = now;
    link.first_viewed_at = link.first_viewed_at ?? now;
    return { status: 200, json: [{ invoice_id: link.invoice_id, user_id: link.user_id, first_view: link.view_count === 1 }] };
  }
  if (path === "/rest/v1/rpc/record_quote_link_view") {
    const link = (db.tables.quote_links ?? []).find((l) => l.token === body?.p_token);
    if (!link) return { status: 200, json: [] };
    const now = new Date().toISOString();
    link.view_count = (link.view_count ?? 0) + 1;
    link.last_viewed_at = now;
    link.first_viewed_at = link.first_viewed_at ?? now;
    return { status: 200, json: [{ quote_id: link.quote_id, user_id: link.user_id, first_view: link.view_count === 1 }] };
  }
  if (path === "/rest/v1/rpc/respond_to_quote_link") {
    const { p_token, p_response, p_name } = body ?? {};
    if (!["accepted", "declined"].includes(p_response)) return { status: 200, json: [] };
    const link = (db.tables.quote_links ?? []).find((l) => l.token === p_token);
    if (!link) return { status: 200, json: [] };
    const q = (db.tables.quotes ?? []).find((x) => x.id === link.quote_id && x.user_id === link.user_id);
    const today = new Date().toISOString().slice(0, 10);
    if (!q || q.status !== "sent" || (q.valid_until && q.valid_until < today)) return { status: 200, json: [] };
    q.status = p_response;
    Object.assign(link, { response: p_response, responded_at: new Date().toISOString(), responder_name: (p_name ?? "").trim() || null });
    return { status: 200, json: [{ quote_id: link.quote_id, user_id: link.user_id }] };
  }
  const table = path.replace("/rest/v1/", "");
  const params = [...new URLSearchParams(search)];
  const rows = (db.tables[table] ??= []);
  const wantsObject = (headers.accept ?? "").includes("vnd.pgrst.object");
  const returnRep = (headers.prefer ?? "").includes("return=representation");
  const key = `${method} ${table}`;
  db.log.push({ key, search, body });
  if (db.fail[key]) {
    db.fail[key]--;
    return { status: 500, json: { message: `mock failure on ${key}`, code: "XX000" } };
  }
  const out = (list) => {
    if (wantsObject) return list.length === 1 ? { status: 200, json: list[0] } : { status: 406, json: { message: "not one row", code: "PGRST116" } };
    return { status: 200, json: list };
  };
  if (method === "GET") {
    let list = rows.filter((r) => matches(r, params));
    return out(list);
  }
  if (method === "POST") {
    const lost = db.loseReply?.[key] ? (db.loseReply[key]--, true) : false;
    const input = Array.isArray(body) ? body : [body];
    const made = [];
    for (const r of input) {
      const row = { id: newId(), user_id: UID, ...(DEFAULTS[table]?.() ?? {}), ...r };
      if (table === "quotes" && rows.some((x) => x.number === row.number)) return { status: 409, json: { message: "duplicate key", code: "23505" } };
      rows.push(row);
      made.push(row);
    }
    if (lost) return { status: 504, json: { message: "mock: reply lost after commit", code: "" } };
    return returnRep ? out(made) : { status: 201, json: null };
  }
  if (method === "PATCH") {
    const hit = rows.filter((r) => matches(r, params));
    for (const r of hit) Object.assign(r, body);
    return returnRep ? out(hit) : { status: 204, json: null };
  }
  if (method === "DELETE") {
    if (!db.allowDelete?.includes(table)) return { status: 403, json: { message: "mock: no deletes", code: "42501" } };
    const keep = rows.filter((r) => !matches(r, params));
    db.tables[table] = keep;
    return { status: 204, json: null };
  }
  return { status: 400, json: { message: "unhandled" } };
}

export async function launchSignedIn(db, { width = 375, base = "http://localhost:3100", intercept, profile = "profile-mockdb" } = {}) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    userDataDir: OUT + "profile-quote-requests",
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) console.log("CONSOLE", m.text().slice(0, 200)); });
  await page.setRequestInterception(true);
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (intercept?.(req, u)) return;
    if (u.origin === SUPA) {
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
      if (u.pathname.startsWith("/rest/v1/")) {
        let body = null;
        try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
        const r = handle(db, req.method(), u.pathname, u.search, req.headers(), body);
        return req.respond({ status: r.status, headers: { ...cors, "content-type": "application/json" }, body: r.json === null ? "" : JSON.stringify(r.json) });
      }
      if (u.pathname.startsWith("/auth/v1/user")) return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(fakeUser()) });
      if (u.pathname.startsWith("/auth/v1/token")) return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(fakeSession()) });
      console.log("MOCK: blocked", req.method(), u.pathname);
      return req.respond({ status: 404, headers: cors, body: "" });
    }
    if (u.pathname === "/api/send-invoice") {
      const b = JSON.parse(req.postData() || "{}");
      db.emails.push(b);
      return req.respond({ status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ sent: true, to: b.to, copied: false }) });
    }
    if (u.origin !== base && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) {
      return req.abort();
    }
    req.continue();
  });
  return { browser, page };
}

function fakeUser() {
  return { id: UID, aud: "authenticated", role: "authenticated", email: "harness@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
}
function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return { access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp, role: "authenticated", aud: "authenticated" })}.fake`, refresh_token: "fake-refresh", token_type: "bearer", expires_in: 86400, expires_at: exp, user: fakeUser() };
}

export async function signIn(page, base) {
  await page.goto(base + "/free-invoice", { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s));
  }, fakeSession());
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function clickText(page, text) {
  const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll("button,a,label")].find((x) => x.textContent.trim() === t && !x.disabled); if (b) b.click(); return !!b; }, text);
  if (!ok) throw new Error("no button: " + text);
}
export const bodyText = (page) => page.evaluate(() => document.body.innerText);
export const shot = (page, name) => page.screenshot({ path: "/private/tmp/claude-501/-Users-nasko-Desktop-MM-INVOICES-AUTO/85090693-d203-4a4e-be6a-5911529c13ff/scratchpad/qr/regress-" + name + ".png", fullPage: true });
