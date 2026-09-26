import fs from "node:fs";
import { REPO } from "./repo.mjs";
// migration-041 run against a real Postgres, before anyone runs it in Supabase.
//
// This project has no migration runner: every migration is pasted into the
// Supabase SQL editor by hand and verified by hand afterwards (CLAUDE.md rule
// 3). That is fine for checking what a migration DID, and no use at all for
// checking whether it will work -- a typo, a wrong signature or a grant on a
// role that does not exist is found in production, on his real database.
//
// pglite is a real Postgres compiled to WASM, so it can be found here instead.
// It is NOT a project dependency: install it in a scratchpad and point Node at
// it, which is one line and keeps a 100MB WASM build out of the app's
// package.json:
//
//   mkdir -p /tmp/pg && cd /tmp/pg && npm init -y && npm i @electric-sql/pglite
//   PGLITE=/tmp/pg/node_modules/@electric-sql/pglite node test-migration-041.mjs
//
// (PGLITE is an absolute path, not NODE_PATH: NODE_PATH does nothing for an
// ESM import.)
//
// Without it the suite says so and passes, rather than failing a full run on a
// machine that was never set up for it.
//
// The tables below are SCAFFOLDING: the few columns each function touches, and
// nothing else. The point is to compile the functions and exercise the three
// date gates, not to mirror the schema -- schema.sql is the schema.
//
// It has already earned itself: the "no function still asks UTC" query in the
// migration's own header threw `array_agg is an aggregate function`, because
// pg_get_functiondef refuses an aggregate. That is the check Atanas was meant
// to run after applying it, and it would have errored instead of answering.
let PGlite;
// A directory is not an ESM specifier, so a path gets its entry file tried too.
const where = process.env.PGLITE;
const tries = where ? [where, `${where}/dist/index.js`, `${where}/dist/index.cjs`] : ["@electric-sql/pglite"];
for (const t of tries) {
  try {
    ({ PGlite } = await import(t));
    break;
  } catch {
    // next
  }
}
if (!PGlite) {
  console.log("SKIP @electric-sql/pglite is not installed -- see the header for the one-line setup");
  console.log(JSON.stringify({ passed: 0, total: 0 }));
  process.exit(0);
}

const db = await PGlite.create();
const results = [];
const say = (ok, n, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const q = async (sql) => (await db.exec(sql));
const one = async (sql) => (await db.query(sql)).rows[0];

await q(`
  create role anon; create role authenticated; create role service_role;
  create table public.clients (id uuid primary key default gen_random_uuid(), user_id uuid, archived boolean default false);
  create table public.quotes (id uuid primary key default gen_random_uuid(), user_id uuid, status text, valid_until date);
  create table public.quote_links (token text primary key, quote_id uuid, user_id uuid, response text, responded_at timestamptz, responder_name text);
  create table public.recurring_invoices (id uuid primary key default gen_random_uuid(), user_id uuid, client_id uuid, active boolean, next_due_date date, items jsonb, notes text, payment_terms text);
  create table public.invoices (id uuid primary key default gen_random_uuid(), user_id uuid, client_id uuid, date date, number text, items jsonb, notes text, due_date date, payment_terms text, status text, tags jsonb);
  create table public.quote_requests (id uuid primary key default gen_random_uuid(), user_id uuid, status text, needed_by date, items jsonb);
  create table public.quote_request_suppliers (id uuid primary key default gen_random_uuid(), token text, user_id uuid, request_id uuid, status text, source text, responded_at timestamptz, responder_name text, prices jsonb, delivery numeric, vat_included boolean, valid_until date, note text);
  create function public.quote_request_clean_prices(p jsonb, items jsonb) returns jsonb language sql as $$ select coalesce(p, '{}'::jsonb) $$;
`);

const sql = fs.readFileSync(`${REPO}/web/supabase/migration-041-london-day-in-sql.sql`, "utf8");
try { await q(sql); say(true, "the migration runs"); } catch (e) { say(false, "the migration runs", e.message); console.log(JSON.stringify({ passed: 0, total: 1 })); process.exit(1); }
// Idempotent: CLAUDE.md rule 2.
try { await q(sql); say(true, "it runs a second time unchanged"); } catch (e) { say(false, "it runs a second time unchanged", e.message); }

const v = await one("select provolatile from pg_proc where proname = 'uk_today'");
say(v.provolatile === "s", "uk_today is STABLE, so it is never folded into an index", `volatility ${v.provolatile}`);
const d = await one("select public.uk_today() as uk, current_date as pg, (now() at time zone 'Europe/London')::date as expect");
say(d.uk.toISOString().slice(0,10) === d.expect.toISOString().slice(0,10), "uk_today() is the London date", `${JSON.stringify(d)}`);

// The hour that matters, shown on a fixed moment rather than waited for.
const gap = await one(`select (timestamptz '2026-06-30 23:30:00+00' at time zone 'Europe/London')::date::text as london, (timestamptz '2026-06-30 23:30:00+00')::date::text as utc`);
say(gap.london === "2026-07-01" && gap.utc === "2026-06-30", `at 00:30 BST the two differ by a day (London ${gap.london}, UTC ${gap.utc})`, `${JSON.stringify(gap)}`);

// ---- The quote-expiry gate, on the London day -------------------------------
const mk = async (validUntil, token) => {
  const r = await one(`insert into public.quotes (user_id, status, valid_until) values (gen_random_uuid(), 'sent', ${validUntil}) returning id, user_id`);
  await q(`insert into public.quote_links (token, quote_id, user_id) values ('${token}', '${r.id}', '${r.user_id}')`);
  return r.id;
};
const expiredId = await mk("public.uk_today() - 1", "tok-expired");
const todayId = await mk("public.uk_today()", "tok-today");
const nullId = await mk("null", "tok-none");
const answered = async (token) => (await db.query(`select * from public.respond_to_quote_link('${token}', 'accepted', 'A Customer')`)).rows.length;
const statusOf = async (id) => (await one(`select status from public.quotes where id = '${id}'`)).status;
say((await answered("tok-expired")) === 0 && (await statusOf(expiredId)) === "sent", "a quote that expired yesterday cannot be accepted", "expired quote was accepted");
say((await answered("tok-today")) === 1 && (await statusOf(todayId)) === "accepted", "one valid until today still can be", "today's quote was refused");
say((await answered("tok-none")) === 1 && (await statusOf(nullId)) === "accepted", "one with no expiry still can be", "open-ended quote was refused");

// ---- The recurring invoice is dated in London -------------------------------
const c = await one("insert into public.clients (user_id) values (gen_random_uuid()) returning id");
const ri = await one(`insert into public.recurring_invoices (user_id, client_id, active, next_due_date, items, notes, payment_terms) values (gen_random_uuid(), '${c.id}', true, public.uk_today(), '[]'::jsonb, null, '30 days') returning id`);
const inv = await one(`select public.generate_recurring_invoice('${ri.id}') as id`);
const made = await one(`select date::text, due_date::text from public.invoices where id = '${inv.id}'`);
const uk = (await one("select public.uk_today()::text as d")).d;
say(made.date === uk, `a generated invoice is dated the London day (${made.date})`, `dated ${made.date}, London is ${uk}`);
say(made.due_date > made.date, "...and its due date is 30 days on from that", `due ${made.due_date}`);
const advanced = await one(`select next_due_date::text as d from public.recurring_invoices where id = '${ri.id}'`);
say(advanced.d > uk, "...and the schedule moved on", `still ${advanced.d}`);
// Not yet due: refused, and on the London day.
const later = await one(`insert into public.recurring_invoices (user_id, client_id, active, next_due_date, items, notes, payment_terms) values (gen_random_uuid(), '${c.id}', true, public.uk_today() + 1, '[]'::jsonb, null, '30 days') returning id`);
let refused = false;
try { await db.query(`select public.generate_recurring_invoice('${later.id}')`); } catch { refused = true; }
say(refused, "one due tomorrow is not generated today", "a schedule due tomorrow was generated");

// ---- A supplier cannot answer after the day it was needed ------------------
const req = async (neededBy, token) => {
  const r = await one(`insert into public.quote_requests (user_id, status, needed_by, items) values (gen_random_uuid(), 'open', ${neededBy}, '[]'::jsonb) returning id, user_id`);
  await q(`insert into public.quote_request_suppliers (token, user_id, request_id, status) values ('${token}', '${r.user_id}', '${r.id}', 'waiting')`);
};
await req("public.uk_today() - 1", "req-late");
await req("public.uk_today()", "req-today");
const sent = async (token) => (await db.query(`select * from public.submit_quote_request_response('${token}', 'replied', '{}'::jsonb, 0, false, null, '', 'A Supplier')`)).rows.length;
say((await sent("req-late")) === 0, "prices sent after the day they were needed are refused", "a late reply was taken");
say((await sent("req-today")) === 1, "...and on the day itself they are taken", "an on-time reply was refused");

// ---- Nothing is left asking UTC --------------------------------------------
const stillUtc = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) ~ 'current_date' order by 1`)).rows.map((r) => r.proname);
say(stillUtc.length === 0, "no function in the schema still asks UTC what day it is", `still asking: ${stillUtc.join(", ")}`);

// ---- The grants ------------------------------------------------------------
const grants = (await db.query(`select routine_name, grantee from information_schema.routine_privileges where routine_name in ('uk_today','respond_to_quote_link','generate_recurring_invoice','submit_quote_request_response') and grantee in ('anon','authenticated','service_role') order by 1, 2`)).rows;
const got = grants.map((g) => `${g.routine_name}:${g.grantee}`).sort().join(" ");
const want = ["generate_recurring_invoice:authenticated", "respond_to_quote_link:service_role", "submit_quote_request_response:service_role", "uk_today:service_role"].sort().join(" ");
say(got === want, "the grants are exactly as intended, and anon has none", `grants\n  got  ${got}\n  want ${want}`);

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
