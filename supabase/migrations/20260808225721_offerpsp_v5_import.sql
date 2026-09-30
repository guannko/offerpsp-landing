create or replace function public.import_offerpsp_rate_card(
  p_provider_code text,
  p_source_type text,
  p_source_text text,
  p_source_reference text default null,
  p_source_effective_date date default null,
  p_parser_version text default 'manual-v1',
  p_parser_metadata jsonb default '{}'::jsonb,
  p_routes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_provider private.offerpsp_providers;
  v_batch private.offerpsp_rate_card_batches;
  v_existing_batch_id uuid;
  v_ingestion_job_id text := nullif(trim(coalesce(p_parser_metadata, '{}'::jsonb) ->> 'ingestion_job_id'), '');
  v_previous_route_id uuid;
  v_batch_version integer;
  v_parser_version text := coalesce(nullif(trim(p_parser_version), ''), 'manual-v1');
  v_route_input jsonb;
  v_route private.offerpsp_offer_routes;
  v_component jsonb;
  v_anomaly jsonb;
  v_route_count integer := 0;
  v_anomaly_count integer := 0;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if nullif(trim(p_source_text), '') is null then
    raise exception 'Rate-card source text is required';
  end if;

  if jsonb_typeof(coalesce(p_routes, '[]'::jsonb)) <> 'array' then
    raise exception 'Routes payload must be a JSON array';
  end if;

  select *
  into v_provider
  from private.offerpsp_providers
  where internal_code = p_provider_code
  for update;

  if not found then
    raise exception 'OfferPSP provider not found';
  end if;

  -- Idempotency belongs to one intake event, not to the commercial text.
  -- The same terms received later are a new confirmed version.
  if v_ingestion_job_id is not null then
    select id
    into v_existing_batch_id
    from private.offerpsp_rate_card_batches
    where provider_id = v_provider.id
      and parser_metadata ->> 'ingestion_job_id' = v_ingestion_job_id
    order by received_at desc
    limit 1;

    if v_existing_batch_id is not null then
      return jsonb_build_object(
        'batch_id', v_existing_batch_id,
        'duplicate', true,
        'provider_code', v_provider.internal_code
      );
    end if;
  end if;

  select coalesce(max(batch_version), 0) + 1
  into v_batch_version
  from private.offerpsp_rate_card_batches
  where provider_id = v_provider.id;

  insert into private.offerpsp_rate_card_batches (
    provider_id,
    batch_version,
    source_type,
    source_reference,
    source_text,
    source_effective_date,
    parser_version,
    parser_metadata,
    created_by
  )
  values (
    v_provider.id,
    v_batch_version,
    p_source_type,
    nullif(trim(p_source_reference), ''),
    p_source_text,
    p_source_effective_date,
    v_parser_version,
    coalesce(p_parser_metadata, '{}'::jsonb),
    auth.uid()
  )
  returning * into v_batch;

  update private.offerpsp_rate_card_batches
  set status = 'superseded',
      superseded_at = now()
  where provider_id = v_provider.id
    and id <> v_batch.id
    and status in ('draft', 'review');

  update private.offerpsp_offer_routes r
  set status = 'archived',
      updated_at = now()
  from private.offerpsp_rate_card_batches b
  where r.batch_id = b.id
    and b.provider_id = v_provider.id
    and b.status = 'superseded'
    and r.status in ('draft', 'review');

  for v_route_input in
    select value from jsonb_array_elements(coalesce(p_routes, '[]'::jsonb))
  loop
    insert into private.offerpsp_offer_routes (
      provider_id,
      batch_id,
      client_title,
      coverage_scope,
      geos,
      blocked_geos,
      currencies,
      flow,
      methods,
      card_brands,
      traffic_types,
      verticals,
      prohibited_verticals,
      integrations,
      niche_key,
      effective_from,
      expires_at,
      freshness_days,
      min_monthly_volume,
      max_monthly_volume,
      volume_currency,
      risk_terms,
      operational_notes,
      raw_block
    )
    values (
      v_provider.id,
      v_batch.id,
      coalesce(nullif(trim(v_route_input ->> 'client_title'), ''), 'Payment route'),
      coalesce(nullif(lower(trim(v_route_input ->> 'coverage_scope')), ''), 'specific'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'geos'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'blocked_geos'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'currencies'),
      coalesce(nullif(lower(trim(v_route_input ->> 'flow')), ''), 'both'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'methods'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'card_brands'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'traffic_types'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'verticals'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'prohibited_verticals'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'integrations'),
      nullif(upper(trim(v_route_input ->> 'niche_key')), ''),
      nullif(v_route_input ->> 'effective_from', '')::date,
      nullif(v_route_input ->> 'expires_at', '')::date,
      coalesce(private.offerpsp_jsonb_numeric(v_route_input, 'freshness_days')::integer, 30),
      private.offerpsp_jsonb_numeric(v_route_input, 'min_monthly_volume'),
      private.offerpsp_jsonb_numeric(v_route_input, 'max_monthly_volume'),
      nullif(upper(trim(v_route_input ->> 'volume_currency')), ''),
      coalesce(v_route_input -> 'risk_terms', '{}'::jsonb),
      nullif(trim(v_route_input ->> 'operational_notes'), ''),
      nullif(v_route_input ->> 'raw_block', '')
    )
    returning * into v_route;

    -- Link this version to the previous commercial route. niche_key is the
    -- strongest identity; exact dimensions are a safe fallback.
    select previous.id
    into v_previous_route_id
    from private.offerpsp_offer_routes previous
    where previous.provider_id = v_provider.id
      and previous.id <> v_route.id
      and previous.batch_id <> v_batch.id
      and previous.status in ('published', 'paused', 'archived')
      and (
        (v_route.niche_key is not null and previous.niche_key = v_route.niche_key)
        or (
          v_route.niche_key is null
          and previous.client_title = v_route.client_title
          and previous.coverage_scope = v_route.coverage_scope
          and previous.geos = v_route.geos
          and previous.currencies = v_route.currencies
          and previous.flow = v_route.flow
          and previous.methods = v_route.methods
          and previous.traffic_types = v_route.traffic_types
          and previous.verticals = v_route.verticals
        )
      )
    order by
      case previous.status when 'published' then 0 when 'paused' then 1 else 2 end,
      previous.created_at desc
    limit 1;

    if v_previous_route_id is not null then
      update private.offerpsp_offer_routes
      set revision_of_route_id = v_previous_route_id
      where id = v_route.id;
      v_route.revision_of_route_id := v_previous_route_id;
    end if;

    v_route_count := v_route_count + 1;

    for v_component in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'fees', '[]'::jsonb))
    loop
      insert into private.offerpsp_offer_fee_components (
        route_id,
        flow,
        traffic_tier,
        method_scope,
        region_scope,
        fee_type,
        base_percent,
        base_fixed,
        base_fixed_currency,
        applies_on,
        minimum_fee,
        maximum_fee,
        source_text
      )
      values (
        v_route.id,
        lower(v_component ->> 'flow'),
        nullif(upper(trim(v_component ->> 'traffic_tier')), ''),
        private.offerpsp_jsonb_text_array(v_component -> 'method_scope'),
        private.offerpsp_jsonb_text_array(v_component -> 'region_scope'),
        coalesce(nullif(lower(trim(v_component ->> 'fee_type')), ''), 'percent'),
        private.offerpsp_jsonb_numeric(v_component, 'base_percent'),
        private.offerpsp_jsonb_numeric(v_component, 'base_fixed'),
        nullif(upper(trim(v_component ->> 'base_fixed_currency')), ''),
        coalesce(nullif(lower(trim(v_component ->> 'applies_on')), ''), 'success'),
        private.offerpsp_jsonb_numeric(v_component, 'minimum_fee'),
        private.offerpsp_jsonb_numeric(v_component, 'maximum_fee'),
        nullif(v_component ->> 'source_text', '')
      );
    end loop;

    for v_component in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'limits', '[]'::jsonb))
    loop
      insert into private.offerpsp_offer_limits (
        route_id,
        flow,
        scope,
        method_scope,
        traffic_tier,
        currency,
        minimum_amount,
        maximum_amount,
        maximum_count,
        original_note
      )
      values (
        v_route.id,
        coalesce(nullif(lower(trim(v_component ->> 'flow')), ''), v_route.flow),
        coalesce(nullif(lower(trim(v_component ->> 'scope')), ''), 'transaction'),
        private.offerpsp_jsonb_text_array(v_component -> 'method_scope'),
        nullif(upper(trim(v_component ->> 'traffic_tier')), ''),
        upper(v_component ->> 'currency'),
        private.offerpsp_jsonb_numeric(v_component, 'minimum_amount'),
        private.offerpsp_jsonb_numeric(v_component, 'maximum_amount'),
        private.offerpsp_jsonb_numeric(v_component, 'maximum_count')::integer,
        nullif(v_component ->> 'original_note', '')
      );
    end loop;

    for v_component in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'settlement', '[]'::jsonb))
    loop
      insert into private.offerpsp_settlement_terms (
        route_id,
        currency,
        fee_percent,
        fixed_fee,
        fixed_fee_currency,
        period,
        minimum_amount,
        exchange_source,
        exchange_rule,
        weekdays,
        netting_percent,
        liquidity_requirement,
        original_note
      )
      values (
        v_route.id,
        nullif(upper(trim(v_component ->> 'currency')), ''),
        private.offerpsp_jsonb_numeric(v_component, 'fee_percent'),
        private.offerpsp_jsonb_numeric(v_component, 'fixed_fee'),
        nullif(upper(trim(v_component ->> 'fixed_fee_currency')), ''),
        nullif(upper(trim(v_component ->> 'period')), ''),
        private.offerpsp_jsonb_numeric(v_component, 'minimum_amount'),
        nullif(trim(v_component ->> 'exchange_source'), ''),
        nullif(trim(v_component ->> 'exchange_rule'), ''),
        private.offerpsp_jsonb_text_array(v_component -> 'weekdays'),
        private.offerpsp_jsonb_numeric(v_component, 'netting_percent'),
        nullif(trim(v_component ->> 'liquidity_requirement'), ''),
        nullif(v_component ->> 'original_note', '')
      );
    end loop;

    for v_anomaly in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'anomalies', '[]'::jsonb))
    loop
      insert into private.offerpsp_route_anomalies (
        batch_id,
        route_id,
        anomaly_code,
        severity,
        field_name,
        message,
        source_excerpt
      )
      values (
        v_batch.id,
        v_route.id,
        coalesce(nullif(trim(v_anomaly ->> 'code'), ''), 'parser_warning'),
        coalesce(nullif(lower(trim(v_anomaly ->> 'severity')), ''), 'warning'),
        nullif(trim(v_anomaly ->> 'field'), ''),
        coalesce(nullif(trim(v_anomaly ->> 'message'), ''), 'Review this route'),
        nullif(v_anomaly ->> 'source_excerpt', '')
      );
      v_anomaly_count := v_anomaly_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'batch_version', v_batch.batch_version,
    'provider_code', v_provider.internal_code,
    'route_count', v_route_count,
    'anomaly_count', v_anomaly_count,
    'status', v_batch.status,
    'duplicate', false
  );
end;
$$;

