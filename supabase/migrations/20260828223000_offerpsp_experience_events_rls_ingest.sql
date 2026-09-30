drop function if exists public.offerpsp_record_experience_event(text, text, uuid, text, text, boolean);

grant insert on table public.offerpsp_experience_events to anon;
grant usage on sequence public.offerpsp_experience_events_id_seq to anon;

drop policy if exists offerpsp_experience_events_server_ingest on public.offerpsp_experience_events;
create policy offerpsp_experience_events_server_ingest
  on public.offerpsp_experience_events
  for insert
  to anon
  with check (
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb
              ->> 'x-offerpsp-ingest-secret',
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) = '659e0a9603f4e6b0bff512cb7cce80432d6bafa6288850a233fc8f84b93d2636'
  );
