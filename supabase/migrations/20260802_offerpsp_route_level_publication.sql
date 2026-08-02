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

  update private.offerpsp_rate_card_batches
  set status = 'superseded',
      superseded_at = now()
  where provider_id = v_batch.provider_id
    and status = 'published'
    and id <> v_batch.id;

  update private.offerpsp_offer_routes r
  set status = 'archived'
  from private.offerpsp_rate_card_batches b
  where r.batch_id = b.id
    and b.provider_id = v_batch.provider_id
    and b.status = 'superseded'
    and r.status = 'published';

  update private.offerpsp_offer_routes
  set status = 'published'
  where batch_id = v_batch.id
    and status in ('draft', 'review');

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

revoke all on function public.publish_offerpsp_rate_card(uuid) from public;
revoke execute on function public.publish_offerpsp_rate_card(uuid) from anon;
grant execute on function public.publish_offerpsp_rate_card(uuid) to authenticated;

comment on function public.publish_offerpsp_rate_card(uuid) is
  'Publishes only active draft/review routes. Archived source routes remain in private history and do not block the valid remainder of a rate card.';
