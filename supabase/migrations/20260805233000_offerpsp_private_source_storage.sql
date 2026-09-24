-- Private originals for rate cards uploaded by OfferPSP staff.
-- Files are never public and their storage paths are referenced by ingestion jobs/batches.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'offerpsp-private-sources',
  'offerpsp-private-sources',
  false,
  15728640,
  array[
    'text/plain', 'text/csv', 'text/tab-separated-values', 'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists offerpsp_staff_read_private_sources on storage.objects;
create policy offerpsp_staff_read_private_sources
on storage.objects for select to authenticated
using (bucket_id = 'offerpsp-private-sources' and public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_upload_private_sources on storage.objects;
create policy offerpsp_staff_upload_private_sources
on storage.objects for insert to authenticated
with check (bucket_id = 'offerpsp-private-sources' and public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_update_private_sources on storage.objects;
create policy offerpsp_staff_update_private_sources
on storage.objects for update to authenticated
using (bucket_id = 'offerpsp-private-sources' and public.is_offerpsp_staff())
with check (bucket_id = 'offerpsp-private-sources' and public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_delete_private_sources on storage.objects;
create policy offerpsp_staff_delete_private_sources
on storage.objects for delete to authenticated
using (bucket_id = 'offerpsp-private-sources' and public.is_offerpsp_staff());
