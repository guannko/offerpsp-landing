drop policy if exists offerpsp_experience_events_server_ingest
  on public.offerpsp_experience_events;

create policy offerpsp_experience_events_server_ingest
on public.offerpsp_experience_events
for insert
to anon
with check (
  encode(
    digest(
      convert_to(
        coalesce(
          (
            nullif(
              (select current_setting('request.headers', true)),
              ''
            )::jsonb ->> 'x-offerpsp-ingest-secret'
          ),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) = '659e0a9603f4e6b0bff512cb7cce80432d6bafa6288850a233fc8f84b93d2636'
);

comment on policy offerpsp_experience_events_server_ingest
on public.offerpsp_experience_events is
  'Anonymous ingestion requires the server secret header; request headers are read once through an initplan-safe scalar subquery.';
