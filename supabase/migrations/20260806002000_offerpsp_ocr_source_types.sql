-- Allow private OCR source images while keeping the source bucket non-public.

update storage.buckets
set allowed_mime_types = array[
  'text/plain', 'text/csv', 'text/tab-separated-values', 'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/webp'
]::text[]
where id = 'offerpsp-private-sources';
