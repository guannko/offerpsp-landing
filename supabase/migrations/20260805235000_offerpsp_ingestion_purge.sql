-- Guarded staff cleanup for rejected/test ingestion sources.
-- Physical Storage deletion remains in the authenticated frontend so the Storage API,
-- rather than direct SQL, removes the underlying object.

create or replace function public.purge_offerpsp_ingestion_source(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_job private.offerpsp_ingestion_jobs;
  v_batch_status text;
  v_storage_path text;
  v_provider_deleted boolean := false;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_job
  from private.offerpsp_ingestion_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Offer ingestion job not found'; end if;
  if v_job.status not in ('review', 'failed', 'duplicate', 'dismissed') then
    raise exception 'Only reviewed, failed, duplicate or dismissed sources can be purged';
  end if;

  if v_job.batch_id is not null then
    select status into v_batch_status
    from private.offerpsp_rate_card_batches
    where id = v_job.batch_id;
    if v_batch_status = 'published' or exists (
      select 1 from private.offerpsp_offer_routes
      where batch_id = v_job.batch_id and status = 'published'
    ) then
      raise exception 'A source connected to published routes cannot be purged';
    end if;
  end if;

  if v_job.source_reference like 'storage://offerpsp-private-sources/%' then
    v_storage_path := substring(v_job.source_reference from length('storage://offerpsp-private-sources/') + 1);
  end if;

  delete from private.offerpsp_ingestion_jobs where id = v_job.id;
  if v_job.batch_id is not null then
    delete from private.offerpsp_rate_card_batches where id = v_job.batch_id;
  end if;

  if v_job.provider_id is not null
     and exists (
       select 1 from private.offerpsp_providers
       where id = v_job.provider_id
         and relationship_notes = 'Created by the universal offer-ingestion queue'
     )
     and not exists (select 1 from private.offerpsp_ingestion_jobs where provider_id = v_job.provider_id)
     and not exists (select 1 from private.offerpsp_rate_card_batches where provider_id = v_job.provider_id)
     and not exists (select 1 from private.offerpsp_offer_routes where provider_id = v_job.provider_id)
     and not exists (select 1 from private.offerpsp_provider_contacts where provider_id = v_job.provider_id)
     and not exists (select 1 from private.offerpsp_margin_policies where provider_id = v_job.provider_id) then
    delete from private.offerpsp_providers where id = v_job.provider_id;
    v_provider_deleted := found;
  end if;

  return jsonb_build_object(
    'success', true,
    'job_id', v_job.id,
    'batch_id', v_job.batch_id,
    'provider_id', v_job.provider_id,
    'provider_deleted', v_provider_deleted,
    'storage_path', v_storage_path
  );
end;
$$;

revoke all on function public.purge_offerpsp_ingestion_source(uuid) from public;
revoke execute on function public.purge_offerpsp_ingestion_source(uuid) from anon;
grant execute on function public.purge_offerpsp_ingestion_source(uuid) to authenticated;
