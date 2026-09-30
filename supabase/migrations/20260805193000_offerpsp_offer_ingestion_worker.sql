-- Service-role worker primitives for parsing queued offer sources.
-- Claiming is atomic and never publishes an imported route.

create or replace function public.claim_offerpsp_ingestion_jobs(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Offer ingestion worker access required';
  end if;

  with candidates as (
    select q.id
    from private.offerpsp_ingestion_jobs q
    where q.status = 'queued'
       or (q.status = 'processing' and q.updated_at < now() - interval '15 minutes')
    order by q.received_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ), claimed as (
    update private.offerpsp_ingestion_jobs q
    set status = 'processing', error_message = null, updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.id, q.provider_id, q.provider_name, q.source_type,
      q.source_reference, q.source_text, q.source_metadata, q.attempt_count,
      q.received_at, q.updated_at
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.received_at), '[]'::jsonb)
  into v_result
  from claimed;

  return v_result;
end;
$$;

create or replace function public.fail_offerpsp_source(
  p_job_id uuid,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare v_job private.offerpsp_ingestion_jobs;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Offer ingestion worker access required';
  end if;

  update private.offerpsp_ingestion_jobs
  set status = 'failed',
      attempt_count = attempt_count + 1,
      error_message = left(coalesce(nullif(trim(p_error_message), ''), 'Unknown parser failure'), 4000),
      processed_at = now()
  where id = p_job_id
    and status <> 'dismissed'
  returning * into v_job;

  if not found then raise exception 'Offer ingestion job not found or dismissed'; end if;
  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'attempt_count', v_job.attempt_count,
    'error', v_job.error_message
  );
end;
$$;

revoke all on function public.claim_offerpsp_ingestion_jobs(integer) from public;
revoke execute on function public.claim_offerpsp_ingestion_jobs(integer) from anon, authenticated;
grant execute on function public.claim_offerpsp_ingestion_jobs(integer) to service_role;

revoke all on function public.fail_offerpsp_source(uuid,text) from public;
revoke execute on function public.fail_offerpsp_source(uuid,text) from anon, authenticated;
grant execute on function public.fail_offerpsp_source(uuid,text) to service_role;

comment on function public.claim_offerpsp_ingestion_jobs(integer) is
  'Atomically claims queued or stale processing jobs for the service-role parser worker.';
comment on function public.fail_offerpsp_source(uuid,text) is
  'Records a parser transport or normalization failure without deleting the immutable source.';
