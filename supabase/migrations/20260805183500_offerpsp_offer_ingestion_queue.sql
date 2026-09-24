-- One private intake queue for Telegram, email and staff-uploaded PSP rate cards.
-- Every source remains a draft until a staff member reviews and publishes its routes.

create table if not exists private.offerpsp_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references private.offerpsp_providers(id) on delete set null,
  provider_name text not null,
  source_type text not null check (source_type in ('telegram', 'email', 'admin_text', 'admin_file', 'api')),
  source_reference text,
  source_text text not null,
  source_hash text generated always as (md5(source_text)) stored,
  source_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'review', 'imported', 'duplicate', 'failed', 'dismissed')),
  parser_version text,
  parsed_payload jsonb,
  batch_id uuid references private.offerpsp_rate_card_batches(id) on delete set null,
  route_count integer not null default 0 check (route_count >= 0),
  blocking_anomaly_count integer not null default 0 check (blocking_anomaly_count >= 0),
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider_name, source_hash)
);

create index if not exists offerpsp_ingestion_jobs_status_received_idx
  on private.offerpsp_ingestion_jobs (status, received_at desc);
create index if not exists offerpsp_ingestion_jobs_provider_idx
  on private.offerpsp_ingestion_jobs (provider_id, received_at desc);

drop trigger if exists offerpsp_ingestion_jobs_set_updated_at
  on private.offerpsp_ingestion_jobs;
create trigger offerpsp_ingestion_jobs_set_updated_at
before update on private.offerpsp_ingestion_jobs
for each row execute function public.set_offerpsp_updated_at();

-- Service-role requests already possess database-wide authority. Treat them as a
-- trusted automation actor while preserving the single-Google-owner staff rule.
create or replace function public.is_offerpsp_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'guannko@gmail.com'
      and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
      and exists (
        select 1
        from public.offerpsp_staff_members
        where user_id = auth.uid()
          and active = true
      )
    );
$$;

revoke all on function public.is_offerpsp_staff() from public;
revoke execute on function public.is_offerpsp_staff() from anon;
grant execute on function public.is_offerpsp_staff() to authenticated, service_role;

create or replace function public.enqueue_offerpsp_source(
  p_provider_name text,
  p_source_type text,
  p_source_text text,
  p_source_reference text default null,
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_job private.offerpsp_ingestion_jobs;
  v_provider_id uuid;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff or service access required';
  end if;
  if nullif(trim(p_provider_name), '') is null then
    raise exception 'Provider name is required';
  end if;
  if p_source_type not in ('telegram', 'email', 'admin_text', 'admin_file', 'api') then
    raise exception 'Unsupported offer source type';
  end if;
  if nullif(trim(p_source_text), '') is null then
    raise exception 'Offer source text is required';
  end if;
  if length(p_source_text) > 1000000 then
    raise exception 'Offer source text exceeds 1 MB';
  end if;

  select id into v_provider_id
  from private.offerpsp_providers
  where lower(trim(brand_name)) = lower(trim(p_provider_name))
  order by created_at
  limit 1;

  select * into v_job
  from private.offerpsp_ingestion_jobs
  where lower(trim(provider_name)) = lower(trim(p_provider_name))
    and source_hash = md5(p_source_text)
  order by received_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'duplicate', true,
      'batch_id', v_job.batch_id
    );
  end if;

  insert into private.offerpsp_ingestion_jobs (
    provider_id, provider_name, source_type, source_reference, source_text,
    source_metadata, received_by
  ) values (
    v_provider_id, trim(p_provider_name), p_source_type,
    nullif(trim(p_source_reference), ''), p_source_text,
    coalesce(p_source_metadata, '{}'::jsonb), auth.uid()
  ) returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'duplicate', false,
    'provider_id', v_job.provider_id
  );
end;
$$;

create or replace function public.complete_offerpsp_source(
  p_job_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_job private.offerpsp_ingestion_jobs;
  v_provider_code text;
  v_provider_result jsonb;
  v_import_result jsonb;
  v_provider jsonb := coalesce(p_payload -> 'provider', '{}'::jsonb);
  v_batch jsonb := coalesce(p_payload -> 'batch', '{}'::jsonb);
  v_routes jsonb := coalesce(p_payload -> 'batch' -> 'routes', '[]'::jsonb);
  v_metadata jsonb := coalesce(p_payload -> 'batch' -> 'parser_metadata', '{}'::jsonb);
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff or service access required';
  end if;
  if jsonb_typeof(v_routes) <> 'array' then
    raise exception 'Parsed routes must be a JSON array';
  end if;

  select * into v_job
  from private.offerpsp_ingestion_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Offer ingestion job not found'; end if;
  if v_job.status = 'dismissed' then raise exception 'Dismissed ingestion job cannot be imported'; end if;

  update private.offerpsp_ingestion_jobs
  set status = 'processing', attempt_count = attempt_count + 1, error_message = null
  where id = p_job_id;

  select internal_code into v_provider_code
  from private.offerpsp_providers
  where id = v_job.provider_id;

  if v_provider_code is null then
    v_provider_result := public.upsert_offerpsp_provider(
      coalesce(nullif(trim(v_provider ->> 'brand_name'), ''), v_job.provider_name),
      null,
      null,
      nullif(trim(v_provider ->> 'website'), ''),
      'prospect',
      coalesce((v_provider ->> 'strategic_priority')::integer, 50),
      coalesce((v_provider ->> 'margin_included_default')::boolean, false),
      'Created by the universal offer-ingestion queue'
    );
    v_provider_code := v_provider_result ->> 'internal_code';
    update private.offerpsp_ingestion_jobs
    set provider_id = (select id from private.offerpsp_providers where internal_code = v_provider_code)
    where id = p_job_id;
  end if;

  v_import_result := public.import_offerpsp_rate_card(
    v_provider_code,
    case v_job.source_type
      when 'admin_text' then 'manual'
      when 'admin_file' then 'file'
      else v_job.source_type
    end,
    v_job.source_text,
    coalesce(nullif(trim(v_batch ->> 'source_reference'), ''), v_job.source_reference),
    nullif(trim(v_batch ->> 'source_effective_date'), '')::date,
    coalesce(nullif(trim(v_batch ->> 'parser_version'), ''), 'offerpsp-source-parser-v3'),
    v_metadata || jsonb_build_object('ingestion_job_id', v_job.id),
    v_routes
  );

  update private.offerpsp_ingestion_jobs
  set status = case when coalesce((v_import_result ->> 'duplicate')::boolean, false) then 'duplicate' else 'review' end,
      parser_version = coalesce(nullif(trim(v_batch ->> 'parser_version'), ''), 'offerpsp-source-parser-v3'),
      parsed_payload = p_payload,
      batch_id = (v_import_result ->> 'batch_id')::uuid,
      route_count = coalesce((v_import_result ->> 'route_count')::integer, jsonb_array_length(v_routes)),
      blocking_anomaly_count = coalesce((v_metadata ->> 'blocking_anomaly_count')::integer, 0),
      processed_at = now(),
      error_message = null
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'provider_code', v_provider_code,
    'batch_id', v_job.batch_id,
    'route_count', v_job.route_count,
    'blocking_anomaly_count', v_job.blocking_anomaly_count,
    'duplicate', v_job.status = 'duplicate'
  );
exception when others then
  update private.offerpsp_ingestion_jobs
  set status = 'failed', error_message = sqlerrm, processed_at = now()
  where id = p_job_id;
  return jsonb_build_object(
    'job_id', p_job_id,
    'status', 'failed',
    'error', sqlerrm
  );
end;
$$;

create or replace function public.list_offerpsp_ingestion_jobs(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(j) order by j.received_at desc)
    from (
      select
        q.id, q.provider_id, q.provider_name, q.source_type, q.source_reference,
        q.source_text, q.source_metadata, q.status, q.parser_version, q.batch_id,
        q.route_count, q.blocking_anomaly_count, q.error_message, q.attempt_count,
        q.received_at, q.processed_at, q.reviewed_at, q.updated_at,
        p.internal_code as provider_code, b.batch_version
      from private.offerpsp_ingestion_jobs q
      left join private.offerpsp_providers p on p.id = q.provider_id
      left join private.offerpsp_rate_card_batches b on b.id = q.batch_id
      order by q.received_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) j
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_offerpsp_ingestion_state(
  p_job_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare v_job private.offerpsp_ingestion_jobs;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('queued', 'dismissed') then raise exception 'Unsupported manual ingestion status'; end if;
  update private.offerpsp_ingestion_jobs
  set status = p_status,
      reviewed_at = case when p_status = 'dismissed' then now() else reviewed_at end,
      error_message = case when p_status = 'queued' then null else error_message end
  where id = p_job_id
  returning * into v_job;
  if not found then raise exception 'Offer ingestion job not found'; end if;
  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status);
end;
$$;

revoke all on table private.offerpsp_ingestion_jobs from public, anon, authenticated;

revoke all on function public.enqueue_offerpsp_source(text,text,text,text,jsonb) from public;
revoke execute on function public.enqueue_offerpsp_source(text,text,text,text,jsonb) from anon;
grant execute on function public.enqueue_offerpsp_source(text,text,text,text,jsonb) to authenticated, service_role;

revoke all on function public.complete_offerpsp_source(uuid,jsonb) from public;
revoke execute on function public.complete_offerpsp_source(uuid,jsonb) from anon, authenticated;
grant execute on function public.complete_offerpsp_source(uuid,jsonb) to service_role;

revoke all on function public.list_offerpsp_ingestion_jobs(integer) from public;
revoke execute on function public.list_offerpsp_ingestion_jobs(integer) from anon;
grant execute on function public.list_offerpsp_ingestion_jobs(integer) to authenticated;

revoke all on function public.set_offerpsp_ingestion_state(uuid,text) from public;
revoke execute on function public.set_offerpsp_ingestion_state(uuid,text) from anon;
grant execute on function public.set_offerpsp_ingestion_state(uuid,text) to authenticated;

grant execute on function public.upsert_offerpsp_provider(text,text,text,text,text,integer,boolean,text) to service_role;
grant execute on function public.import_offerpsp_rate_card(text,text,text,text,date,text,jsonb,jsonb) to service_role;

comment on table private.offerpsp_ingestion_jobs is
  'Private source queue shared by Telegram, email, staff uploads and API ingestion. Imported routes always remain draft/review until staff publication.';
