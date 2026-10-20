import fs from "node:fs";
import { REPO } from "./repo.mjs";
// migration-042 (quotes.sent_at) and its backup, run against a real Postgres
// before anyone runs them in Supabase. The same setup as test-migration-041:
// pglite is a harness devDependency, PGLITE=<path> points at another copy, and
// without either it says so and passes.
//
// The quotes table below is the real one as 020, 022 and 033 leave it, with
// its RLS policy, because the backup is verified by content and the column is
// written as the owner. The other tables are 041's scaffolding, only so
// respond_to_quote_link can be shown not to touch sent_at.
let PGlite;
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
  console.log("SKIP @electric-sql/pglite is not installed -- see test-migration-041's header");
  console.log(JSON.stringify({ passed: 0, total: 0 }));
  process.exit(0);
}

const db = await PGlite.create();
const results = [];
const say = (ok, n, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const q = async (sql) => (await db.exec(sql));
const one = async (sql) => (await db.query(sql)).rows[0];
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

await q(`
  create role anon; create role authenticated; create role service_role;
  -- What Supabase does to every new table, a create-table-as snapshot
  -- included, and the reason the backup has to revoke.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create table public.quotes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    client_id uuid,
    number text not null,
    date date not null default current_date,
    valid_until date,
    items jsonb not null default '[]'::jsonb,
    notes text not null default '',
    status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'invoiced')),
    invoice_id uuid,
    created_at timestamptz not null default now(),
    deposit_percent numeric(5, 2),
    deposit_amount numeric(12, 2),
    deposit_invoice_id uuid,
    deposit_claimed boolean not null default false,
    vat_registered boolean
  );
  alter table public.quotes enable row level security;
  create policy "own quotes" on public.quotes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  grant select, insert, update on public.quotes to authenticated;
  grant all on public.quotes to anon;
  create table public.clients (id uuid primary key default gen_random_uuid(), user_id uuid, archived boolean default false);
  create table public.quote_links (token text primary key, quote_id uuid, user_id uuid, response text, responded_at timestamptz, responder_name text);
  create table public.recurring_invoices (id uuid primary key default gen_random_uuid(), user_id uuid, client_id uuid, active boolean, next_due_date date, items jsonb, notes text, payment_terms text);
  create table public.invoices (id uuid primary key default gen_random_uuid(), user_id uuid, client_id uuid, date date, number text, items jsonb, notes text, due_date date, payment_terms text, status text, tags jsonb);
  create table public.quote_requests (id uuid primary key default gen_random_uuid(), user_id uuid, status text, needed_by date, items jsonb);
  create table public.quote_request_suppliers (id uuid primary key default gen_random_uuid(), token text, user_id uuid, request_id uuid, status text, source text, responded_at timestamptz, responder_name text, prices jsonb, delivery numeric, vat_included boolean, valid_until date, note text);
  create function public.quote_request_clean_prices(p jsonb, items jsonb) returns jsonb language sql as $$ select coalesce(p, '{}'::jsonb) $$;
  insert into public.quotes (user_id, number, date, status, items, vat_registered, deposit_percent) values
    ('${A}', 'Q-0001', '2026-09-01', 'draft', '[{"description":"Skim","quantity":1,"unitPrice":500}]', null, null),
    ('${A}', 'Q-0002', '2026-09-02', 'sent', '[]', true, 25),
    ('${A}', 'Q-0003', '2026-09-03', 'accepted', '[]', false, null),
    ('${B}', 'Q-0001', '2026-09-04', 'sent', '[]', null, null);
`);
await q(fs.readFileSync(`${REPO}/web/supabase/migration-041-london-day-in-sql.sql`, "utf8"));

const file = (n) => fs.readFileSync(`${REPO}/web/supabase/${n}`, "utf8");
const backup = file("017-backup-before-migration-042.sql");
const migration = file("migration-042-quote-sent-at.sql");

// ---- The backup ------------------------------------------------------------
try { await q(backup); await q(backup); say(true, "the backup runs, and runs a second time"); } catch (e) { say(false, "the backup runs, and runs a second time", e.message); }
const missing = await one("select count(*)::int as n from (select * from quotes except select * from quotes_backup_20261020) t");
const extra = await one("select count(*)::int as n from (select * from quotes_backup_20261020 except select * from quotes) t");
say(missing.n === 0 && extra.n === 0, "the backup matches by content both ways (its own verify queries)", `missing ${missing.n}, extra ${extra.n}`);
const cols = async (t) => (await one(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = '${t}'`)).n;
say((await cols("quotes")) === (await cols("quotes_backup_20261020")), "...and has the same columns");
say((await one("select relrowsecurity from pg_class where relname = 'quotes_backup_20261020'")).relrowsecurity === true, "RLS is on the snapshot");
const bgrants = (await db.query("select grantee, privilege_type from information_schema.role_table_grants where table_name = 'quotes_backup_20261020' and grantee in ('anon', 'authenticated')")).rows;
say(bgrants.length === 0, "anon and authenticated have no grant on the snapshot", JSON.stringify(bgrants));

// ---- The migration ---------------------------------------------------------
try { await q(migration); say(true, "the migration runs"); } catch (e) { say(false, "the migration runs", e.message); console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length + 1 })); process.exit(1); }
try { await q(migration); say(true, "it runs a second time unchanged"); } catch (e) { say(false, "it runs a second time unchanged", e.message); }
const col = await one("select data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'sent_at'");
say(col?.data_type === "timestamp with time zone" && col.is_nullable === "YES" && col.column_default === null, "sent_at is a nullable timestamptz with no default", JSON.stringify(col));
const nulls = await one("select count(*) filter (where sent_at is null)::int as n, count(*)::int as total from quotes");
say(nulls.n === nulls.total && nulls.total === 4, "every existing quote keeps null: nothing is guessed", JSON.stringify(nulls));
// The check in the migration's own footer: no existing value moved.
const keep = "id, user_id, client_id, number, date, valid_until, items, notes, status, invoice_id, deposit_percent, deposit_amount, deposit_invoice_id, deposit_claimed, vat_registered, created_at";
const moved = await one(`select count(*)::int as n from (select ${keep} from quotes except select ${keep} from quotes_backup_20261020) t`);
const moved2 = await one(`select count(*)::int as n from (select ${keep} from quotes_backup_20261020 except select ${keep} from quotes) t`);
say(moved.n === 0 && moved2.n === 0, "no existing value moved, compared both ways", `${moved.n} / ${moved2.n}`);
// The footer's own column list names every column but sent_at, so the check
// Atanas runs afterwards cannot silently skip one.
const listed = migration.match(/select (id, user_id[^\n]*\n--\s+[^\n]*created_at)/)?.[1].replace(/\n--\s+/, " ") ?? "";
const real = (await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name <> 'sent_at' order by 1")).rows.map((r) => r.column_name);
say(JSON.stringify(listed.split(/,\s*/).sort()) === JSON.stringify(real), "the footer's check lists every column but sent_at", `${listed} vs ${real.join(", ")}`);

// ---- As the owner, the way the app writes it ------------------------------
const asOwner = async (uid, sql) => {
  await q("begin");
  try {
    await q(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
    return (await db.query(sql)).rows;
  } finally {
    await q("rollback");
  }
};
const stamped = await asOwner(A, "update public.quotes set status = 'sent', vat_registered = true, sent_at = now() where number = 'Q-0001' and status = 'draft' and status <> 'invoiced' returning sent_at");
say(stamped.length === 1 && stamped[0].sent_at instanceof Date, "the owner can stamp sent_at as the quote leaves draft", JSON.stringify(stamped));
const theirs = await asOwner(A, `update public.quotes set sent_at = now() where user_id = '${B}' returning id`);
say(theirs.length === 0, "...and cannot stamp somebody else's quote");
say((await one("select count(*)::int as n from quotes where sent_at is not null")).n === 0, "the exercise rolled back and left nothing");

// ---- The customer answering online leaves the send time alone --------------
const sentAt = "2026-10-01T09:15:00Z";
const qq = await one(`update quotes set sent_at = '${sentAt}' where number = 'Q-0002' returning id, user_id`);
await q(`insert into quote_links (token, quote_id, user_id) values ('tok-042', '${qq.id}', '${qq.user_id}')`);
const answered = (await db.query("select * from public.respond_to_quote_link('tok-042', 'accepted', 'Jane')")).rows.length;
const after = await one(`select status, sent_at from quotes where id = '${qq.id}'`);
say(answered === 1 && after.status === "accepted" && after.sent_at.toISOString() === new Date(sentAt).toISOString(), "an online answer keeps the quote's sent_at", JSON.stringify(after));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
