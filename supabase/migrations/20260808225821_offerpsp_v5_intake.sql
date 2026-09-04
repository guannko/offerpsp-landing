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

  -- Suppress only an immediate transport retry. Identical terms received as a
  -- later partner message are deliberately accepted as a new version.
  select * into v_job
  from private.offerpsp_ingestion_jobs
  where lower(trim(provider_name)) = lower(trim(p_provider_name))
    and source_type = p_source_type
    and source_hash = md5(p_source_text)
    and coalesce(source_reference, '') = coalesce(nullif(trim(p_source_reference), ''), '')
    and status not in ('failed', 'dismissed')
    and received_at >= now() - interval '10 minutes'
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

create or replace function public.publish_offerpsp_route(p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_route private.offerpsp_offer_routes;
  v_provider private.offerpsp_providers;
  v_open_errors integer;
  v_invalid_limits integer;
  v_margin_ready boolean;
  v_remaining_routes integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_route
  from private.offerpsp_offer_routes
  where id = p_route_id
  for update;

  if not found then
    raise exception 'OfferPSP route not found';
  end if;
  if v_route.status not in ('draft', 'review') then
    raise exception 'Only a draft or review route can be published';
  end if;

  select * into v_provider
  from private.offerpsp_providers
  where id = v_route.provider_id;

  select count(*) into v_open_errors
  from private.offerpsp_route_anomalies
  where route_id = v_route.id
    and status = 'open'
    and severity = 'error';

  select count(*) into v_invalid_limits
  from private.offerpsp_offer_limits
  where route_id = v_route.id
    and minimum_amount is not null
    and maximum_amount is not null
    and maximum_amount < minimum_amount;

  v_margin_ready := v_provider.margin_included_default or exists (
    select 1
    from private.offerpsp_margin_policies mp
    where mp.provider_id = v_route.provider_id
      and (mp.route_id is null or mp.route_id = v_route.id)
      and mp.merchant_lead_id is null
      and mp.flow in ('all', v_route.flow)
      and mp.active
      and mp.effective_from <= now()
      and (mp.effective_to is null or mp.effective_to > now())
  );

  if v_open_errors > 0 then
    raise exception 'Resolve all route errors before publication';
  end if;
  if not exists (
    select 1 from private.offerpsp_offer_fee_components where route_id = v_route.id
  ) then
    raise exception 'The route requires at least one fee before publication';
  end if;
  if (v_route.coverage_scope = 'specific' and cardinality(v_route.geos) = 0)
     or cardinality(v_route.currencies) = 0
     or cardinality(v_route.methods) = 0 then
    raise exception 'The route requires GEO coverage, currency and payment method before publication';
  end if;
  if v_invalid_limits > 0 then
    raise exception 'Resolve invalid transaction limits before publication';
  end if;
  if not v_margin_ready then
    raise exception 'A current margin policy is required before publication';
  end if;

  -- Publish the replacement first. The old-route trigger can then resolve the
  -- exact successor and decide whether merchants need an update.
  update private.offerpsp_offer_routes
  set status = 'published', updated_at = now()
  where id = v_route.id;

  if v_route.revision_of_route_id is not null then
    update private.offerpsp_offer_routes
    set status = 'archived', updated_at = now()
    where id = v_route.revision_of_route_id
      and status in ('published', 'paused');
  end if;

  select count(*) into v_remaining_routes
  from private.offerpsp_offer_routes
  where batch_id = v_route.batch_id
    and status in ('draft', 'review');

  update private.offerpsp_rate_card_batches
  set status = case when v_remaining_routes = 0 then 'published' else 'review' end,
      published_by = case when v_remaining_routes = 0 then auth.uid() else published_by end,
      published_at = case when v_remaining_routes = 0 then now() else published_at end,
      updated_at = now()
  where id = v_route.batch_id;

  update private.offerpsp_providers
  set relationship_status = case
        when relationship_status in ('prospect', 'onboarding') then 'active'
        else relationship_status
      end,
      last_verified_at = now(),
      updated_at = now()
  where id = v_route.provider_id;

  insert into private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, after_state
  ) values (
    v_route.provider_id, v_route.id, v_route.batch_id, auth.uid(),
    'route_published', 'Individual normalized offer published',
    jsonb_build_object('status', 'published', 'revision_of_route_id', v_route.revision_of_route_id)
  );

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, after_state
  ) values (
    'offer', v_route.id::text, 'published', auth.uid(),
    jsonb_build_object('status', 'published', 'batch_id', v_route.batch_id)
  );

  return jsonb_build_object(
    'route_id', v_route.id,
    'batch_id', v_route.batch_id,
    'provider_id', v_route.provider_id,
    'status', 'published'
  );
end;
$$;

