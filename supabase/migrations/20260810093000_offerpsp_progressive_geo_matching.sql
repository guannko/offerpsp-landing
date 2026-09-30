create or replace function private.offerpsp_expand_requested_methods(p_values text[])
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  with normalized as (
    select distinct upper(trim(value)) as method
    from unnest(coalesce(p_values, '{}'::text[])) value
    where nullif(trim(value), '') is not null
  ), expanded as (
    select method from normalized
    union all
    select compatible_method
    from normalized
    cross join lateral (
      values
        ('BANK_TRANSFER', 'P2P'),
        ('BANK_TRANSFER', 'C2C'),
        ('BANK_TRANSFER', 'SBP')
    ) compatibility(requested_method, compatible_method)
    where normalized.method = compatibility.requested_method
  )
  select coalesce(array_agg(distinct method order by method), '{}'::text[])
  from expanded;
$$;

revoke all on function private.offerpsp_expand_requested_methods(text[]) from public, anon, authenticated;
grant execute on function private.offerpsp_expand_requested_methods(text[]) to service_role;

comment on function private.offerpsp_expand_requested_methods(text[]) is
  'Expands stable request-side method families for discovery matching without changing the canonical route methods.';

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
  v_match_methods text[];
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
  v_match_methods := private.offerpsp_expand_requested_methods(v_methods);
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

  if cardinality(v_geos) = 0 then
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
      'Target GEO is required',
      'Matching cannot start until at least one target GEO is known.',
      jsonb_build_object('missing_fields', v_missing, 'algorithm_version', 'route-rules-v2'),
      true
    );

    return jsonb_build_object(
      'lead_id', p_lead_id,
      'status', 'needs_clarification',
      'missing_fields', v_missing,
      'match_count', 0,
      'algorithm_version', 'route-rules-v2'
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
      45
      + least(10, p.strategic_priority / 10)
      + 20
      + case when cardinality(v_currencies) > 0 then 5 else 0 end
      + case when cardinality(v_flows) > 0 then 5 else 0 end
      + case when cardinality(v_methods) > 0 then 5 else 0 end
      + case when cardinality(v_traffic) > 0 then 5 else 0 end
      + case when v_vertical is not null then 5 else 0 end
    )::integer,
    'eligible',
    jsonb_build_object(
      'geo', true,
      'currency', case when cardinality(v_currencies) > 0 then true else null end,
      'flow', case when cardinality(v_flows) > 0 then true else null end,
      'method', case when cardinality(v_methods) > 0 then true else null end,
      'traffic', case when cardinality(v_traffic) > 0 then true else null end,
      'vertical', case when v_vertical is not null then true else null end,
      'monthly_volume', case when v_lead.expected_monthly_volume is not null then true else null end,
      'transaction_limits', case
        when v_lead.min_transaction_amount is not null
         and v_lead.max_transaction_amount is not null
         and nullif(trim(v_lead.transaction_currency), '') is not null then true
        else null
      end,
      'missing_fields', to_jsonb(v_missing)
    ),
    to_jsonb(array_remove(array[
      'GEO eligible',
      case when cardinality(v_currencies) > 0 then 'Currency eligible' end,
      case when cardinality(v_flows) > 0 then 'Payment flow eligible' end,
      case when cardinality(v_methods) > 0 then 'Payment method family eligible' end,
      case when cardinality(v_traffic) > 0 then 'Traffic type eligible' end,
      case when v_vertical is not null then 'Vertical eligible' end
    ]::text[], null)),
    to_jsonb(array_remove(array[
      case when cardinality(v_currencies) = 0 then 'Currency was not specified; verify the route currency with the merchant' end,
      case when cardinality(v_flows) = 0 then 'PayIn or PayOut was not specified' end,
      case when cardinality(v_traffic) = 0 then 'Traffic type was not specified' end,
      case when v_lead.expected_monthly_volume is null then 'Monthly volume was not specified' end,
      case when v_lead.min_transaction_amount is null or v_lead.max_transaction_amount is null then 'Transaction limits were not specified' end
    ]::text[], null)),
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
    and exists (
      select 1
      from unnest(v_geos) requested_geo
      where not (requested_geo = any(coalesce(r.blocked_geos, '{}'::text[])))
        and (
          r.coverage_scope = 'global'
          or requested_geo = any(coalesce(r.geos, '{}'::text[]))
        )
    )
    and (cardinality(v_currencies) = 0 or r.currencies && v_currencies)
    and (
      cardinality(v_flows) = 0
      or r.flow = 'both'
      or upper(r.flow) = any(v_flows)
    )
    and (cardinality(v_methods) = 0 or r.methods && v_match_methods)
    and (cardinality(v_traffic) = 0 or r.traffic_types = '{}'::text[] or r.traffic_types && v_traffic)
    and (v_vertical is null or r.verticals = '{}'::text[] or v_vertical = any(r.verticals))
    and (v_vertical is null or not (v_vertical = any(r.prohibited_verticals)))
    and (v_lead.expected_monthly_volume is null or r.min_monthly_volume is null or v_lead.expected_monthly_volume >= r.min_monthly_volume)
    and (v_lead.expected_monthly_volume is null or r.max_monthly_volume is null or v_lead.expected_monthly_volume <= r.max_monthly_volume)
    and (
      v_lead.min_transaction_amount is null
      or v_lead.max_transaction_amount is null
      or nullif(trim(v_lead.transaction_currency), '') is null
      or not exists (
        select 1 from private.offerpsp_offer_limits l
        where l.route_id = r.id and l.scope = 'transaction'
      )
      or exists (
        select 1
        from private.offerpsp_offer_limits l
        where l.route_id = r.id
          and l.scope = 'transaction'
          and l.currency = upper(v_lead.transaction_currency)
          and (cardinality(v_flows) = 0 or l.flow = 'both' or upper(l.flow) = any(v_flows))
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
        when v_match_count > 0 and cardinality(v_missing) > 0 then to_jsonb(v_missing)
        when v_match_count > 0 then '[]'::jsonb
        else jsonb_build_array('No published route matched the known request parameters')
      end
  where lead_id = p_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_type, activity_type, title, body, metadata
  ) values (
    p_lead_id,
    'system',
    'route_matching_completed',
    'Offer-route matching completed',
    format('Published route candidates: %s.', v_match_count),
    jsonb_build_object(
      'match_count', v_match_count,
      'missing_fields', v_missing,
      'progressive_matching', cardinality(v_missing) > 0,
      'algorithm_version', 'route-rules-v2'
    )
  );

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'status', case when v_match_count > 0 then 'shortlist_ready' else 'no_match' end,
    'missing_fields', v_missing,
    'progressive_matching', cardinality(v_missing) > 0,
    'match_count', v_match_count,
    'algorithm_version', 'route-rules-v2'
  );
end;
$$;

revoke all on function private.rebuild_offerpsp_route_matches_internal(uuid) from public, anon, authenticated;
grant execute on function private.rebuild_offerpsp_route_matches_internal(uuid) to service_role;

comment on function private.rebuild_offerpsp_route_matches_internal(uuid) is
  'Progressive route matching: GEO is mandatory; omitted commercial parameters are soft unknowns, while every supplied parameter remains a filter.';
