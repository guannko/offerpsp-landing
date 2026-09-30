create table if not exists private.offerpsp_supply_activities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  route_id uuid references private.offerpsp_offer_routes(id) on delete set null,
  batch_id uuid references private.offerpsp_rate_card_batches(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  summary text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offerpsp_supply_activities_provider_idx
  on private.offerpsp_supply_activities (provider_id, created_at desc);

create or replace function public.get_offerpsp_supply_workspace(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then
    raise exception 'PSP provider not found';
  end if;

  return jsonb_build_object(
    'provider', (
      select to_jsonb(p) - 'legacy_psp_id' - 'owner_user_id'
      from private.offerpsp_providers p
      where p.id = p_provider_id
    ),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.active desc, c.full_name)
      from private.offerpsp_provider_contacts c
      where c.provider_id = p_provider_id
    ), '[]'::jsonb),
    'margin_policies', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.active desc, mp.created_at desc)
      from private.offerpsp_margin_policies mp
      where mp.provider_id = p_provider_id
    ), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'batch_version', b.batch_version,
        'source_type', b.source_type,
        'source_reference', b.source_reference,
        'source_effective_date', b.source_effective_date,
        'received_at', b.received_at,
        'status', b.status,
        'parser_version', b.parser_version,
        'published_at', b.published_at,
        'route_count', (select count(*) from private.offerpsp_offer_routes r where r.batch_id = b.id),
        'open_error_count', (select count(*) from private.offerpsp_route_anomalies a where a.batch_id = b.id and a.status = 'open' and a.severity = 'error'),
        'open_warning_count', (select count(*) from private.offerpsp_route_anomalies a where a.batch_id = b.id and a.status = 'open' and a.severity = 'warning')
      ) order by b.batch_version desc)
      from private.offerpsp_rate_card_batches b
      where b.provider_id = p_provider_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(
        (to_jsonb(r) - 'raw_block') || jsonb_build_object(
          'batch_version', b.batch_version,
          'batch_status', b.status,
          'fees', coalesce((select jsonb_agg(to_jsonb(f) order by f.flow, f.created_at) from private.offerpsp_offer_fee_components f where f.route_id = r.id), '[]'::jsonb),
          'limits', coalesce((select jsonb_agg(to_jsonb(l) order by l.flow, l.currency, l.created_at) from private.offerpsp_offer_limits l where l.route_id = r.id), '[]'::jsonb),
          'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from private.offerpsp_settlement_terms s where s.route_id = r.id), '[]'::jsonb),
          'anomalies', coalesce((select jsonb_agg(to_jsonb(a) order by case a.severity when 'error' then 0 when 'warning' then 1 else 2 end, a.created_at) from private.offerpsp_route_anomalies a where a.route_id = r.id), '[]'::jsonb),
          'open_error_count', (select count(*) from private.offerpsp_route_anomalies a where a.route_id = r.id and a.status = 'open' and a.severity = 'error'),
          'open_warning_count', (select count(*) from private.offerpsp_route_anomalies a where a.route_id = r.id and a.status = 'open' and a.severity = 'warning'),
          'is_stale', (
            (r.expires_at is not null and r.expires_at < current_date)
            or not exists (
              select 1 from private.offerpsp_providers pv
              where pv.id = r.provider_id
                and pv.last_verified_at is not null
                and pv.last_verified_at + make_interval(days => r.freshness_days) >= now()
            )
          )
        ) order by b.batch_version desc, r.internal_code
      )
      from private.offerpsp_offer_routes r
      join private.offerpsp_rate_card_batches b on b.id = r.batch_id
      where r.provider_id = p_provider_id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select * from private.offerpsp_supply_activities
        where provider_id = p_provider_id
        order by created_at desc
        limit 100
      ) a
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_offerpsp_provider(
  p_provider_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_providers;
  v_after private.offerpsp_providers;
  v_status text;
  v_priority integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Provider payload must be an object';
  end if;

  select * into v_before from private.offerpsp_providers where id = p_provider_id for update;
  if not found then raise exception 'PSP provider not found'; end if;

  v_status := coalesce(nullif(trim(p_payload ->> 'relationship_status'), ''), v_before.relationship_status);
  if v_status not in ('prospect', 'onboarding', 'active', 'paused', 'archived') then
    raise exception 'Unsupported provider relationship status';
  end if;
  v_priority := coalesce(private.offerpsp_jsonb_numeric(p_payload, 'strategic_priority')::integer, v_before.strategic_priority);
  if v_priority not between 0 and 100 then raise exception 'Strategic priority must be between 0 and 100'; end if;

  update private.offerpsp_providers
  set brand_name = coalesce(nullif(trim(p_payload ->> 'brand_name'), ''), brand_name),
      legal_name = case when p_payload ? 'legal_name' then nullif(trim(p_payload ->> 'legal_name'), '') else legal_name end,
      website = case when p_payload ? 'website' then nullif(trim(p_payload ->> 'website'), '') else website end,
      relationship_status = v_status,
      strategic_priority = v_priority,
      margin_included_default = coalesce((p_payload ->> 'margin_included_default')::boolean, margin_included_default),
      relationship_notes = case when p_payload ? 'relationship_notes' then nullif(trim(p_payload ->> 'relationship_notes'), '') else relationship_notes end,
      updated_at = now()
  where id = p_provider_id
  returning * into v_after;

  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, before_state, after_state)
  values (p_provider_id, auth.uid(), 'provider_updated', 'PSP profile updated', to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'legacy_psp_id' - 'owner_user_id';
end;
$$;

create or replace function public.save_offerpsp_provider_contact(
  p_provider_id uuid,
  p_contact_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_provider_contacts;
  v_after private.offerpsp_provider_contacts;
  v_channel text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then raise exception 'PSP provider not found'; end if;
  if nullif(trim(p_payload ->> 'full_name'), '') is null then raise exception 'Contact name is required'; end if;
  if nullif(trim(p_payload ->> 'telegram'), '') is null
     and nullif(trim(p_payload ->> 'email'), '') is null
     and nullif(trim(p_payload ->> 'phone'), '') is null then
    raise exception 'At least one contact channel is required';
  end if;
  v_channel := nullif(trim(p_payload ->> 'preferred_channel'), '');
  if v_channel is not null and v_channel not in ('telegram', 'email', 'phone', 'other') then raise exception 'Unsupported preferred channel'; end if;

  if p_contact_id is not null then
    select * into v_before from private.offerpsp_provider_contacts where id = p_contact_id and provider_id = p_provider_id for update;
    if not found then raise exception 'PSP contact not found'; end if;
    update private.offerpsp_provider_contacts
    set full_name = trim(p_payload ->> 'full_name'),
        role_title = nullif(trim(p_payload ->> 'role_title'), ''),
        region = nullif(trim(p_payload ->> 'region'), ''),
        telegram = nullif(trim(p_payload ->> 'telegram'), ''),
        email = nullif(trim(p_payload ->> 'email'), ''),
        phone = nullif(trim(p_payload ->> 'phone'), ''),
        timezone = nullif(trim(p_payload ->> 'timezone'), ''),
        preferred_channel = v_channel,
        active = coalesce((p_payload ->> 'active')::boolean, true),
        notes = nullif(trim(p_payload ->> 'notes'), ''),
        updated_at = now()
    where id = p_contact_id
    returning * into v_after;
  else
    insert into private.offerpsp_provider_contacts(provider_id, full_name, role_title, region, telegram, email, phone, timezone, preferred_channel, active, notes)
    values (p_provider_id, trim(p_payload ->> 'full_name'), nullif(trim(p_payload ->> 'role_title'), ''), nullif(trim(p_payload ->> 'region'), ''), nullif(trim(p_payload ->> 'telegram'), ''), nullif(trim(p_payload ->> 'email'), ''), nullif(trim(p_payload ->> 'phone'), ''), nullif(trim(p_payload ->> 'timezone'), ''), v_channel, coalesce((p_payload ->> 'active')::boolean, true), nullif(trim(p_payload ->> 'notes'), ''))
    returning * into v_after;
  end if;

  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, before_state, after_state)
  values (p_provider_id, auth.uid(), case when p_contact_id is null then 'contact_created' else 'contact_updated' end, 'PSP contact saved', case when p_contact_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.save_offerpsp_route(
  p_route_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_offer_routes;
  v_after private.offerpsp_offer_routes;
  v_item jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Route payload must be an object'; end if;
  select * into v_before from private.offerpsp_offer_routes where id = p_route_id for update;
  if not found then raise exception 'OfferPSP route not found'; end if;
  if v_before.status in ('published', 'paused') then raise exception 'Pause and return a published route to review before editing'; end if;
  if coalesce(nullif(trim(p_payload ->> 'flow'), ''), v_before.flow) not in ('payin', 'payout', 'both') then raise exception 'Unsupported route flow'; end if;
  if coalesce(nullif(trim(p_payload ->> 'coverage_scope'), ''), v_before.coverage_scope) not in ('specific', 'regional', 'global') then raise exception 'Unsupported coverage scope'; end if;

  update private.offerpsp_offer_routes
  set client_title = coalesce(nullif(trim(p_payload ->> 'client_title'), ''), client_title),
      coverage_scope = coalesce(nullif(trim(p_payload ->> 'coverage_scope'), ''), coverage_scope),
      geos = case when p_payload ? 'geos' then private.offerpsp_jsonb_text_array(p_payload -> 'geos') else geos end,
      blocked_geos = case when p_payload ? 'blocked_geos' then private.offerpsp_jsonb_text_array(p_payload -> 'blocked_geos') else blocked_geos end,
      currencies = case when p_payload ? 'currencies' then private.offerpsp_jsonb_text_array(p_payload -> 'currencies') else currencies end,
      flow = coalesce(nullif(trim(p_payload ->> 'flow'), ''), flow),
      methods = case when p_payload ? 'methods' then private.offerpsp_jsonb_text_array(p_payload -> 'methods') else methods end,
      traffic_types = case when p_payload ? 'traffic_types' then private.offerpsp_jsonb_text_array(p_payload -> 'traffic_types') else traffic_types end,
      verticals = case when p_payload ? 'verticals' then private.offerpsp_jsonb_text_array(p_payload -> 'verticals') else verticals end,
      integrations = case when p_payload ? 'integrations' then private.offerpsp_jsonb_text_array(p_payload -> 'integrations') else integrations end,
      niche_key = case when p_payload ? 'niche_key' then nullif(trim(p_payload ->> 'niche_key'), '') else niche_key end,
      effective_from = case when p_payload ? 'effective_from' then nullif(trim(p_payload ->> 'effective_from'), '')::date else effective_from end,
      expires_at = case when p_payload ? 'expires_at' then nullif(trim(p_payload ->> 'expires_at'), '')::date else expires_at end,
      freshness_days = coalesce(private.offerpsp_jsonb_numeric(p_payload, 'freshness_days')::integer, freshness_days),
      min_monthly_volume = case when p_payload ? 'min_monthly_volume' then private.offerpsp_jsonb_numeric(p_payload, 'min_monthly_volume') else min_monthly_volume end,
      max_monthly_volume = case when p_payload ? 'max_monthly_volume' then private.offerpsp_jsonb_numeric(p_payload, 'max_monthly_volume') else max_monthly_volume end,
      volume_currency = case when p_payload ? 'volume_currency' then nullif(upper(trim(p_payload ->> 'volume_currency')), '') else volume_currency end,
      operational_notes = case when p_payload ? 'operational_notes' then nullif(trim(p_payload ->> 'operational_notes'), '') else operational_notes end,
      status = case when status = 'draft' then 'review' else status end,
      updated_at = now()
  where id = p_route_id
  returning * into v_after;

  if p_payload ? 'fees' then
    delete from private.offerpsp_offer_fee_components where route_id = p_route_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'fees', '[]'::jsonb)) loop
      insert into private.offerpsp_offer_fee_components(route_id, flow, traffic_tier, method_scope, region_scope, fee_type, base_percent, base_fixed, base_fixed_currency, applies_on, minimum_fee, maximum_fee, source_text)
      values (p_route_id, coalesce(nullif(lower(trim(v_item ->> 'flow')), ''), v_after.flow), nullif(trim(v_item ->> 'traffic_tier'), ''), private.offerpsp_jsonb_text_array(v_item -> 'method_scope'), private.offerpsp_jsonb_text_array(v_item -> 'region_scope'), coalesce(nullif(lower(trim(v_item ->> 'fee_type')), ''), 'percent'), private.offerpsp_jsonb_numeric(v_item, 'base_percent'), private.offerpsp_jsonb_numeric(v_item, 'base_fixed'), nullif(upper(trim(v_item ->> 'base_fixed_currency')), ''), coalesce(nullif(lower(trim(v_item ->> 'applies_on')), ''), 'success'), private.offerpsp_jsonb_numeric(v_item, 'minimum_fee'), private.offerpsp_jsonb_numeric(v_item, 'maximum_fee'), nullif(v_item ->> 'source_text', ''));
    end loop;
  end if;

  if p_payload ? 'limits' then
    delete from private.offerpsp_offer_limits where route_id = p_route_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'limits', '[]'::jsonb)) loop
      insert into private.offerpsp_offer_limits(route_id, flow, scope, method_scope, traffic_tier, currency, minimum_amount, maximum_amount, maximum_count, original_note)
      values (p_route_id, coalesce(nullif(lower(trim(v_item ->> 'flow')), ''), v_after.flow), coalesce(nullif(lower(trim(v_item ->> 'scope')), ''), 'transaction'), private.offerpsp_jsonb_text_array(v_item -> 'method_scope'), nullif(trim(v_item ->> 'traffic_tier'), ''), upper(trim(v_item ->> 'currency')), private.offerpsp_jsonb_numeric(v_item, 'minimum_amount'), private.offerpsp_jsonb_numeric(v_item, 'maximum_amount'), private.offerpsp_jsonb_numeric(v_item, 'maximum_count')::integer, nullif(v_item ->> 'original_note', ''));
    end loop;
  end if;

  if p_payload ? 'settlements' then
    delete from private.offerpsp_settlement_terms where route_id = p_route_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'settlements', '[]'::jsonb)) loop
      insert into private.offerpsp_settlement_terms(route_id, currency, fee_percent, fixed_fee, fixed_fee_currency, period, minimum_amount, exchange_source, exchange_rule, weekdays, netting_percent, liquidity_requirement, original_note)
      values (p_route_id, nullif(upper(trim(v_item ->> 'currency')), ''), private.offerpsp_jsonb_numeric(v_item, 'fee_percent'), private.offerpsp_jsonb_numeric(v_item, 'fixed_fee'), nullif(upper(trim(v_item ->> 'fixed_fee_currency')), ''), nullif(trim(v_item ->> 'period'), ''), private.offerpsp_jsonb_numeric(v_item, 'minimum_amount'), nullif(trim(v_item ->> 'exchange_source'), ''), nullif(trim(v_item ->> 'exchange_rule'), ''), private.offerpsp_jsonb_text_array(v_item -> 'weekdays'), private.offerpsp_jsonb_numeric(v_item, 'netting_percent'), nullif(trim(v_item ->> 'liquidity_requirement'), ''), nullif(v_item ->> 'original_note', ''));
    end loop;
  end if;

  insert into private.offerpsp_supply_activities(provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state)
  values (v_after.provider_id, v_after.id, v_after.batch_id, auth.uid(), 'route_updated', 'Normalized route updated', to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'raw_block';
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
    if v_before.expires_at is not null and v_before.expires_at < current_date then raise exception 'An expired route cannot be resumed'; end if;
    if v_provider.last_verified_at is null
       or v_provider.last_verified_at + make_interval(days => v_before.freshness_days) < now() then
      raise exception 'Confirm current PSP terms before resuming';
    end if;
    if not v_margin_ready then raise exception 'A current margin policy is required before resuming'; end if;
  end if;

  update private.offerpsp_offer_routes set status = p_status, updated_at = now() where id = p_route_id returning * into v_after;
  insert into private.offerpsp_supply_activities(provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state)
  values (v_after.provider_id, v_after.id, v_after.batch_id, auth.uid(), 'route_status_changed', 'Route status changed to ' || p_status, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'raw_block';
end;
$$;

create or replace function public.resolve_offerpsp_route_anomaly(
  p_anomaly_id uuid,
  p_status text,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_route_anomalies;
  v_after private.offerpsp_route_anomalies;
  v_provider_id uuid;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('open', 'accepted', 'resolved', 'ignored') then raise exception 'Unsupported anomaly status'; end if;
  if p_status <> 'open' and nullif(trim(p_resolution_note), '') is null then raise exception 'Resolution note is required'; end if;
  select * into v_before from private.offerpsp_route_anomalies where id = p_anomaly_id for update;
  if not found then raise exception 'Route anomaly not found'; end if;
  select provider_id into v_provider_id from private.offerpsp_offer_routes where id = v_before.route_id;
  if v_provider_id is null then select provider_id into v_provider_id from private.offerpsp_rate_card_batches where id = v_before.batch_id; end if;
  update private.offerpsp_route_anomalies
  set status = p_status,
      resolution_note = case when p_status = 'open' then null else trim(p_resolution_note) end,
      resolved_by = case when p_status = 'open' then null else auth.uid() end,
      resolved_at = case when p_status = 'open' then null else now() end
  where id = p_anomaly_id returning * into v_after;
  insert into private.offerpsp_supply_activities(provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state)
  values (v_provider_id, v_after.route_id, v_after.batch_id, auth.uid(), 'anomaly_' || p_status, 'Route anomaly marked ' || p_status, to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.set_offerpsp_margin_policy(
  p_provider_id uuid,
  p_route_id uuid,
  p_flow text,
  p_mode text,
  p_percent_value numeric,
  p_fixed_value numeric,
  p_fixed_currency text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_policy private.offerpsp_margin_policies;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then raise exception 'PSP provider not found'; end if;
  if p_route_id is not null and not exists (select 1 from private.offerpsp_offer_routes where id = p_route_id and provider_id = p_provider_id) then raise exception 'Route does not belong to this PSP'; end if;
  if p_flow not in ('all', 'payin', 'payout', 'settlement', 'refund', 'chargeback') then raise exception 'Unsupported margin flow'; end if;
  if p_mode not in ('included', 'percentage_points', 'relative_percent', 'fixed', 'hybrid', 'override') then raise exception 'Unsupported margin mode'; end if;
  if p_mode not in ('included', 'override') and p_percent_value is null and p_fixed_value is null then raise exception 'Margin value is required'; end if;
  if p_fixed_value is not null and nullif(upper(trim(p_fixed_currency)), '') is null then raise exception 'Fixed margin currency is required'; end if;

  update private.offerpsp_margin_policies
  set active = false, effective_to = now(), updated_at = now()
  where provider_id = p_provider_id
    and route_id is not distinct from p_route_id
    and merchant_lead_id is null
    and flow = p_flow
    and active;

  insert into private.offerpsp_margin_policies(provider_id, route_id, scope, flow, mode, percent_value, fixed_value, fixed_currency, notes, created_by)
  values (p_provider_id, p_route_id, case when p_route_id is null then 'provider' else 'route' end, p_flow, p_mode, p_percent_value, p_fixed_value, nullif(upper(trim(p_fixed_currency)), ''), nullif(trim(p_notes), ''), auth.uid())
  returning * into v_policy;

  insert into private.offerpsp_supply_activities(provider_id, route_id, actor_user_id, action_type, summary, after_state)
  values (p_provider_id, p_route_id, auth.uid(), 'margin_policy_created', 'Margin policy created', to_jsonb(v_policy));
  return to_jsonb(v_policy);
end;
$$;

create or replace function public.confirm_offerpsp_provider_freshness(p_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_provider private.offerpsp_providers;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  update private.offerpsp_providers set last_verified_at = now(), updated_at = now() where id = p_provider_id returning * into v_provider;
  if not found then raise exception 'PSP provider not found'; end if;
  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, after_state)
  values (p_provider_id, auth.uid(), 'freshness_confirmed', 'PSP offer terms confirmed as current', to_jsonb(v_provider));
  return to_jsonb(v_provider) - 'legacy_psp_id' - 'owner_user_id';
end;
$$;

revoke all on private.offerpsp_supply_activities from public, anon, authenticated;
grant all on private.offerpsp_supply_activities to service_role;

revoke all on function public.get_offerpsp_supply_workspace(uuid) from public, anon;
revoke all on function public.save_offerpsp_provider(uuid, jsonb) from public, anon;
revoke all on function public.save_offerpsp_provider_contact(uuid, uuid, jsonb) from public, anon;
revoke all on function public.save_offerpsp_route(uuid, jsonb) from public, anon;
revoke all on function public.set_offerpsp_route_status(uuid, text) from public, anon;
revoke all on function public.resolve_offerpsp_route_anomaly(uuid, text, text) from public, anon;
revoke all on function public.set_offerpsp_margin_policy(uuid, uuid, text, text, numeric, numeric, text, text) from public, anon;
revoke all on function public.confirm_offerpsp_provider_freshness(uuid) from public, anon;

grant execute on function public.get_offerpsp_supply_workspace(uuid) to authenticated;
grant execute on function public.save_offerpsp_provider(uuid, jsonb) to authenticated;
grant execute on function public.save_offerpsp_provider_contact(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_offerpsp_route(uuid, jsonb) to authenticated;
grant execute on function public.set_offerpsp_route_status(uuid, text) to authenticated;
grant execute on function public.resolve_offerpsp_route_anomaly(uuid, text, text) to authenticated;
grant execute on function public.set_offerpsp_margin_policy(uuid, uuid, text, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.confirm_offerpsp_provider_freshness(uuid) to authenticated;

comment on table private.offerpsp_supply_activities is
  'Immutable staff audit log for provider, normalized route, anomaly, margin and freshness operations.';
