import fs from "node:fs";
import { REPO } from "./repo.mjs";
// migrations 043, 044 and 045 (notes/audit-sql.md) against a real Postgres,
// before anyone runs them in Supabase. The same setup as test-migration-041:
// pglite is a harness devDependency, PGLITE=<path> points at another copy, and
// without either it says so and passes.
//
// Each hole is shown OPEN first, on the database as 041 left it, and then shut
// by its migration -- a suite that only checks the after-state cannot tell a
// fix from a hole that was never there.
//
// The scaffolding gives Supabase's two defaults that matter here: every new
// table and function is granted to anon and authenticated, and the owner
// policies have no `to` clause, exactly as schema.sql and 002-011 wrote them.
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
const file = (n) => fs.readFileSync(`${REPO}/web/supabase/${n}`, "utf8");
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const CA = "aaaaaaaa-0000-0000-0000-00000000000a";
const CB = "bbbbbbbb-0000-0000-0000-00000000000b";
const IA = "aaaaaaaa-0000-0000-0000-0000000000a1";
const IB = "bbbbbbbb-0000-0000-0000-0000000000b1";
const RB = "bbbbbbbb-0000-0000-0000-0000000000b2";

const owner = (t) => `alter table public.${t} enable row level security;
  create policy ${t}_owner_all on public.${t} for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;
await q(`
  create role anon; create role authenticated; create role service_role bypassrls;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon, service_role;
  grant execute on function auth.uid() to authenticated, anon, service_role;
  create table public.clients (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text, archived boolean not null default false);
  create table public.invoices (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid references public.clients(id) on delete restrict,
    date date, number text, items jsonb, notes text, due_date date, payment_terms text, status text default 'draft', tags jsonb, total numeric default 0);
  create table public.receipts (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid references public.clients(id) on delete restrict,
    date date not null, amount numeric not null default 0);
  create table public.credit_notes (id uuid primary key default gen_random_uuid(), user_id uuid not null, invoice_id uuid not null references public.invoices(id) on delete cascade, amount numeric default 0);
  create table public.recurring_invoices (id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid references public.clients(id) on delete restrict,
    active boolean default true, next_due_date date, items jsonb default '[]', notes text default '', payment_terms text default '');
  create table public.recurring_expenses (id uuid primary key default gen_random_uuid(), user_id uuid not null, supplier_id uuid references public.clients(id) on delete restrict, amount numeric default 0);
  create table public.business_profile (user_id uuid primary key, business_name text, plan text not null default 'free' check (plan in ('free', 'paid')));
  ${["clients", "invoices", "receipts", "credit_notes", "recurring_invoices", "recurring_expenses", "business_profile"].map(owner).join("\n")}
  -- What 041 needs to compile its other two functions.
  create table public.quotes (id uuid primary key default gen_random_uuid(), user_id uuid, status text, valid_until date);
  create table public.quote_links (token text primary key, quote_id uuid, user_id uuid, response text, responded_at timestamptz, responder_name text);
  create table public.quote_requests (id uuid primary key default gen_random_uuid(), user_id uuid, status text, needed_by date, items jsonb);
  create table public.quote_request_suppliers (id uuid primary key default gen_random_uuid(), token text, user_id uuid, request_id uuid, status text, source text, responded_at timestamptz, responder_name text, prices jsonb, delivery numeric, vat_included boolean, valid_until date, note text);
  create function public.quote_request_clean_prices(p jsonb, items jsonb) returns jsonb language sql as $$ select coalesce(p, '{}'::jsonb) $$;
  insert into public.clients (id, user_id, name) values ('${CA}', '${A}', 'A''s client'), ('${CB}', '${B}', 'B''s client');
  insert into public.invoices (id, user_id, client_id, number) values ('${IA}', '${A}', '${CA}', 'A-1'), ('${IB}', '${B}', '${CB}', 'B-1');
  insert into public.recurring_invoices (id, user_id, client_id, next_due_date) values ('${RB}', '${B}', '${CB}', '2000-01-01');
  insert into public.business_profile (user_id, business_name) values ('${A}', 'A Ltd'), ('${B}', 'B Ltd');
`);
await q(file("migration-041-london-day-in-sql.sql"));

// Runs sql as a signed-in account (or the service role) and rolls back.
// Returns the rows, or the error message.
const as = async (role, uid, sql) => {
  await q("begin");
  try {
    await q(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`);
    return { rows: (await db.query(sql)).rows };
  } catch (e) {
    return { error: e.message };
  } finally {
    await q("rollback");
  }
};
const refused = (r, re) => r.error !== undefined && (!re || re.test(r.error));

// ---- 043: generate_recurring_invoice ---------------------------------------
const gen = `select public.generate_recurring_invoice('${RB}') as id`;
const before043 = await as("authenticated", A, gen);
say(!before043.error && before043.rows[0]?.id, "before 043: account A can raise a draft in B's account (041's grant)", JSON.stringify(before043));
try { await q(file("migration-043-recurring-invoice-service-only.sql")); await q(file("migration-043-recurring-invoice-service-only.sql")); say(true, "043 runs, and runs a second time"); } catch (e) { say(false, "043 runs, and runs a second time", e.message); }
say(refused(await as("authenticated", A, gen), /permission denied/), "after 043: a signed-in account is refused for permission");
say(refused(await as("anon", null, gen), /permission denied/), "...and so is a stranger");
const cron = await as("service_role", null, gen);
say(!cron.error && cron.rows[0]?.id, "...and the cron's service role still raises it", JSON.stringify(cron));
const g = (await db.query("select grantee from information_schema.routine_privileges where routine_name = 'generate_recurring_invoice' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role') order by 1")).rows.map((r) => r.grantee).join(",");
say(g === "service_role", "the grant list is service_role alone (043's own check 1)", g);

// ---- 044: business_profile.plan --------------------------------------------
const upgrade = `update public.business_profile set plan = 'paid' where user_id = auth.uid() returning plan`;
const before044 = await as("authenticated", A, upgrade);
say(before044.rows?.[0]?.plan === "paid", "before 044: an account can make itself paid", JSON.stringify(before044));
try { await q(file("migration-044-plan-only-by-owner.sql")); await q(file("migration-044-plan-only-by-owner.sql")); say(true, "044 runs, and runs a second time"); } catch (e) { say(false, "044 runs, and runs a second time", e.message); }
say(refused(await as("authenticated", A, upgrade), /only be changed by Invoiceover/), "after 044: it is refused, in words a person can read");
say(refused(await as("authenticated", B, `insert into public.business_profile (user_id, plan) values (auth.uid(), 'paid') on conflict (user_id) do update set plan = excluded.plan`), /only be changed/), "...and so is an upsert carrying plan");
const fresh = "33333333-3333-3333-3333-333333333333";
say(!(await as("authenticated", fresh, `insert into public.business_profile (user_id, business_name) values (auth.uid(), 'New') returning plan`)).error, "a first Settings save (no plan sent) still goes through");
const settings = await as("authenticated", A, `insert into public.business_profile (user_id, business_name) values (auth.uid(), 'A Trading') on conflict (user_id) do update set business_name = excluded.business_name returning business_name, plan`);
say(settings.rows?.[0]?.business_name === "A Trading" && settings.rows[0].plan === "free", "Settings' upsert without plan still saves", JSON.stringify(settings));
say(!(await as("authenticated", A, `update public.business_profile set plan = 'free' where user_id = auth.uid()`)).error, "writing back the plan it already has is not refused");
await q("begin");
await q(`update public.business_profile set plan = 'paid' where user_id = '${A}'`);
say((await one(`select plan from public.business_profile where user_id = '${A}'`)).plan === "paid", "the SQL editor (setting-an-account-to-paid.sql) still can");
await q("rollback");
say(!(await as("service_role", null, `update public.business_profile set plan = 'paid' where user_id = '${A}'`)).error, "...and so can the service role");

// ---- 045: the five references ----------------------------------------------
const cases = [
  ["receipts", `insert into public.receipts (user_id, date, client_id) values (auth.uid(), '2026-10-20', '%')`, `update public.receipts set client_id = '%' where user_id = auth.uid()`, CB, CA, /supplier on a receipt/],
  ["invoices", `insert into public.invoices (user_id, client_id, number) values (auth.uid(), '%', 'A-2')`, `update public.invoices set client_id = '%' where user_id = auth.uid()`, CB, CA, /client on an invoice/],
  ["recurring_invoices", `insert into public.recurring_invoices (user_id, client_id) values (auth.uid(), '%')`, null, CB, CA, /client on a recurring invoice/],
  ["recurring_expenses", `insert into public.recurring_expenses (user_id, supplier_id) values (auth.uid(), '%')`, null, CB, CA, /supplier on a recurring expense/],
  ["credit_notes", `insert into public.credit_notes (user_id, invoice_id) values (auth.uid(), '%')`, null, IB, IA, /credit note can only/],
];
for (const [t, ins, , theirs] of cases) {
  const r = await as("authenticated", A, ins.replace("%", theirs));
  say(!r.error, `before 045: A can point a new ${t} row at B's`, r.error);
}
// The row it makes B's client unremovable.
await q(`insert into public.receipts (user_id, date, client_id) values ('${A}', '2026-10-01', '${CB}')`);
say(refused(await as("authenticated", B, `delete from public.clients where id = '${CB}'`), /foreign key/), "...and one such receipt makes B's client impossible to remove");

try { await q(file("migration-045-same-owner-contacts.sql")); await q(file("migration-045-same-owner-contacts.sql")); say(true, "045 runs, and runs a second time"); } catch (e) { say(false, "045 runs, and runs a second time", e.message); }
for (const [t, ins, upd, theirs, mine, words] of cases) {
  say(refused(await as("authenticated", A, ins.replace("%", theirs)), words), `after 045: ${t} pointing at another account's row is refused`);
  say(!(await as("authenticated", A, ins.replace("%", mine))).error, `...one pointing at the account's own still saves (${t})`);
  if (upd) say(refused(await as("authenticated", A, upd.replace("%", theirs)), words), `...and so is moving an existing ${t} row across`);
  say(refused(await as("service_role", null, ins.replace("auth.uid()", `'${A}'`).replace("%", theirs)), words), `...the service role is held to the same rule (${t})`);
}
say(!(await as("authenticated", A, `insert into public.receipts (user_id, date) values (auth.uid(), '2026-10-20')`)).error, "a receipt with no supplier still saves");
say(!(await as("authenticated", A, `update public.receipts set amount = 5 where user_id = auth.uid()`)).error, "an edit that leaves the supplier alone is not re-checked, so an old row cannot block it");
const crossing = await one(`select count(*)::int as n from public.receipts r join public.clients c on c.id = r.client_id where c.user_id <> r.user_id`);
say(crossing.n === 1, "045's check 1 finds the row already crossing, and 045 left it alone (rule 1)", JSON.stringify(crossing));
const gen2 = await as("service_role", null, gen);
say(!gen2.error, "the cron's own invoices pass the new invoices trigger", gen2.error);

// ---- Nothing new is executable by the API roles -----------------------------
const fns = ["business_profile_plan_guard", "receipts_same_owner", "invoices_same_owner", "recurring_invoices_same_owner", "recurring_expenses_same_owner", "credit_notes_same_owner"];
const open = (await db.query(`select routine_name, grantee from information_schema.routine_privileges where routine_name in (${fns.map((f) => `'${f}'`).join(",")}) and grantee in ('PUBLIC', 'anon', 'authenticated')`)).rows;
say(open.length === 0, "no API role holds execute on the new functions", JSON.stringify(open));

// Every SECURITY DEFINER function in the folder pins its search_path. Read
// from the files, so a new one written without it fails here first.
const defs = fs.readdirSync(`${REPO}/web/supabase`).filter((f) => /^migration-.*\.sql$/.test(f))
  .flatMap((f) => [...file(f).matchAll(/create (?:or replace )?function\s+([\w.]+)\([^)]*\)[\s\S]*?\bas \$\$/gi)].map((m) => [f, m[1], m[0]]));
const noPath = defs.filter(([, , d]) => /security definer/i.test(d) && !/set search_path/i.test(d)).map(([f, n]) => `${n} (${f})`);
say(defs.length > 30 && noPath.length === 0, `every SECURITY DEFINER function sets search_path (${defs.length} definitions read)`, noPath.join(" | "));

// The grant that 041 got wrong: the LAST word in the folder on each function
// must not hand it to `authenticated` when its own header says service role.
const lastGrant = (fn) => {
  let last = null;
  for (const f of fs.readdirSync(`${REPO}/web/supabase`).filter((x) => /^migration-\d+/.test(x)).sort()) {
    for (const m of file(f).matchAll(new RegExp(`(grant|revoke)[^;]*function public\\.${fn}\\([^;]*;`, "gi"))) last = `${f}: ${m[0]}`;
  }
  return last;
};
for (const fn of ["generate_recurring_invoice", "respond_to_quote_link", "submit_quote_request_response", "record_invoice_link_view", "record_quote_link_view", "hit_rate_limit"]) {
  const l = lastGrant(fn) ?? "";
  say(!/grant[^;]*to[^;]*\bauthenticated\b/i.test(l), `the last grant on ${fn} in the folder is not to authenticated`, l);
}

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
