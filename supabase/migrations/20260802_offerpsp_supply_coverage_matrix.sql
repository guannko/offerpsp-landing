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
          'is_stale', (
            coalesce(p.last_verified_at, b.received_at, r.created_at)
              + make_interval(days => r.freshness_days)
          ) < now(),
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

revoke all on function public.get_offerpsp_supply_coverage() from public, anon;
grant execute on function public.get_offerpsp_supply_coverage() to authenticated;

comment on function public.get_offerpsp_supply_coverage() is
  'Staff-only cross-provider route coverage used by the private supply matrix.';
