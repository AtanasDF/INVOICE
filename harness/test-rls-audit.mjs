// Every table this project creates must have row level security on. A
// table without it is readable by any signed-in account, and the anon key
// is published in the app itself.
import { readdirSync, readFileSync } from "node:fs";
const DIR = "/Users/nasko/Desktop/INVOICE/web/supabase";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const all = files.map((f) => readFileSync(`${DIR}/${f}`, "utf8")).join("\n");
const tables = new Map();
for (const f of files) {
  for (const m of readFileSync(`${DIR}/${f}`, "utf8").matchAll(/create table (?:if not exists )?public\.(\w+)/gi)) {
    if (!tables.has(m[1])) tables.set(m[1], f);
  }
}

check("the SQL folder is being read", tables.size > 20, String(tables.size));
const noRls = [];
const noPolicy = [];
// migration-031 enables RLS on every %_backup_% table through a loop, but
// only the snapshots from 000/001 -- the two files written before the
// habit -- count as covered by it: a backup file written tomorrow without
// the ALTER must still be flagged, or rule 2 stops being checked. This
// reads the SQL files, not the live database: on 2026-09-21 it reported
// six backup tables open that the database had locked all along (000/001
// never wrote the ALTER, but RLS was on). What proves the database is the
// query at the foot of migration-031, run against it.
const lockedDown = /like '%\\_backup\\_%'[\s\S]*?enable row level security/i.test(readFileSync(`${DIR}/migration-031-lock-down-early-backups.sql`, "utf8"));
for (const [t, where] of tables) {
  if (!new RegExp(`alter table (?:public\\.)?${t}\\s+enable row level security`, "i").test(all) && !(lockedDown && /^00[01]-backup/.test(where))) noRls.push(`${t} (${where})`);
  else if (!new RegExp(`create policy[^;]*?on public\\.${t}\\b`, "is").test(all) && !/_backup_/.test(t) && t !== "rate_limit_hits") noPolicy.push(`${t} (${where})`);
}
check(`every table has row level security switched on (${tables.size} tables)`, noRls.length === 0, noRls.join(" | "));
check("every table the app reads has an owner policy", noPolicy.length === 0, noPolicy.join(" | "));

// A backup table must have no policy at all: service role only.
const withPolicy = [...tables.keys()].filter((t) => /_backup_/.test(t) && new RegExp(`create policy[^;]*?on public\\.${t}\\b`, "is").test(all));
check("no snapshot is left readable by an account", withPolicy.length === 0, withPolicy.join(" | "));

// The rate limiter's table is service-role only by design.
check("the rate limiter's table has no policy, by design", !/create policy[^;]*?on public\.rate_limit_hits\b/is.test(all));
console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
