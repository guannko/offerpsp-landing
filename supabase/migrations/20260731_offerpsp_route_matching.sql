alter table public.offerpsp_leads
  add column if not exists registration_geo text,
  add column if not exists target_geos text[] not null default '{}',
  add column if not exists requested_currencies text[] not null default '{}',
  add column if not exists requested_flows text[] not null default '{}',
  add column if not exists requested_methods text[] not null default '{}',
  add column if not exists traffic_types text[] not null default '{}',
  add column if not exists expected_monthly_volume numeric,
  add column if not exists volume_currency text,
  add column if not exists min_transaction_amount numeric,
  add column if not exists max_transaction_amount numeric,
  add column if not exists transaction_currency text,
  add column if not exists business_model text,
  add column if not exists license_status text,
  add column if not exists license_jurisdiction text,
  add column if not exists license_number text,
  add column if not exists license_evidence_url text,
  add column if not exists launch_timeline text,
  add column if not exists current_processing_setup text,
  add column if not exists qualification_notes text;

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_license_status_check;
alter table public.offerpsp_leads
  add constraint offerpsp_leads_license_status_check
  check (license_status is null or license_status in ('licensed', 'pending', 'unlicensed', 'not_required', 'unknown'));

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_structured_amounts_check;
alter table public.offerpsp_leads
  add constraint offerpsp_leads_structured_amounts_check
  check (
    expected_monthly_volume is null or expected_monthly_volume >= 0
  ) not valid;
alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_transaction_range_check;
alter table public.offerpsp_leads
  add constraint offerpsp_leads_transaction_range_check
  check (
    max_transaction_amount is null
    or min_transaction_amount is null
    or max_transaction_amount >= min_transaction_amount
  ) not valid;

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_status_allowed;
alter table public.offerpsp_leads
  add constraint offerpsp_leads_status_allowed
  check (
    status in (
      'new',
      'reviewing',
      'qualified',
      'matched',
      'closed',
      'spam',
      'qualifying',
      'needs_clarification',
      'matching',
      'shortlist_ready',
      'shared',
      'option_selected',
      'dossier_ready',
      'provider_reviewing',
      'provider_needs_info',
      'provider_accepted',
      'provider_declined',
      'telegram_created',
      'zoom_scheduled',
      'negotiating',
      'won',
      'lost'
    )
  ) not valid;

create table if not exists private.offerpsp_route_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  eligibility text not null
    check (eligibility in ('eligible', 'needs_clarification', 'ineligible')),
  hard_gates jsonb not null default '{}'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  pricing_snapshot jsonb not null default '[]'::jsonb,
  algorithm_version text not null default 'route-rules-v2',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  generated_at timestamptz not null default now(),
  unique (lead_id, route_id, algorithm_version)
);

create index if not exists offerpsp_route_matches_lead_idx
  on private.offerpsp_route_matches (lead_id, score desc);
create index if not exists offerpsp_route_matches_route_idx
  on private.offerpsp_route_matches (route_id, eligibility);

create or replace function private.offerpsp_normalize_text_array(p_values text[])
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    array_agg(distinct upper(trim(value)) order by upper(trim(value)))
      filter (where nullif(trim(value), '') is not null),
    '{}'::text[]
  )
  from unnest(coalesce(p_values, '{}'::text[])) value;
$$;

create or replace function private.offerpsp_extract_geo_codes(p_value text)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  with input as (
    select upper(coalesce(p_value, '')) as value
  ), mapped(code) as (
    select 'UZ' from input where value ~ '(^|[^A-Z])(UZ|UZBEKISTAN)([^A-Z]|$)'
    union all select 'KG' from input where value ~ '(^|[^A-Z])(KG|KYRGYZSTAN|KYRGYZ REPUBLIC)([^A-Z]|$)'
    union all select 'IN' from input where value ~ '(^|[^A-Z])(IN|INDIA)([^A-Z]|$)'
    union all select 'AZ' from input where value ~ '(^|[^A-Z])(AZ|AZERBAIJAN)([^A-Z]|$)'
    union all select 'RU' from input where value ~ '(^|[^A-Z])(RU|RUSSIA|RUSSIAN FEDERATION)([^A-Z]|$)'
    union all select 'AR' from input where value ~ '(^|[^A-Z])(AR|ARGENTINA)([^A-Z]|$)'
    union all select 'KR' from input where value ~ '(^|[^A-Z])(KR|SOUTH KOREA|KOREA)([^A-Z]|$)'
    union all select 'TR' from input where value ~ '(^|[^A-Z])(TR|TURKEY|TURKIYE)([^A-Z]|$)'
    union all select 'PL' from input where value ~ '(^|[^A-Z])(PL|POLAND)([^A-Z]|$)'
    union all select 'AU' from input where value ~ '(^|[^A-Z])(AU|AUSTRALIA)([^A-Z]|$)'
    union all select 'GB' from input where value ~ '(^|[^A-Z])(GB|UK|UNITED KINGDOM)([^A-Z]|$)'
    union all select 'CH' from input where value ~ '(^|[^A-Z])(CH|SWITZERLAND)([^A-Z]|$)'
    union all select 'DE' from input where value ~ '(^|[^A-Z])(DE|GERMANY)([^A-Z]|$)'
    union all select 'EU' from input where value ~ '(^|[^A-Z])(EU|EEA|EUROPE)([^A-Z]|$)'
  )
  select coalesce(array_agg(distinct code order by code), '{}'::text[])
  from mapped;
$$;

create or replace function private.offerpsp_extract_methods(p_value text)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  with input as (
    select upper(coalesce(p_value, '')) as value
  ), mapped(method) as (
    select 'UPI' from input where value like '%UPI%'
    union all select 'IMPS' from input where value like '%IMPS%'
    union all select 'SBP' from input where value like '%SBP%'
    union all select 'P2P' from input where value like '%P2P%'
    union all select 'P2C' from input where value like '%P2C%'
    union all select 'C2C' from input where value like '%C2C%'
    union all select 'QR' from input where value like '%QR%'
    union all select 'CARDS' from input where value ~ '(CARD|VISA|MASTERCARD|MASTER CARD)'
    union all select 'VISA' from input where value like '%VISA%'
    union all select 'MASTERCARD' from input where value ~ '(MASTERCARD|MASTER CARD)'
    union all select 'BANK_TRANSFER' from input where value ~ '(BANK TRANSFER|ACCOUNT TRANSFER|SEPA)'
    union all select 'OPEN_BANKING' from input where value like '%OPEN BANKING%'
    union all select 'DEEPLINK' from input where value ~ '(DEEPLINK|DEEP LINK)'
    union all select 'OCT' from input where value ~ '(^|[^A-Z])OCT([^A-Z]|$)'
  )
  select coalesce(array_agg(distinct method order by method), '{}'::text[])
  from mapped;
$$;

create or replace function private.offerpsp_normalize_vertical(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when upper(coalesce(p_value, '')) ~ '(IGAMING|I-GAMING|CASINO|GAMBLING|BETTING)' then 'IGAMING'
    when upper(coalesce(p_value, '')) ~ '(ECOMMERCE|E-COMMERCE|E-COM|COMMERCE)' then 'ECOMMERCE'
    when upper(coalesce(p_value, '')) ~ '(FOREX|FX)' then 'FOREX'
    when upper(coalesce(p_value, '')) ~ '(CRYPTO|BLOCKCHAIN)' then 'CRYPTO'
    else nullif(upper(trim(p_value)), '')
  end;
$$;

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
    if not v_provider.margin_included_default then
      return jsonb_build_object(
        'fee_id', v_fee.id,
        'flow', v_fee.flow,
        'traffic_tier', v_fee.traffic_tier,
        'status', 'margin_required'
      );
    end if;
    v_mode := 'included';
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

create or replace function private.offerpsp_build_client_route_snapshot(
  p_route_id uuid,
  p_lead_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_route private.offerpsp_offer_routes;
  v_fee_calculations jsonb;
  v_fees jsonb;
  v_limits jsonb;
  v_settlement jsonb;
begin
  select * into v_route
  from private.offerpsp_offer_routes
  where id = p_route_id;
  if not found then
    raise exception 'OfferPSP route not found';
  end if;

  select coalesce(jsonb_agg(
    private.offerpsp_calculate_client_fee(f.id, p_lead_id)
    order by f.flow, f.traffic_tier nulls first, f.created_at
  ), '[]'::jsonb)
  into v_fee_calculations
  from private.offerpsp_offer_fee_components f
  where f.route_id = v_route.id;

  if exists (
    select 1 from jsonb_array_elements(v_fee_calculations) fee
    where fee ->> 'status' is distinct from 'calculated'
  ) then
    raise exception 'Client pricing cannot be calculated for this route';
  end if;

  select coalesce(jsonb_agg(
    fee - 'fee_id' - 'margin_mode' - 'status'
    order by ordinal
  ), '[]'::jsonb)
  into v_fees
  from jsonb_array_elements(v_fee_calculations) with ordinality as calculations(fee, ordinal);

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'flow', l.flow,
    'scope', l.scope,
    'currency', l.currency,
    'minimum_amount', l.minimum_amount,
    'maximum_amount', l.maximum_amount,
    'maximum_count', l.maximum_count,
    'traffic_tier', l.traffic_tier
  )) order by l.flow, l.scope), '[]'::jsonb)
  into v_limits
  from private.offerpsp_offer_limits l
  where l.route_id = v_route.id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'currency', s.currency,
    'period', s.period,
    'fee_percent', s.fee_percent,
    'fixed_fee', s.fixed_fee,
    'fixed_fee_currency', s.fixed_fee_currency,
    'minimum_amount', s.minimum_amount,
    'netting_percent', s.netting_percent
  )) order by s.created_at), '[]'::jsonb)
  into v_settlement
  from private.offerpsp_settlement_terms s
  where s.route_id = v_route.id;

  return jsonb_strip_nulls(jsonb_build_object(
    'title', v_route.client_title,
    'coverage_scope', v_route.coverage_scope,
    'geos', v_route.geos,
    'currencies', v_route.currencies,
    'flow', v_route.flow,
    'methods', v_route.methods,
    'card_brands', v_route.card_brands,
    'traffic_types', v_route.traffic_types,
    'integrations', v_route.integrations,
    'client_fees', v_fees,
    'limits', v_limits,
    'settlement', v_settlement,
    'valid_through', v_route.expires_at,
    'snapshot_created_at', now()
  ));
end;
$$;

create or replace function private.rebuild_offerpsp_route_matches_internal(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead public.offerpsp_leads;
  v_geos text[];
  v_currencies text[];
  v_flows text[];
  v_methods text[];
  v_traffic text[];
  v_vertical text;
  v_missing text[] := '{}';
  v_match_count integer := 0;
begin
  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;
  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  v_geos := private.offerpsp_normalize_text_array(
    case when cardinality(v_lead.target_geos) > 0
      then v_lead.target_geos
      else private.offerpsp_extract_geo_codes(v_lead.geos)
    end
  );
  v_currencies := private.offerpsp_normalize_text_array(v_lead.requested_currencies);
  v_flows := private.offerpsp_normalize_text_array(v_lead.requested_flows);
  v_methods := private.offerpsp_normalize_text_array(
    case when cardinality(v_lead.requested_methods) > 0
      then v_lead.requested_methods
      else private.offerpsp_extract_methods(v_lead.methods)
    end
  );
  v_traffic := private.offerpsp_normalize_text_array(v_lead.traffic_types);
  v_vertical := private.offerpsp_normalize_vertical(v_lead.vertical);

  if nullif(trim(v_lead.company_url), '') is null then v_missing := array_append(v_missing, 'company_url'); end if;
  if cardinality(v_geos) = 0 then v_missing := array_append(v_missing, 'target_geos'); end if;
  if cardinality(v_currencies) = 0 then v_missing := array_append(v_missing, 'requested_currencies'); end if;
  if cardinality(v_flows) = 0 then v_missing := array_append(v_missing, 'requested_flows'); end if;
  if cardinality(v_methods) = 0 then v_missing := array_append(v_missing, 'requested_methods'); end if;
  if cardinality(v_traffic) = 0 then v_missing := array_append(v_missing, 'traffic_types'); end if;
  if v_vertical is null then v_missing := array_append(v_missing, 'vertical'); end if;
  if v_lead.expected_monthly_volume is null then v_missing := array_append(v_missing, 'expected_monthly_volume'); end if;
  if nullif(trim(v_lead.volume_currency), '') is null then v_missing := array_append(v_missing, 'volume_currency'); end if;
  if v_lead.min_transaction_amount is null then v_missing := array_append(v_missing, 'min_transaction_amount'); end if;
  if v_lead.max_transaction_amount is null then v_missing := array_append(v_missing, 'max_transaction_amount'); end if;
  if nullif(trim(v_lead.transaction_currency), '') is null then v_missing := array_append(v_missing, 'transaction_currency'); end if;

  delete from private.offerpsp_route_matches
  where lead_id = p_lead_id
    and algorithm_version = 'route-rules-v2';

  if cardinality(v_missing) > 0 then
    update public.offerpsp_leads
    set status = 'needs_clarification',
        quality_reasons = to_jsonb(v_missing)
    where lead_id = p_lead_id;

    insert into public.offerpsp_lead_activities (
      lead_id, actor_type, activity_type, title, body, metadata, client_visible
    ) values (
      p_lead_id,
      'system',
      'route_matching_needs_clarification',
      'More merchant details are required',
      'Structured request fields are incomplete.',
      jsonb_build_object('missing_fields', v_missing, 'algorithm_version', 'route-rules-v2'),
      true
    );

    return jsonb_build_object(
      'lead_id', p_lead_id,
      'status', 'needs_clarification',
      'missing_fields', v_missing,
      'match_count', 0
    );
  end if;

  insert into private.offerpsp_route_matches (
    lead_id,
    provider_id,
    route_id,
    score,
    eligibility,
    hard_gates,
    strengths,
    risks,
    pricing_snapshot,
    algorithm_version
  )
  select
    p_lead_id,
    r.provider_id,
    r.id,
    least(100,
      65
      + least(10, p.strategic_priority / 10)
      + case when r.expires_at is null or r.expires_at >= current_date + 14 then 5 else 0 end
      + case when r.methods <@ v_methods or v_methods <@ r.methods then 5 else 0 end
      + case when r.traffic_types <@ v_traffic or v_traffic <@ r.traffic_types then 5 else 0 end
      + case when r.integrations = '{}'::text[] then 0 else 5 end
      + case when b.source_effective_date >= current_date - r.freshness_days then 5 else 0 end
    )::integer,
    'eligible',
    jsonb_build_object(
      'geo', true,
      'currency', true,
      'flow', true,
      'method', true,
      'traffic', true,
      'vertical', true,
      'monthly_volume', true,
      'transaction_limits', true
    ),
    to_jsonb(array[
      'GEO eligible',
      'Currency eligible',
      'Payment method eligible',
      'Traffic type eligible',
      'Transaction range eligible'
    ]::text[]),
    to_jsonb(array_remove(array[
      case when b.source_effective_date < current_date - r.freshness_days then 'Offer freshness requires confirmation' end,
      case when r.expires_at is not null and r.expires_at < current_date + 14 then 'Offer expires soon' end
    ]::text[], null)),
    (
      select coalesce(jsonb_agg(private.offerpsp_calculate_client_fee(f.id, p_lead_id)), '[]'::jsonb)
      from private.offerpsp_offer_fee_components f
      where f.route_id = r.id
    ),
    'route-rules-v2'
  from private.offerpsp_offer_routes r
  join private.offerpsp_providers p on p.id = r.provider_id
  join private.offerpsp_rate_card_batches b on b.id = r.batch_id
  where r.status = 'published'
    and b.status = 'published'
    and p.relationship_status = 'active'
    and (r.coverage_scope = 'global' or r.geos && v_geos)
    and not (r.blocked_geos && v_geos)
    and r.currencies && v_currencies
    and (
      r.flow = 'both'
      or upper(r.flow) = any(v_flows)
    )
    and r.methods && v_methods
    and (r.traffic_types = '{}'::text[] or r.traffic_types && v_traffic)
    and (r.verticals = '{}'::text[] or v_vertical = any(r.verticals))
    and not (v_vertical = any(r.prohibited_verticals))
    and (r.min_monthly_volume is null or v_lead.expected_monthly_volume >= r.min_monthly_volume)
    and (r.max_monthly_volume is null or v_lead.expected_monthly_volume <= r.max_monthly_volume)
    and (
      not exists (select 1 from private.offerpsp_offer_limits l where l.route_id = r.id and l.scope = 'transaction')
      or exists (
        select 1
        from private.offerpsp_offer_limits l
        where l.route_id = r.id
          and l.scope = 'transaction'
          and l.currency = upper(v_lead.transaction_currency)
          and (l.flow = 'both' or upper(l.flow) = any(v_flows))
          and (l.minimum_amount is null or l.minimum_amount <= v_lead.min_transaction_amount)
          and (l.maximum_amount is null or l.maximum_amount >= v_lead.max_transaction_amount)
      )
    )
    and not exists (
      select 1
      from private.offerpsp_offer_fee_components f
      where f.route_id = r.id
        and private.offerpsp_calculate_client_fee(f.id, p_lead_id) ->> 'status' <> 'calculated'
    )
  on conflict (lead_id, route_id, algorithm_version)
  do update set
    provider_id = excluded.provider_id,
    score = excluded.score,
    eligibility = excluded.eligibility,
    hard_gates = excluded.hard_gates,
    strengths = excluded.strengths,
    risks = excluded.risks,
    pricing_snapshot = excluded.pricing_snapshot,
    generated_at = now();

  get diagnostics v_match_count = row_count;

  update public.offerpsp_leads
  set status = case when v_match_count > 0 then 'shortlist_ready' else 'qualifying' end,
      quality_reasons = case
        when v_match_count > 0 then '[]'::jsonb
        else jsonb_build_array('No published route passed all hard eligibility gates')
      end
  where lead_id = p_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_type, activity_type, title, body, metadata
  ) values (
    p_lead_id,
    'system',
    'route_matching_completed',
    'Offer-route matching completed',
    format('Eligible published routes: %s.', v_match_count),
    jsonb_build_object('match_count', v_match_count, 'algorithm_version', 'route-rules-v2')
  );

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'status', case when v_match_count > 0 then 'shortlist_ready' else 'no_match' end,
    'match_count', v_match_count,
    'algorithm_version', 'route-rules-v2'
  );
end;
$$;

create or replace function public.rebuild_offerpsp_route_matches(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  return private.rebuild_offerpsp_route_matches_internal(p_lead_id);
end;
$$;

create or replace function public.list_offerpsp_route_matches(p_lead_id uuid)
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

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'match_id', m.id,
      'provider_id', p.id,
      'provider_code', p.internal_code,
      'provider_name', p.brand_name,
      'route_id', r.id,
      'route_code', r.internal_code,
      'client_title', r.client_title,
      'geos', r.geos,
      'currencies', r.currencies,
      'flow', r.flow,
      'methods', r.methods,
      'traffic_types', r.traffic_types,
      'integrations', r.integrations,
      'score', m.score,
      'eligibility', m.eligibility,
      'strengths', m.strengths,
      'risks', m.risks,
      'client_pricing', m.pricing_snapshot,
      'generated_at', m.generated_at
    ) order by m.score desc, p.strategic_priority desc, r.internal_code)
    from private.offerpsp_route_matches m
    join private.offerpsp_providers p on p.id = m.provider_id
    join private.offerpsp_offer_routes r on r.id = m.route_id
    where m.lead_id = p_lead_id
      and m.algorithm_version = 'route-rules-v2'
  ), '[]'::jsonb);
end;
$$;

alter table public.offerpsp_shortlist_items
  alter column psp_id drop not null,
  add column if not exists route_match_id uuid references private.offerpsp_route_matches(id) on delete set null,
  add column if not exists private_provider_id uuid references private.offerpsp_providers(id) on delete restrict,
  add column if not exists offer_route_id uuid references private.offerpsp_offer_routes(id) on delete restrict,
  add column if not exists client_snapshot jsonb,
  add column if not exists client_response text,
  add column if not exists client_responded_at timestamptz;

alter table public.offerpsp_shortlist_items
  drop constraint if exists offerpsp_shortlist_items_client_response_check;
alter table public.offerpsp_shortlist_items
  add constraint offerpsp_shortlist_items_client_response_check
  check (client_response is null or client_response in ('interested', 'need_details', 'not_suitable'));

alter table public.offerpsp_shortlist_items
  drop constraint if exists offerpsp_shortlist_items_source_check;
alter table public.offerpsp_shortlist_items
  add constraint offerpsp_shortlist_items_source_check
  check (
    (psp_id is not null and offer_route_id is null)
    or (psp_id is null and offer_route_id is not null and private_provider_id is not null)
  ) not valid;

create or replace function public.create_offerpsp_route_shortlist(
  p_lead_id uuid,
  p_route_match_ids uuid[],
  p_title text default 'Recommended payment routes',
  p_introduction text default 'These anonymous options passed the current eligibility checks and were reviewed by OfferPSP.'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_shortlist_id uuid;
  v_version integer;
  v_inserted integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if cardinality(p_route_match_ids) is null or cardinality(p_route_match_ids) = 0 then
    raise exception 'Select at least one eligible route match';
  end if;

  perform 1
  from public.offerpsp_leads
  where lead_id = p_lead_id
  for update;
  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  if exists (
    select 1
    from unnest(p_route_match_ids) selected_id
    left join private.offerpsp_route_matches m on m.id = selected_id
    left join private.offerpsp_offer_routes r on r.id = m.route_id
    left join private.offerpsp_rate_card_batches b on b.id = r.batch_id
    left join private.offerpsp_providers p on p.id = m.provider_id
    where m.id is null
      or m.lead_id <> p_lead_id
      or m.eligibility <> 'eligible'
      or r.status <> 'published'
      or b.status <> 'published'
      or p.relationship_status <> 'active'
  ) then
    raise exception 'Every selected route must be a current eligible match for this lead';
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.offerpsp_shortlists
  where lead_id = p_lead_id;

  insert into public.offerpsp_shortlists (
    lead_id, version, title, introduction, status, created_by
  ) values (
    p_lead_id,
    v_version,
    coalesce(nullif(trim(p_title), ''), 'Recommended payment routes'),
    nullif(trim(p_introduction), ''),
    'draft',
    auth.uid()
  ) returning id into v_shortlist_id;

  insert into public.offerpsp_shortlist_items (
    shortlist_id,
    route_match_id,
    private_provider_id,
    offer_route_id,
    psp_id,
    rank,
    client_note,
    client_snapshot
  )
  select
    v_shortlist_id,
    m.id,
    m.provider_id,
    m.route_id,
    null,
    row_number() over (order by m.score desc, p.strategic_priority desc, r.internal_code)::integer,
    'Matched to your structured payment requirements.',
    private.offerpsp_build_client_route_snapshot(m.route_id, p_lead_id)
  from private.offerpsp_route_matches m
  join private.offerpsp_providers p on p.id = m.provider_id
  join private.offerpsp_offer_routes r on r.id = m.route_id
  where m.id = any(p_route_match_ids)
  order by m.score desc, p.strategic_priority desc, r.internal_code;

  get diagnostics v_inserted = row_count;

  update private.offerpsp_route_matches
  set reviewed_by = auth.uid(), reviewed_at = now()
  where id = any(p_route_match_ids);

  return jsonb_build_object(
    'shortlist_id', v_shortlist_id,
    'version', v_version,
    'item_count', v_inserted,
    'status', 'draft'
  );
end;
$$;

drop view if exists public.offerpsp_client_shortlist;
create view public.offerpsp_client_shortlist
with (security_barrier = true)
as
select
  s.id as shortlist_id,
  s.lead_id,
  s.version,
  s.title,
  s.introduction,
  s.status,
  s.shared_at,
  si.rank,
  si.public_code as option_code,
  coalesce(
    nullif(si.client_note, ''),
    'Selected for your operating profile. Detailed partner terms are disclosed during the managed introduction.'
  ) as client_note,
  si.client_response,
  si.client_responded_at,
  si.client_snapshot ->> 'title' as route_title,
  si.client_snapshot -> 'geos' as geos,
  si.client_snapshot -> 'currencies' as currencies,
  si.client_snapshot ->> 'flow' as flow,
  si.client_snapshot -> 'methods' as methods,
  si.client_snapshot -> 'traffic_types' as traffic_types,
  si.client_snapshot -> 'integrations' as integrations,
  si.client_snapshot -> 'client_fees' as client_fees,
  si.client_snapshot -> 'limits' as limits,
  si.client_snapshot -> 'settlement' as settlement,
  si.client_snapshot ->> 'valid_through' as valid_through
from public.offerpsp_shortlists s
join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
join public.offerpsp_leads l on l.lead_id = s.lead_id
where s.status = 'shared'
  and l.client_user_id = auth.uid();

revoke all on public.offerpsp_client_shortlist from public, anon;
grant select on public.offerpsp_client_shortlist to authenticated;

revoke all on function private.offerpsp_normalize_text_array(text[]) from public;
revoke all on function private.offerpsp_extract_geo_codes(text) from public;
revoke all on function private.offerpsp_extract_methods(text) from public;
revoke all on function private.offerpsp_normalize_vertical(text) from public;
revoke all on function private.offerpsp_calculate_client_fee(uuid, uuid) from public;
revoke all on function private.offerpsp_build_client_route_snapshot(uuid, uuid) from public;
revoke all on function private.rebuild_offerpsp_route_matches_internal(uuid) from public;

revoke all on function public.rebuild_offerpsp_route_matches(uuid) from public;
revoke execute on function public.rebuild_offerpsp_route_matches(uuid) from anon;
grant execute on function public.rebuild_offerpsp_route_matches(uuid) to authenticated;

revoke all on function public.list_offerpsp_route_matches(uuid) from public;
revoke execute on function public.list_offerpsp_route_matches(uuid) from anon;
grant execute on function public.list_offerpsp_route_matches(uuid) to authenticated;

revoke all on function public.create_offerpsp_route_shortlist(uuid, uuid[], text, text) from public;
revoke execute on function public.create_offerpsp_route_shortlist(uuid, uuid[], text, text) from anon;
grant execute on function public.create_offerpsp_route_shortlist(uuid, uuid[], text, text) to authenticated;

grant all on private.offerpsp_route_matches to service_role;

comment on table private.offerpsp_route_matches is
  'Internal route-level eligibility results. Provider and route mappings are never exposed through the client projection.';
comment on view public.offerpsp_client_shortlist is
  'Client-safe immutable option snapshots. Provider IDs, source pricing, margins and internal matching data are excluded.';
