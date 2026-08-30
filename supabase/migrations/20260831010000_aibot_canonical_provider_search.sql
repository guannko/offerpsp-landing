create or replace function public.aibot_n8n_operating_desk_v4(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text := lower(trim(coalesce(p_command ->> 'action', '')));
  v_query text := lower(trim(coalesce(p_command ->> 'query', '')));
  v_status text := lower(trim(coalesce(p_command ->> 'status', '')));
  v_status_scope text := lower(trim(coalesce(p_command ->> 'status_scope', '')));
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

  if v_action <> 'search_canonical_providers' then
    return public.aibot_n8n_operating_desk_v3(p_command);
  end if;

  if v_status_scope not in ('', 'all', 'active', 'pipeline', 'inactive') then
    raise exception 'Unsupported status scope';
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

  with found as (
    select
      jsonb_build_object(
        'entity_type', 'provider',
        'id', p.id,
        'provider_code', p.internal_code,
        'name', p.brand_name,
        'brand_name', p.brand_name,
        'legal_name', p.legal_name,
        'website', p.website,
        'relationship_status', p.relationship_status,
        'relationship_tier', p.relationship_tier,
        'record_state', case when p.archived_at is null then 'active' else 'archived' end,
        'last_verified_at', p.last_verified_at,
        'updated_at', p.updated_at
      ) as row_data,
      case
        when p.archived_at is null and lower(p.relationship_status) in ('active', 'partner', 'live', 'top') then 0
        when p.archived_at is null then 1
        else 2
      end as relationship_order,
      lower(p.brand_name) as name_order,
      p.id::text as id_order
    from private.offerpsp_providers p
    where (
      v_query = ''
      or lower(concat_ws(' ', p.internal_code, p.brand_name, p.legal_name, p.website))
        like '%' || v_query || '%'
    )
      and (
        v_status = ''
        or lower(p.relationship_status) = v_status
        or (v_status = 'active' and p.archived_at is null)
        or (v_status = 'archived' and p.archived_at is not null)
      )
      and (
        v_status_scope in ('', 'all')
        or (v_status_scope = 'active' and p.archived_at is null)
        or (
          v_status_scope = 'pipeline'
          and p.archived_at is null
          and lower(p.relationship_status) not in ('active', 'partner', 'live', 'top')
        )
        or (
          v_status_scope = 'inactive'
          and (
            p.archived_at is not null
            or lower(p.relationship_status) in ('archived', 'rejected', 'lost', 'paused', 'inactive')
          )
        )
      )
  ),
  totals as (
    select count(*)::integer as total_count from found
  ),
  page_rows as (
    select *
    from found
    order by relationship_order, name_order, id_order
    offset v_offset
    limit v_limit
  )
  select
    totals.total_count,
    coalesce(
      jsonb_agg(
        page_rows.row_data
        order by page_rows.relationship_order, page_rows.name_order, page_rows.id_order
      ) filter (where page_rows.row_data is not null),
      '[]'::jsonb
    )
  into v_total, v_results
  from totals
  left join page_rows on true
  group by totals.total_count;

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

revoke all on function public.aibot_n8n_operating_desk_v4(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_operating_desk_v4(jsonb) to service_role;

comment on function public.aibot_n8n_operating_desk_v4(jsonb) is
  'Service-role OfferPSP/AIBot operating desk with canonical UUID provider search separated from the legacy research PSP pool.';
