-- Keep the claimed array under a named key so n8n preserves the RPC response
-- as one JSON object instead of collapsing a root array to an empty item.

create or replace function public.claim_offerpsp_ingestion_jobs(p_limit integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare v_jobs jsonb;
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
  into v_jobs
  from claimed;

  return jsonb_build_object('jobs', v_jobs);
end;
$$;

revoke all on function public.claim_offerpsp_ingestion_jobs(integer) from public;
revoke execute on function public.claim_offerpsp_ingestion_jobs(integer) from anon, authenticated;
grant execute on function public.claim_offerpsp_ingestion_jobs(integer) to service_role;
