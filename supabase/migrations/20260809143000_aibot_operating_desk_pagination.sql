create or replace function public.aibot_n8n_operating_desk_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text := lower(coalesce(p_command ->> 'action', ''));
  v_entity text := lower(coalesce(p_command ->> 'entity_type', 'all'));
  v_query text := lower(trim(coalesce(p_command ->> 'query', '')));
  v_geo text := lower(trim(coalesce(p_command ->> 'geo', '')));
  v_status text := lower(trim(coalesce(p_command ->> 'status', '')));
  v_status_scope text := lower(trim(coalesce(p_command ->> 'status_scope', '')));
  v_provider text := lower(trim(coalesce(p_command ->> 'provider', '')));
  v_method text := lower(trim(coalesce(p_command ->> 'method', '')));
  v_currency text := lower(trim(coalesce(p_command ->> 'currency', '')));
  v_flow text := lower(trim(coalesce(p_command ->> 'flow', '')));
  v_limit integer;
  v_offset integer;
  v_page integer;
  v_count integer := 0;
  v_total integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Command must be an object';
  end if;

  begin
    v_limit := least(greatest(coalesce(nullif(p_command ->> 'limit', '')::integer, 10), 1), 50);
    v_page := greatest(coalesce(nullif(p_command ->> 'page', '')::integer, 1), 1);
    v_offset := greatest(
      coalesce(nullif(p_command ->> 'offset', '')::integer, (v_page - 1) * v_limit),
      0
    );
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'limit, page and offset must be valid integers';
  end;

  if v_offset > 100000 then
    raise exception 'offset is too large';
  end if;

  if v_action = 'search_companies' then
    if v_entity not in ('all', 'casino', 'psp') then
      raise exception 'Unsupported entity type';
    end if;
    if v_status_scope not in ('', 'all', 'active', 'pipeline', 'inactive') then
      raise exception 'Unsupported status scope';
    end if;

    with found as (
      select
        jsonb_build_object(
          'entity_type', 'casino',
          'id', c.id,
          'name', c.name,
          'website', c.website,
          'geo', c.geo,
          'email', c.email,
          'telegram', c.telegram,
          'contact_status', c.contact_status,
          'record_state', c.record_state,
          'score', c.score
        ) as row_data,
        1 as entity_order,
        case
          when lower(coalesce(c.contact_status, '')) in ('partner', 'active', 'replied', 'deal') then 0
          else 1
        end as relationship_order,
        lower(coalesce(c.name, '')) as name_order,
        c.id as id_order
      from public.casino_leads c
      where v_entity in ('all', 'casino')
        and (
          v_query = ''
          or lower(concat_ws(' ', c.name, c.website, c.email, c.telegram, c.contact_name, c.sphere, c.license, array_to_string(c.tags, ' '))) like '%' || v_query || '%'
        )
        and (v_geo = '' or lower(coalesce(c.geo, '')) like '%' || v_geo || '%')
        and (
          v_status = ''
          or lower(coalesce(c.contact_status, '')) = v_status
          or lower(c.record_state) = v_status
        )
        and (
          v_status_scope in ('', 'all')
          or (v_status_scope = 'active' and c.record_state = 'active' and lower(coalesce(c.contact_status, '')) in ('active', 'partner', 'replied', 'deal'))
          or (v_status_scope = 'pipeline' and c.record_state = 'active' and lower(coalesce(c.contact_status, '')) not in ('active', 'partner', 'replied', 'deal', 'rejected', 'lost', 'paused'))
          or (v_status_scope = 'inactive' and (c.record_state = 'archived' or lower(coalesce(c.contact_status, '')) in ('rejected', 'lost', 'paused')))
        )

      union all

      select
        jsonb_build_object(
          'entity_type', 'psp',
          'id', p.id,
          'name', p.name,
          'website', p.website,
          'geo', p.geo,
          'email', p.email,
          'telegram', p.telegram,
          'contact_status', p.contact_status,
          'provider_status', p.provider_status,
          'record_state', p.record_state
        ) as row_data,
        0 as entity_order,
        case
          when lower(coalesce(p.contact_status, '')) = 'partner' then 0
          when lower(coalesce(p.provider_status, '')) in ('active', 'partner', 'live', 'top') then 1
          else 2
        end as relationship_order,
        lower(coalesce(p.name, '')) as name_order,
        p.id as id_order
      from public.psp_providers p
      where v_entity in ('all', 'psp')
        and (
          v_query = ''
          or lower(concat_ws(' ', p.name, p.website, p.email, p.telegram, p.contact_name, p.specialization, array_to_string(p.supported_countries, ' '), array_to_string(p.payment_methods, ' '))) like '%' || v_query || '%'
        )
        and (v_geo = '' or lower(concat_ws(' ', p.geo, array_to_string(p.supported_countries, ' '))) like '%' || v_geo || '%')
        and (
          v_status = ''
          or lower(coalesce(p.contact_status, '')) = v_status
          or lower(p.provider_status) = v_status
          or lower(p.record_state) = v_status
        )
        and (
          v_status_scope in ('', 'all')
          or (v_status_scope = 'active' and p.record_state = 'active' and lower(coalesce(p.provider_status, '')) in ('active', 'partner', 'live', 'top'))
          or (v_status_scope = 'pipeline' and p.record_state = 'active' and lower(coalesce(p.provider_status, '')) not in ('active', 'partner', 'live', 'top', 'rejected', 'lost', 'paused', 'inactive'))
          or (v_status_scope = 'inactive' and (p.record_state = 'archived' or lower(coalesce(p.provider_status, '')) in ('rejected', 'lost', 'paused', 'inactive')))
        )
    ),
    totals as (
      select count(*)::integer as total_count from found
    ),
    page_rows as (
      select *
      from found
      order by entity_order, relationship_order, name_order, id_order
      offset v_offset
      limit v_limit
    )
    select
      totals.total_count,
      coalesce(
        jsonb_agg(page_rows.row_data order by page_rows.entity_order, page_rows.relationship_order, page_rows.name_order, page_rows.id_order)
          filter (where page_rows.row_data is not null),
        '[]'::jsonb
      )
    into v_total, v_results
    from totals
    left join page_rows on true
    group by totals.total_count;

  elsif v_action = 'search_offers' then
    with found as (
      select
        to_jsonb(route_row) as row_data,
        route_row.status_order,
        route_row.updated_at,
        route_row.id
      from (
        select
          r.id,
          r.internal_code,
          p.internal_code as provider_code,
          p.brand_name as provider_name,
          r.client_title,
          r.geos,
          r.currencies,
          r.methods,
          r.flow,
          r.verticals,
          r.traffic_types,
          r.integrations,
          r.status,
          r.updated_at,
          case when r.status = 'published' then 0 else 1 end as status_order
        from private.offerpsp_offer_routes r
        join private.offerpsp_providers p on p.id = r.provider_id
        where (
          v_query = ''
          or lower(concat_ws(' ', p.brand_name, p.internal_code, r.client_title, r.internal_code, array_to_string(r.geos, ' '), array_to_string(r.currencies, ' '), array_to_string(r.methods, ' '), r.flow, array_to_string(r.verticals, ' '))) like '%' || v_query || '%'
        )
          and (v_provider = '' or lower(concat_ws(' ', p.brand_name, p.internal_code)) like '%' || v_provider || '%')
          and (v_geo = '' or exists (select 1 from unnest(r.geos) g where lower(g) like '%' || v_geo || '%'))
          and (v_method = '' or exists (select 1 from unnest(r.methods) m where lower(m) like '%' || v_method || '%'))
          and (v_currency = '' or exists (select 1 from unnest(r.currencies) c where lower(c) like '%' || v_currency || '%'))
          and (v_flow = '' or lower(r.flow) = v_flow)
          and (v_status = '' or lower(r.status) = v_status)
      ) route_row
    ),
    totals as (
      select count(*)::integer as total_count from found
    ),
    page_rows as (
      select *
      from found
      order by status_order, updated_at desc, id
      offset v_offset
      limit v_limit
    )
    select
      totals.total_count,
      coalesce(
        jsonb_agg(page_rows.row_data - 'status_order' order by page_rows.status_order, page_rows.updated_at desc, page_rows.id)
          filter (where page_rows.row_data is not null),
        '[]'::jsonb
      )
    into v_total, v_results
    from totals
    left join page_rows on true
    group by totals.total_count;

  else
    return public.aibot_n8n_operating_desk(p_command);
  end if;

  v_count := jsonb_array_length(v_results);
  return jsonb_build_object(
    'action', v_action,
    'count', v_count,
    'total_count', v_total,
    'items', v_results,
    'limit', v_limit,
    'offset', v_offset,
    'page', (v_offset / v_limit) + 1,
    'has_more', v_offset + v_count < v_total,
    'next_offset', case when v_offset + v_count < v_total then v_offset + v_limit else null end,
    'previous_offset', case when v_offset > 0 then greatest(v_offset - v_limit, 0) else null end
  );
end;
$$;

revoke all on function public.aibot_n8n_operating_desk_v2(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_operating_desk_v2(jsonb) to service_role;

comment on function public.aibot_n8n_operating_desk_v2(jsonb) is
  'Paginated service-role Operating Desk for AIBot. Search responses include stable ordering, total_count, has_more and page offsets; mutations delegate to the original safe RPC.';
