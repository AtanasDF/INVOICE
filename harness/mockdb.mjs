// A fake signed-in session and an in-memory PostgREST, so signed-in pages can
// be clicked through headless without touching the real database. Every
// request to the Supabase host is answered here; nothing leaves the machine.
import puppeteer from "puppeteer-core";

export const SUPA = "https://wecfwjxzyzzrcwbwnwpo.supabase.co";
export const UID = "00000000-0000-4000-8000-000000000001";
const OUT = new URL(".", import.meta.url).pathname;
let seq = 0;
export const newId = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function makeDb() {
  return {
    tables: { clients: [], invoices: [], quotes: [], credit_notes: [], business_profile: [] },
    // Off by default: the app leans on Postgres row level security, so its
    // queries legitimately don't filter by user_id, and every suite seeds
    // rows without meaning anything by the id they use. Turn it on
    // (db.rls = true) to have the mock behave like the database does and
    // hide every row belonging to somebody else -- which is the only way a
    // suite can show that one account never sees another's records.
    rls: false,
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
  // Mirrors assign_invoice_number (migration-012, redefined in 024): takes
  // the account's next number, advances the counter and flips the draft to
  // sent, all in one transaction -- so a clash rolls the counter back.
  if (path === "/rest/v1/rpc/assign_invoice_number") {
    const profile = (db.tables.business_profile ?? [])[0];
    // Postgres: `invoice_prefix || (invoice_next_number - 1)::text` is
    // strict, so a NULL prefix makes the whole thing NULL and raises the
    // same message as a missing row. Reproducing that is the point -- the
    // app used to treat the two alike and blank the profile.
    if (!profile || profile.invoice_prefix === null || profile.invoice_prefix === undefined) {
      return { status: 400, json: { message: "No business profile found for this account.", code: "P0001" } };
    }
    const number = `${profile.invoice_prefix}${profile.invoice_next_number}`;
    const invoices = (db.tables.invoices ??= []);
    const inv = invoices.find((i) => i.id === body?.p_invoice_id && i.status === "draft");
    if (!inv) return { status: 400, json: { message: `Invoice ${body?.p_invoice_id} was not found, not owned by this account, or is not a draft.`, code: "P0001" } };
    if (invoices.some((i) => i.number === number)) return { status: 409, json: { message: `duplicate key value violates unique constraint "invoices_user_id_number_key"`, code: "23505" } };
    profile.invoice_next_number += 1;
    Object.assign(inv, { number, status: "sent", vat_registered: profile.vat_registered ?? false });
    return { status: 200, json: number };
  }
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
  // The owner typing in or scanning a supplier's answer (migration-028).
  // Faithful to the parts a suite can tell apart: it refuses an answer that
  // changed since the page loaded (40001), a closed request, an unknown
  // status, and a negative delivery; it keeps what it replaces in
  // `previous`; and it drops prices for items that aren't on the request.
  // Without it the whole owner-side answer path was untestable, and a
  // suite that tried it just saw nothing happen.
  if (path === "/rest/v1/rpc/record_quote_request_response") {
    const b = body ?? {};
    const row = (db.tables.quote_request_suppliers ?? []).find((r) => r.id === b.p_id);
    if (!row) return { status: 400, json: { message: "That supplier isn't on one of your requests.", code: "42501" } };
    const req = (db.tables.quote_requests ?? []).find((r) => r.id === row.request_id);
    if (!req || req.status !== "open") return { status: 400, json: { message: "This request is closed. Reopen it to change a supplier's prices.", code: "55000" } };
    if ((row.responded_at ?? null) !== (b.p_seen_responded_at ?? null)) {
      return { status: 400, json: { message: "This supplier's answer has changed since the page loaded (they may have replied online). Reload to see it.", code: "40001" } };
    }
    if (!["waiting", "replied", "declined"].includes(b.p_status) || (b.p_status !== "waiting" && !["manual", "scan"].includes(b.p_source))) {
      return { status: 400, json: { message: "That isn't an answer the app knows.", code: "22023" } };
    }
    if (b.p_delivery != null && b.p_delivery < 0) return { status: 400, json: { message: "Delivery can't be less than £0.", code: "22023" } };
    const replied = b.p_status === "replied";
    if (row.status !== "waiting") {
      row.previous = [...(row.previous ?? []), {
        status: row.status, source: row.source, responded_at: row.responded_at, responder_name: row.responder_name,
        prices: row.prices, delivery: row.delivery, vat_included: row.vat_included, valid_until: row.valid_until,
        note: row.note, document_path: row.document_path, replaced_at: new Date().toISOString(),
      }];
    }
    const ids = new Set((req.items ?? []).map((i) => i.id));
    const clean = {};
    for (const [k, v] of Object.entries(b.p_prices ?? {})) if (ids.has(k)) clean[k] = v;
    Object.assign(row, {
      status: b.p_status,
      source: b.p_status === "waiting" ? null : b.p_source,
      responded_at: b.p_status === "waiting" ? null : new Date().toISOString(),
      responder_name: null,
      prices: replied ? clean : {},
      delivery: replied ? b.p_delivery : null,
      vat_included: replied && !!b.p_vat_included,
      valid_until: replied ? b.p_valid_until : null,
      note: b.p_status === "waiting" ? "" : String(b.p_note ?? "").slice(0, 2000),
      document_path: b.p_status === "waiting" ? null : b.p_document_path,
    });
    return { status: 200, json: null };
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
    if (db.rls) list = list.filter((r) => r.user_id === undefined || r.user_id === UID);
    return out(list);
  }
  if (method === "POST") {
    const lost = db.loseReply?.[key] ? (db.loseReply[key]--, true) : false;
    const input = Array.isArray(body) ? body : [body];
    const made = [];
    // An upsert (on_conflict) REPLACES the matching row rather than adding
    // one. Without this the mock quietly turned every upsert into an insert,
    // which hid a bug that blanked the whole business profile.
    const conflict = new URLSearchParams(search).get("on_conflict")
      ?? ((headers.prefer ?? "").includes("resolution=merge-duplicates") && table === "business_profile" ? "user_id" : null);
    for (const r of input) {
      if (conflict) {
        const keys = conflict.split(",");
        const at = rows.findIndex((x) => keys.every((k) => x[k] === (r[k] ?? UID)));
        if (at >= 0) {
          rows[at] = { ...rows[at], ...r };
          made.push(rows[at]);
          continue;
        }
      }
      const row = { id: newId(), user_id: UID, ...(DEFAULTS[table]?.() ?? {}), ...r };
      if (table === "quotes" && rows.some((x) => x.number === row.number)) return { status: 409, json: { message: "duplicate key", code: "23505" } };
      rows.push(row);
      made.push(row);
    }
    if (lost) return { status: 504, json: { message: "mock: reply lost after commit", code: "" } };
    return returnRep ? out(made) : { status: 201, json: null };
  }
  // A write only ever reaches the signed-in user's own rows, as the
  // database's policies enforce.
  const mine = (r) => !db.rls || r.user_id === undefined || r.user_id === UID;
  if (method === "PATCH") {
    const hit = rows.filter((r) => matches(r, params) && mine(r));
    for (const r of hit) Object.assign(r, body);
    return returnRep ? out(hit) : { status: 204, json: null };
  }
  if (method === "DELETE") {
    if (!db.allowDelete?.includes(table)) return { status: 403, json: { message: "mock: no deletes", code: "42501" } };
    const keep = rows.filter((r) => !(matches(r, params) && mine(r)));
    db.tables[table] = keep;
    return { status: 204, json: null };
  }
  return { status: 400, json: { message: "unhandled" } };
}

// One Chrome profile per suite. Chrome refuses to open a profile directory
// another process already holds, so the sixteen suites that took the old
// shared default killed each other under run-all.sh's four-at-a-time --
// and passed perfectly when run alone, which is the worst way for a test
// to fail. Named from the running suite, so it is stable between runs and
// a suite that opens a second browser still gets its own state back.
const suiteProfile = () => "profile-" + ((process.argv[1] ?? "run").split("/").pop().replace(/\.mjs$/, "").replace(/\W/g, "") || "run");

export async function launchSignedIn(db, { width = 375, base = "http://localhost:3100", intercept, profile = suiteProfile() } = {}) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    userDataDir: OUT + profile,
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
      // Storage: signing a batch of stored receipt photos. db.storageFails
      // makes it answer the way an outage does, so a suite can check the
      // page still says a photo EXISTS rather than "no attachment".
      if (u.pathname.startsWith("/storage/v1/object/sign/")) {
        if (db.storageFails) return req.respond({ status: 500, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ message: "mock: storage unavailable" }) });
        let paths = [];
        try { paths = JSON.parse(req.postData() || "{}").paths ?? []; } catch { paths = []; }
        const signed = paths.map((path) => ({ path, signedURL: `/storage/v1/object/sign/${path}?token=mock`, error: null }));
        db.signed = (db.signed ?? 0) + paths.length;
        return req.respond({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(signed) });
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
    localStorage.setItem("sb-wecfwjxzyzzrcwbwnwpo-auth-token", JSON.stringify(s));
  }, fakeSession());
}

// The same day the app reckons it is: Europe/London, not UTC. See
// web/src/lib/today.ts for why the app stopped asking toISOString() what
// day it is. A suite that builds "9 days ago" off the UTC clock disagrees
// with the app for the hour after midnight every summer night, and then
// fails for a reason that has nothing to do with what it is testing --
// which is exactly what happened to test-quote-chase on 2026-09-21.
const UK_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
export const todayISO = () => UK_DATE.format(new Date());
// Anchored at midday so a DST change can't shunt the answer across a day.
export const day = (n) => {
  const d = new Date(todayISO() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function clickText(page, text) {
  const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll("button,a,label")].find((x) => x.textContent.trim() === t && !x.disabled); if (b) b.click(); return !!b; }, text);
  if (!ok) throw new Error("no button: " + text);
}
export const bodyText = (page) => page.evaluate(() => document.body.innerText);
export const shot = (page, name) => page.screenshot({ path: OUT + name + ".png", fullPage: true });
