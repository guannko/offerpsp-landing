-- OfferPSP markup is optional.
-- When a provider already includes the commercial interest, its source rate is
-- the client rate. Otherwise, absence of an explicit policy means 0% markup.
-- Publication and matching remain protected by route validation, pricing,
-- dimensions, limits, anomaly and status checks.

create or replace function private.offerpsp_calculate_client_fee(
  p_fee_id uuid,
  p_lead_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_fee private.offerpsp_offer_fee_components;
  v_route private.offerpsp_offer_routes;
  v_provider private.offerpsp_providers;
  v_policy private.offerpsp_margin_policies;
  v_mode text;
  v_client_percent numeric;
  v_client_fixed numeric;
  v_client_currency text;
begin
  select * into v_fee
  from private.offerpsp_offer_fee_components
  where id = p_fee_id;
  if not found then
    raise exception 'OfferPSP fee component not found';
  end if;

  select * into v_route
  from private.offerpsp_offer_routes
  where id = v_fee.route_id;
  select * into v_provider
  from private.offerpsp_providers
  where id = v_route.provider_id;

  select * into v_policy
  from private.offerpsp_margin_policies mp
  where mp.provider_id = v_provider.id
    and mp.active
    and mp.effective_from <= now()
    and (mp.effective_to is null or mp.effective_to > now())
    and (mp.route_id is null or mp.route_id = v_route.id)
    and (mp.merchant_lead_id is null or mp.merchant_lead_id = p_lead_id)
    and (mp.flow = 'all' or mp.flow = v_fee.flow)
  order by
    case when mp.merchant_lead_id = p_lead_id then 4 else 0 end
      + case when mp.route_id = v_route.id then 2 else 0 end
      + case when mp.flow = v_fee.flow then 1 else 0 end desc,
    mp.effective_from desc
  limit 1;

  if v_policy.id is null then
    v_mode := case
      when v_provider.margin_included_default then 'included'
      else 'zero_markup'
    end;
  else
    v_mode := v_policy.mode;
  end if;

  v_client_percent := v_fee.base_percent;
  v_client_fixed := v_fee.base_fixed;
  v_client_currency := coalesce(v_fee.base_fixed_currency, v_policy.fixed_currency);

  if v_mode = 'percentage_points' then
    v_client_percent := coalesce(v_fee.base_percent, 0) + coalesce(v_policy.percent_value, 0);
  elsif v_mode = 'relative_percent' then
    v_client_percent := case when v_fee.base_percent is null then null
      else v_fee.base_percent * (1 + coalesce(v_policy.percent_value, 0) / 100) end;
    v_client_fixed := case when v_fee.base_fixed is null then null
      else v_fee.base_fixed * (1 + coalesce(v_policy.percent_value, 0) / 100) end;
  elsif v_mode = 'fixed' then
    v_client_fixed := coalesce(v_fee.base_fixed, 0) + coalesce(v_policy.fixed_value, 0);
    v_client_currency := coalesce(v_policy.fixed_currency, v_fee.base_fixed_currency);
  elsif v_mode = 'hybrid' then
    v_client_percent := coalesce(v_fee.base_percent, 0) + coalesce(v_policy.percent_value, 0);
    v_client_fixed := coalesce(v_fee.base_fixed, 0) + coalesce(v_policy.fixed_value, 0);
    v_client_currency := coalesce(v_policy.fixed_currency, v_fee.base_fixed_currency);
  elsif v_mode = 'override' then
    v_client_percent := v_policy.override_percent;
    v_client_fixed := v_policy.override_fixed;
    v_client_currency := coalesce(v_policy.fixed_currency, v_fee.base_fixed_currency);
  end if;

  if v_policy.id is not null then
    v_client_percent := round(v_client_percent, v_policy.rounding_scale);
    v_client_fixed := round(v_client_fixed, v_policy.rounding_scale);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'fee_id', v_fee.id,
    'flow', v_fee.flow,
    'traffic_tier', v_fee.traffic_tier,
    'method_scope', v_fee.method_scope,
    'region_scope', v_fee.region_scope,
    'applies_on', v_fee.applies_on,
    'fee_type', v_fee.fee_type,
    'client_percent', v_client_percent,
    'client_fixed', v_client_fixed,
    'client_fixed_currency', v_client_currency,
    'margin_mode', v_mode,
    'status', 'calculated'
  ));
end;
$$;

create or replace function private.offerpsp_calculate_resale_fee(
  p_fee_id uuid,
  p_lead_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_result jsonb;
  v_lead public.offerpsp_leads;
  v_fee private.offerpsp_offer_fee_components;
  v_policy private.offerpsp_agent_margin_policies;
  v_client_percent numeric;
  v_client_fixed numeric;
  v_client_currency text;
begin
  v_result := private.offerpsp_calculate_client_fee(p_fee_id, p_lead_id);
  if v_result ->> 'status' is distinct from 'calculated' then
    return v_result;
  end if;

  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;
  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  if v_lead.agent_organization_id is null then
    return v_result || jsonb_build_object('agent_margin_mode', 'none');
  end if;

  select * into v_fee
  from private.offerpsp_offer_fee_components
  where id = p_fee_id;

  select * into v_policy
  from private.offerpsp_agent_margin_policies amp
  where amp.agent_organization_id = v_lead.agent_organization_id
    and amp.active
    and amp.effective_from <= now()
    and (amp.effective_to is null or amp.effective_to > now())
    and (amp.merchant_organization_id is null or amp.merchant_organization_id = v_lead.merchant_organization_id)
    and (amp.merchant_lead_id is null or amp.merchant_lead_id = p_lead_id)
    and (amp.route_id is null or amp.route_id = v_fee.route_id)
    and (amp.flow = 'all' or amp.flow = v_fee.flow)
  order by
    case when amp.merchant_lead_id = p_lead_id then 8 else 0 end
      + case when amp.merchant_organization_id = v_lead.merchant_organization_id then 4 else 0 end
      + case when amp.route_id = v_fee.route_id then 2 else 0 end
      + case when amp.flow = v_fee.flow then 1 else 0 end desc,
    amp.effective_from desc
  limit 1;

  if v_policy.id is null then
    return v_result || jsonb_build_object('agent_margin_mode', 'none');
  end if;

  v_client_percent := (v_result ->> 'client_percent')::numeric;
  v_client_fixed := (v_result ->> 'client_fixed')::numeric;
  v_client_currency := coalesce(v_result ->> 'client_fixed_currency', v_policy.fixed_currency);

  if v_policy.mode in ('fixed', 'hybrid')
    and v_client_fixed is not null
    and v_client_currency is not null
    and v_policy.fixed_currency is not null
    and upper(v_client_currency) <> upper(v_policy.fixed_currency)
  then
    return (v_result - 'status') || jsonb_build_object(
      'status', 'agent_fixed_currency_mismatch',
      'agent_margin_mode', v_policy.mode
    );
  end if;

  if v_policy.mode = 'percentage_points' then
    v_client_percent := coalesce(v_client_percent, 0) + coalesce(v_policy.percent_value, 0);
  elsif v_policy.mode = 'relative_percent' then
    v_client_percent := case when v_client_percent is null then null
      else v_client_percent * (1 + coalesce(v_policy.percent_value, 0) / 100) end;
    v_client_fixed := case when v_client_fixed is null then null
      else v_client_fixed * (1 + coalesce(v_policy.percent_value, 0) / 100) end;
  elsif v_policy.mode = 'fixed' then
    v_client_fixed := coalesce(v_client_fixed, 0) + coalesce(v_policy.fixed_value, 0);
    v_client_currency := coalesce(v_policy.fixed_currency, v_client_currency);
  elsif v_policy.mode = 'hybrid' then
    v_client_percent := coalesce(v_client_percent, 0) + coalesce(v_policy.percent_value, 0);
    v_client_fixed := coalesce(v_client_fixed, 0) + coalesce(v_policy.fixed_value, 0);
    v_client_currency := coalesce(v_policy.fixed_currency, v_client_currency);
  elsif v_policy.mode = 'override' then
    v_client_percent := v_policy.override_percent;
    v_client_fixed := v_policy.override_fixed;
    v_client_currency := coalesce(v_policy.fixed_currency, v_client_currency);
  end if;

  v_client_percent := round(v_client_percent, v_policy.rounding_scale);
  v_client_fixed := round(v_client_fixed, v_policy.rounding_scale);

  return jsonb_strip_nulls(
    (v_result - 'client_percent' - 'client_fixed' - 'client_fixed_currency' - 'status')
    || jsonb_build_object(
      'client_percent', v_client_percent,
      'client_fixed', v_client_fixed,
      'client_fixed_currency', v_client_currency,
      'agent_margin_mode', v_policy.mode,
      'status', 'calculated'
    )
  );
end;
$$;

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
    if v_open_errors > 0 then raise exception 'Resolve all route errors before resuming'; end if;
    if not exists (select 1 from private.offerpsp_offer_fee_components where route_id = v_before.id) then raise exception 'The route requires a fee before resuming'; end if;
    if (v_before.coverage_scope = 'specific' and cardinality(v_before.geos) = 0)
       or cardinality(v_before.currencies) = 0
       or cardinality(v_before.methods) = 0 then
      raise exception 'The route requires GEO coverage, currency and payment method before resuming';
    end if;
    if v_invalid_limits > 0 then raise exception 'Resolve invalid transaction limits before resuming'; end if;
  end if;

  update private.offerpsp_offer_routes set status = p_status, updated_at = now() where id = p_route_id returning * into v_after;
  insert into private.offerpsp_supply_activities(provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state)
  values (v_after.provider_id, v_after.id, v_after.batch_id, auth.uid(), 'route_status_changed', 'Route status changed to ' || p_status, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'raw_block';
end;
$$;

create or replace function public.get_offerpsp_supply_coverage()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return jsonb_build_object(
    'routes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'route_id', r.id,
          'provider_id', p.id,
          'provider_name', p.brand_name,
          'provider_code', p.internal_code,
          'route_code', r.internal_code,
          'client_title', r.client_title,
          'status', r.status,
          'batch_version', b.batch_version,
          'coverage_scope', r.coverage_scope,
          'geos', r.geos,
          'currencies', r.currencies,
          'methods', r.methods,
          'verticals', r.verticals,
          'risk_segments', r.risk_segments,
          'traffic_types', r.traffic_types,
          'flow', r.flow,
          'is_stale', false,
          'open_error_count', (
            select count(*)
            from private.offerpsp_route_anomalies a
            where a.route_id = r.id
              and a.status = 'open'
              and a.severity = 'error'
          ),
          'open_warning_count', (
            select count(*)
            from private.offerpsp_route_anomalies a
            where a.route_id = r.id
              and a.status = 'open'
              and a.severity = 'warning'
          ),
          'margin_ready', true,
          'margin_configured', p.margin_included_default or exists (
            select 1
            from private.offerpsp_margin_policies mp
            where mp.provider_id = p.id
              and (mp.route_id is null or mp.route_id = r.id)
              and mp.active
              and mp.effective_from <= now()
              and (mp.effective_to is null or mp.effective_to > now())
          ),
          'margin_mode', case
            when p.margin_included_default then 'included'
            when exists (
              select 1
              from private.offerpsp_margin_policies mp
              where mp.provider_id = p.id
                and (mp.route_id is null or mp.route_id = r.id)
                and mp.active
                and mp.effective_from <= now()
                and (mp.effective_to is null or mp.effective_to > now())
            ) then 'configured'
            else 'zero_markup'
          end
        )
        order by
          case r.status when 'published' then 0 when 'paused' then 1 when 'review' then 2 else 3 end,
          p.strategic_priority desc,
          p.brand_name,
          r.client_title
      )
      from private.offerpsp_offer_routes r
      join private.offerpsp_providers p on p.id = r.provider_id
      join private.offerpsp_rate_card_batches b on b.id = r.batch_id
      where r.status in ('published', 'paused', 'review', 'draft')
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

comment on function private.offerpsp_calculate_client_fee(uuid, uuid) is
  'Calculates client pricing. Missing OfferPSP markup means 0%; provider-included pricing is preserved.';

comment on function private.offerpsp_calculate_resale_fee(uuid, uuid) is
  'Calculates reseller pricing. Missing agent markup means 0% and never blocks the offer.';
