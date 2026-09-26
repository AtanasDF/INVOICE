// Row-level security, tried against a real Postgres instead of read off the page.
//
// WHY THIS EXISTS. `test-rls-audit` reads the SQL FILES. That is worth having,
// but it cannot answer the only question that matters -- would this database
// actually hand one person another person's records -- and on 2026-09-21 that
// gap produced a wrong finding: migration-031 was written believing six backup
// tables were readable by any signed-in account, and they never were. RLS had
// been on in the live database the whole time. CLAUDE.md's rule came out of it:
// "check the live catalog before acting on a finding about it."
//
// Now there is a third option between reading a file and poking production.
// pglite is a real Postgres in WASM, so the whole schema can be built from
// nothing -- schema.sql then all forty migrations in order -- and then actually
// attacked: two accounts, rows belonging to each, and a session that says it is
// one of them.
//
// WHAT IT ALSO PROVES, for free: that the schema applies from an empty database
// at all. Every migration here has only ever been run once, by hand, against a
// database that already had the one before it. Nobody has ever checked that the
// set still composes -- and that is what a restore would have to do.
//
// The Supabase-shaped pieces a bare Postgres lacks (the three roles, auth.users,
// auth.uid(), a storage schema) are stubbed at the top. auth.uid() reads a
// session setting instead of a JWT, which is exactly what Supabase's own does
// with `request.jwt.claim.sub`.
//
// pglite is a devDependency of the harness; without it the suite says so and
// passes rather than failing a run on a machine that was never set up for it.
import fs from "node:fs";
import { REPO } from "./repo.mjs";

let PGlite, pgcrypto;
const where = process.env.PGLITE;
for (const base of where ? [where, `${where}/dist`] : ["@electric-sql/pglite"]) {
  try {
    ({ PGlite } = await import(where ? `${base}/index.js` : base));
    ({ pgcrypto } = await import(where ? `${base}/contrib/pgcrypto.js` : "@electric-sql/pglite/contrib/pgcrypto"));
    break;
  } catch {
    // try the next shape
  }
}
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
if (!PGlite) {
  console.log("SKIP @electric-sql/pglite is not installed");
  console.log(JSON.stringify({ passed: 0, total: 0 }));
  process.exit(0);
}

const DIR = `${REPO}/web/supabase`;
const db = await PGlite.create({ extensions: { pgcrypto } });

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema if not exists storage;
  create table storage.buckets (id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  -- Supabase's own helper, used by the receipts-bucket policies: the folder
  -- parts of an object path, so a policy can say "only inside your own uid".
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants anon and authenticated EVERYTHING on a table created in
  -- public, and every migration's explicit \`revoke\` is written against that
  -- default -- migration-020's comment says so, and migration-031 exists
  -- entirely to take those defaults off 24 backup tables. Without reproducing
  -- it here the test would be checking a database nobody runs.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

// ---- the whole schema, from nothing ---------------------------------------
const files = ["schema.sql", ...fs.readdirSync(DIR).filter((f) => /^migration-\d+.*\.sql$/.test(f)).sort()];
const failed = [];
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(`${DIR}/${f}`, "utf8"));
  } catch (e) {
    failed.push(`${f}: ${String(e.message).split("\n")[0].slice(0, 120)}`);
  }
}
check(`the schema and all ${files.length - 1} migrations apply to an empty database`, failed.length === 0, failed.join(" | "));

const one = async (sql) => (await db.query(sql)).rows[0];
const rows = async (sql) => (await db.query(sql)).rows;

// ---- every table is covered ------------------------------------------------
const noRls = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
check("every table in public has row-level security switched on", noRls.length === 0, noRls.map((r) => r.relname).join(", "));

const owned = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join information_schema.columns col on col.table_name = c.relname and col.table_schema = 'public' and col.column_name = 'user_id'
  where n.nspname = 'public' and c.relkind = 'r' order by 1`);
check("there are tables carrying a user_id to protect", owned.length >= 10, String(owned.length));
const unprotected = [];
for (const { relname } of owned) {
  const p = await one(`select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = '${relname}'`);
  if (p.n === 0) unprotected.push(relname);
}
check("...and every one of them has at least one policy", unprotected.length === 0, unprotected.join(", "));

// ---- now actually try it ---------------------------------------------------
const A = (await one(`insert into auth.users (email) values ('a@example.com') returning id`)).id;
const B = (await one(`insert into auth.users (email) values ('b@example.com') returning id`)).id;
const as = async (uid, sql) => {
  await db.exec("begin");
  try {
    await db.exec(`set local role authenticated; set local request.jwt.claim.sub = '${uid}';`);
    return await db.query(sql);
  } finally {
    await db.exec("rollback");
  }
};

// Seeded with the owner's key, as the service role would.
await db.exec(`
  insert into public.clients (user_id, name) values ('${A}', 'A Client'), ('${B}', 'B Client');
  insert into public.receipts (user_id, date, vendor, amount, vat_amount)
    values ('${A}', current_date, 'A Shop', 10, 2), ('${B}', current_date, 'B Shop', 20, 4);
`);

const aSees = await as(A, "select user_id from public.clients");
check("a signed-in account sees its own rows", aSees.rows.length === 1 && aSees.rows[0].user_id === A, JSON.stringify(aSees.rows));
check("...and not the other account's", !aSees.rows.some((r) => r.user_id === B), JSON.stringify(aSees.rows));

const aReceipts = await as(A, "select user_id, vendor from public.receipts");
check("the same on receipts, which hold the money", aReceipts.rows.length === 1 && aReceipts.rows[0].vendor === "A Shop", JSON.stringify(aReceipts.rows));

// Asking for somebody else's row BY ID is the attack that matters: a route
// that forgets to scope its query still gets nothing back.
const bId = (await one(`select id from public.clients where user_id = '${B}'`)).id;
const byId = await as(A, `select * from public.clients where id = '${bId}'`);
check("asking for another account's row by its id returns nothing", byId.rows.length === 0, JSON.stringify(byId.rows));

// Writing into somebody else's account must be refused, not silently accepted.
let wroteForB = null;
try {
  await as(A, `insert into public.clients (user_id, name) values ('${B}', 'Planted')`);
  wroteForB = "the insert was accepted";
} catch (e) {
  wroteForB = null;
  void e;
}
check("one account cannot insert a row belonging to another", wroteForB === null, String(wroteForB));

// And updating one.
const upd = await as(A, `update public.clients set name = 'Taken' where id = '${bId}' returning id`);
check("...nor update one", upd.rows.length === 0, JSON.stringify(upd.rows));

// A visitor with no session at all sees nothing anywhere.
const anonSaw = [];
for (const t of ["clients", "receipts"]) {
  await db.exec("begin");
  try {
    await db.exec("set local role anon");
    const r = await db.query(`select count(*)::int as n from public.${t}`).catch(() => ({ rows: [{ n: "refused" }] }));
    if (r.rows[0].n !== 0 && r.rows[0].n !== "refused") anonSaw.push(`${t}=${r.rows[0].n}`);
  } finally {
    await db.exec("rollback");
  }
}
check("a visitor with no account reads nothing at all", anonSaw.length === 0, anonSaw.join(", "));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
