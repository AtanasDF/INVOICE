-- READ-ONLY. Run this first in the Supabase SQL Editor.
-- It only SELECTs. It changes nothing and cannot remove anything.
-- It tells you what already exists before you run schema.sql.

-- 1. Which of the three tables already exist?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('clients', 'receipts', 'invoices');

-- 2. How many rows are in each existing table?
--    (If a table doesn't exist yet this errors harmlessly - skip it.)
select 'clients' as table_name, count(*) as rows from public.clients
union all select 'receipts', count(*) from public.receipts
union all select 'invoices', count(*) from public.invoices;

-- 3. Any existing rows with no owner? Those would become invisible
--    once row level security is switched on by schema.sql.
select 'clients' as table_name, count(*) as rows_without_user_id
from public.clients where user_id is null
union all select 'receipts', count(*) from public.receipts where user_id is null
union all select 'invoices', count(*) from public.invoices where user_id is null;

-- 4. What policies already exist on these tables?
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('clients', 'receipts', 'invoices');
