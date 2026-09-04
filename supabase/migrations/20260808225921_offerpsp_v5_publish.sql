create or replace function public.publish_offerpsp_rate_card(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_batch private.offerpsp_rate_card_batches;
  v_provider private.offerpsp_providers;
  v_route_count integer;
  v_blocking_anomalies integer;
  v_missing_pricing integer;
  v_missing_dimensions integer;
  v_invalid_limits integer;
  v_margin_ready boolean;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_batch
  from private.offerpsp_rate_card_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Rate-card batch not found';
  end if;

  if v_batch.status not in ('draft', 'review') then
    raise exception 'Only draft or review batches can be published';
  end if;

  select * into v_provider
  from private.offerpsp_providers
  where id = v_batch.provider_id;

  select count(*) into v_route_count
  from private.offerpsp_offer_routes
  where batch_id = v_batch.id
    and status in ('draft', 'review');

  select count(*) into v_blocking_anomalies
  from private.offerpsp_route_anomalies a
  join private.offerpsp_offer_routes r on r.id = a.route_id
  where a.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and a.status = 'open'
    and a.severity = 'error';

  select count(*) into v_missing_pricing
  from private.offerpsp_offer_routes r
  where r.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and not exists (
      select 1
      from private.offerpsp_offer_fee_components f
      where f.route_id = r.id
    );

  select count(*) into v_missing_dimensions
  from private.offerpsp_offer_routes r
  where r.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and (
      (r.coverage_scope = 'specific' and cardinality(r.geos) = 0)
      or cardinality(r.currencies) = 0
      or cardinality(r.methods) = 0
    );

  select count(*) into v_invalid_limits
  from private.offerpsp_offer_limits l
  join private.offerpsp_offer_routes r on r.id = l.route_id
  where r.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and l.minimum_amount is not null
    and l.maximum_amount is not null
    and l.maximum_amount < l.minimum_amount;

  v_margin_ready := v_provider.margin_included_default or exists (
    select 1
    from private.offerpsp_margin_policies mp
    where mp.provider_id = v_provider.id
      and mp.active
      and mp.effective_from <= now()
      and (mp.effective_to is null or mp.effective_to > now())
  );

  if v_route_count = 0 then
    raise exception 'A rate-card must contain at least one publishable route';
  end if;
  if v_blocking_anomalies > 0 then
    raise exception 'Resolve or exclude every error-level route before publication';
  end if;
  if v_missing_pricing > 0 then
    raise exception 'Every published route requires at least one fee component';
  end if;
  if v_missing_dimensions > 0 then
    raise exception 'Every published route requires GEO coverage, currency and payment method';
  end if;
  if v_invalid_limits > 0 then
    raise exception 'Resolve transaction limits where maximum is below minimum';
  end if;
  if not v_margin_ready then
    raise exception 'A provider margin policy is required before publication';
  end if;

  -- Publish successors before archiving their predecessors so Impact Control
  -- can distinguish identical confirmations from actual commercial changes.
  update private.offerpsp_offer_routes
  set status = 'published', updated_at = now()
  where batch_id = v_batch.id
    and status in ('draft', 'review');

  update private.offerpsp_offer_routes old_route
  set status = 'archived', updated_at = now()
  where old_route.provider_id = v_batch.provider_id
    and old_route.status in ('published', 'paused')
    and old_route.batch_id <> v_batch.id
    and exists (
      select 1
      from private.offerpsp_offer_routes successor
      where successor.batch_id = v_batch.id
        and successor.status = 'published'
        and successor.revision_of_route_id = old_route.id
    );

  update private.offerpsp_rate_card_batches
  set status = 'superseded',
      superseded_at = now(),
      updated_at = now()
  where provider_id = v_batch.provider_id
    and status = 'published'
    and id <> v_batch.id;

  update private.offerpsp_rate_card_batches
  set status = 'published',
      published_by = auth.uid(),
      published_at = now()
  where id = v_batch.id;

  update private.offerpsp_providers
  set relationship_status = case
        when relationship_status in ('prospect', 'onboarding') then 'active'
        else relationship_status
      end,
      last_verified_at = now()
  where id = v_batch.provider_id;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'provider_code', v_provider.internal_code,
    'status', 'published',
    'route_count', v_route_count
  );
end;
$$;

create or replace function public.set_offerpsp_route_status(p_route_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_offer_routes;
  v_after private.offerpsp_offer_routes;
  v_provider private.offerpsp_providers;
  v_batch_status text;
  v_open_errors integer;
  v_invalid_limits integer;
  v_margin_ready boolean;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_before from private.offerpsp_offer_routes where id = p_route_id for update;
  if not found then raise exception 'OfferPSP route not found'; end if;
  select status into v_batch_status from private.offerpsp_rate_card_batches where id = v_before.batch_id;

  if p_status = 'paused' and v_before.status <> 'published' then raise exception 'Only a published route can be paused'; end if;
  if p_status = 'published' and not (v_before.status = 'paused' and v_batch_status = 'published') then raise exception 'Only a paused route from the published batch can be resumed'; end if;
  if p_status = 'review' and v_before.status not in ('draft', 'archived') then raise exception 'Only a draft or archived route can return to review'; end if;
  if p_status = 'archived' and v_before.status not in ('draft', 'review', 'paused') then raise exception 'This route cannot be archived directly'; end if;
  if p_status not in ('review', 'published', 'paused', 'archived') then raise exception 'Unsupported route status'; end if;

  if p_status = 'published' then
    select * into v_provider from private.offerpsp_providers where id = v_before.provider_id;
    select count(*) into v_open_errors
    from private.offerpsp_route_anomalies
    where route_id = v_before.id and status = 'open' and severity = 'error';
    select count(*) into v_invalid_limits
    from private.offerpsp_offer_limits
    where route_id = v_before.id
      and minimum_amount is not null
      and maximum_amount is not null
      and maximum_amount < minimum_amount;
    v_margin_ready := v_provider.margin_included_default or exists (
      select 1
      from private.offerpsp_margin_policies mp
      where mp.provider_id = v_before.provider_id
        and (mp.route_id is null or mp.route_id = v_before.id)
        and mp.merchant_lead_id is null
        and mp.flow in ('all', v_before.flow)
        and mp.active
        and mp.effective_from <= now()
        and (mp.effective_to is null or mp.effective_to > now())
    );

    if v_open_errors > 0 then raise exception 'Resolve all route errors before resuming'; end if;
    if not exists (select 1 from private.offerpsp_offer_fee_components where route_id = v_before.id) then raise exception 'The route requires a fee before resuming'; end if;
    if (v_before.coverage_scope = 'specific' and cardinality(v_before.geos) = 0)
       or cardinality(v_before.currencies) = 0
       or cardinality(v_before.methods) = 0 then
      raise exception 'The route requires GEO coverage, currency and payment method before resuming';
    end if;
    if v_invalid_limits > 0 then raise exception 'Resolve invalid transaction limits before resuming'; end if;
    if not v_margin_ready then raise exception 'A current margin policy is required before resuming'; end if;
  end if;

  update private.offerpsp_offer_routes set status = p_status, updated_at = now() where id = p_route_id returning * into v_after;
  insert into private.offerpsp_supply_activities(provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state)
  values (v_after.provider_id, v_after.id, v_after.batch_id, auth.uid(), 'route_status_changed', 'Route status changed to ' || p_status, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'raw_block';
end;
$$;

