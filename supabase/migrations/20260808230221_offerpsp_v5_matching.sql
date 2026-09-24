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
      75
      + least(10, p.strategic_priority / 10)
      + case when r.methods <@ v_methods or v_methods <@ r.methods then 5 else 0 end
      + case when r.traffic_types <@ v_traffic or v_traffic <@ r.traffic_types then 5 else 0 end
      + case when r.integrations = '{}'::text[] then 0 else 5 end
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
    '[]'::jsonb,
    (
      select coalesce(jsonb_agg(private.offerpsp_calculate_client_fee(f.id, p_lead_id)), '[]'::jsonb)
      from private.offerpsp_offer_fee_components f
      where f.route_id = r.id
    ),
    'route-rules-v2'
  from private.offerpsp_offer_routes r
  join private.offerpsp_providers p on p.id = r.provider_id
  where r.status = 'published'
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

create or replace function private.offerpsp_freshness_candidates(p_notify_before_days integer)
returns table (
  provider_id uuid,
  provider_code text,
  provider_name text,
  due_at timestamptz,
  active_route_count integer,
  stale_route_count integer,
  nearest_expiry date,
  contact_name text,
  contact_channel text,
  contact_value text
)
language sql
stable
set search_path = public, private, pg_catalog
as $$
  with route_state as (
    select
      p.id as provider_id,
      p.internal_code as provider_code,
      p.brand_name as provider_name,
      count(r.id)::integer as active_route_count,
      min(r.expires_at) as nearest_expiry,
      min(r.freshness_days) as followup_days,
      coalesce(p.last_verified_at, max(b.received_at), p.created_at) as last_confirmation_at
    from private.offerpsp_providers p
    join private.offerpsp_offer_routes r on r.provider_id = p.id
    join private.offerpsp_rate_card_batches b on b.id = r.batch_id
    where p.relationship_status in ('onboarding', 'active')
      and r.status in ('draft', 'review', 'published', 'paused')
    group by p.id
  )
  select
    rs.provider_id,
    rs.provider_code,
    rs.provider_name,
    rs.last_confirmation_at + make_interval(days => greatest(1, rs.followup_days)),
    rs.active_route_count,
    0::integer,
    rs.nearest_expiry,
    contact.full_name,
    contact.channel,
    contact.value
  from route_state rs
  left join lateral (
    select
      pc.full_name,
      case
        when pc.preferred_channel = 'telegram' and pc.telegram is not null then 'telegram'
        when pc.preferred_channel = 'email' and pc.email is not null then 'email'
        when pc.telegram is not null then 'telegram'
        when pc.email is not null then 'email'
        when pc.phone is not null then 'phone'
        else null
      end as channel,
      case
        when pc.preferred_channel = 'telegram' and pc.telegram is not null then pc.telegram
        when pc.preferred_channel = 'email' and pc.email is not null then pc.email
        when pc.telegram is not null then pc.telegram
        when pc.email is not null then pc.email
        else pc.phone
      end as value
    from private.offerpsp_provider_contacts pc
    where pc.provider_id = rs.provider_id and pc.active
    order by
      (pc.preferred_channel = 'telegram' and pc.telegram is not null) desc,
      (pc.preferred_channel = 'email' and pc.email is not null) desc,
      pc.created_at
    limit 1
  ) contact on true
  where rs.last_confirmation_at + make_interval(days => greatest(1, rs.followup_days))
        <= now() + make_interval(days => greatest(0, p_notify_before_days));
$$;

comment on function public.offerpsp_process_expired_routes() is
  'Compatibility no-op. Offer availability is version- and provider-status-driven, never age-driven.';

comment on function private.offerpsp_freshness_candidates(integer) is
  'Advisory partner follow-up cadence only. It never changes route availability.';
