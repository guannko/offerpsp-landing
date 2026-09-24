-- OfferPSP v5: version-driven lifecycle — projections and guards.
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
          'is_stale', false
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
          'margin_ready', p.margin_included_default or exists (
            select 1
            from private.offerpsp_margin_policies mp
            where mp.provider_id = p.id
              and (mp.route_id is null or mp.route_id = r.id)
              and mp.active
              and mp.effective_from <= now()
              and (mp.effective_to is null or mp.effective_to > now())
          )
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

CREATE OR REPLACE FUNCTION private.offerpsp_validate_route_replacement(
  p_old_route_id uuid,
  p_new_route_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_catalog
AS $$
DECLARE
  v_old private.offerpsp_offer_routes;
  v_new private.offerpsp_offer_routes;
  v_flow_ok boolean;
  v_currency_ok boolean;
  v_geo_ok boolean;
  v_method_ok boolean;
BEGIN
  IF p_old_route_id IS NULL THEN
    RAISE EXCEPTION 'Original route is required for replacement validation'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old
  FROM private.offerpsp_offer_routes
  WHERE id = p_old_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original route not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_new
  FROM private.offerpsp_offer_routes
  WHERE id = p_new_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement route not found'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_new.status <> 'published' THEN
    RAISE EXCEPTION 'Replacement route must be published (current status: %)', v_new.status
      USING ERRCODE = 'P0001';
  END IF;

  v_flow_ok := COALESCE(
    v_old.flow = v_new.flow OR v_new.flow = 'both' OR v_old.flow = 'both',
    false
  );
  v_currency_ok := COALESCE(
    cardinality(v_old.currencies) > 0
    AND cardinality(v_new.currencies) > 0
    AND v_old.currencies && v_new.currencies,
    false
  );
  v_geo_ok := COALESCE(
    v_old.coverage_scope = 'global'
    OR v_new.coverage_scope = 'global'
    OR (
      cardinality(v_old.geos) > 0
      AND cardinality(v_new.geos) > 0
      AND v_old.geos && v_new.geos
    ),
    false
  );
  v_method_ok := COALESCE(
    cardinality(v_old.methods) > 0
    AND cardinality(v_new.methods) > 0
    AND v_old.methods && v_new.methods,
    false
  );

  IF NOT v_flow_ok THEN
    RAISE EXCEPTION 'Incompatible replacement: flow mismatch (old=%, new=%)',
      COALESCE(v_old.flow, 'missing'), COALESCE(v_new.flow, 'missing')
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_currency_ok THEN
    RAISE EXCEPTION 'Incompatible replacement: no currency overlap (old=%, new=%)',
      COALESCE(array_to_string(v_old.currencies, ','), 'missing'),
      COALESCE(array_to_string(v_new.currencies, ','), 'missing')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'compatible', true,
    'flow_match', v_flow_ok,
    'currency_overlap', v_currency_ok,
    'geo_overlap', v_geo_ok,
    'method_overlap', v_method_ok,
    'requires_override', NOT (v_geo_ok AND v_method_ok),
    'old_flow', v_old.flow,
    'new_flow', v_new.flow,
    'old_currencies', to_jsonb(v_old.currencies),
    'new_currencies', to_jsonb(v_new.currencies),
    'old_geos', to_jsonb(v_old.geos),
    'new_geos', to_jsonb(v_new.geos),
    'old_methods', to_jsonb(v_old.methods),
    'new_methods', to_jsonb(v_new.methods)
  );
END;
$$;

