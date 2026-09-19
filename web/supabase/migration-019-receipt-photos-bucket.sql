-- https://supabase.com/dashboard/project/wecfwjxzyzzrcwbwnwpo/sql/new
--
-- No backup needed: this touches no table's columns or rows. It creates a
-- private storage bucket and the policies on storage.objects that let each
-- signed-in account read and add files only under its own folder
-- (<user id>/...). Safe to re-run.
--
-- Receipt photos and PDFs move out of receipts.image_data_url /
-- receipt_pages.image_data_url (base64 in Postgres, loaded with every list)
-- into this bucket; those columns then hold "storage:<path>". Existing rows
-- keep their inline data and still work. There is no delete policy: the app
-- never removes stored photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'receipts_owner_select') then
    create policy receipts_owner_select on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'receipts_owner_insert') then
    create policy receipts_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ── Checks after running ────────────────────────────────────────────
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'receipts';
--     -> receipts | false | 10485760 | {image/jpeg,...,application/pdf}
--   select policyname, cmd, roles from pg_policies
--     where schemaname = 'storage' and tablename = 'objects' and policyname like 'receipts_%';
--     -> receipts_owner_select SELECT {authenticated}; receipts_owner_insert INSERT {authenticated}
--   Then in the app: save a scanned receipt, check its row holds "storage:<uid>/..." and
--   the photo shows in Receipts and Files.
