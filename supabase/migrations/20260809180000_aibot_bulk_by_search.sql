-- One-call bulk preparation for smaller agent models: resolve an explicit
-- company filter and create the immutable confirmation preview atomically.

create or replace function public.aibot_n8n_prepare_bulk_by_search(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entity text := lower(trim(coalesce(p_command ->> 'entity_type', '')));
  v_query text := lower(trim(coalesce(p_command ->> 'query', '')));
  v_geo text := lower(trim(coalesce(p_command ->> 'geo', '')));
  v_status text := lower(trim(coalesce(p_command ->> 'status', '')));
  v_status_scope text := lower(trim(coalesce(p_command ->> 'status_scope', '')));
  v_ids integer[] := array[]::integer[];
  v_total integer := 0;
  v_prepared jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Command must be an object';
  end if;
  if v_entity not in ('casino', 'psp') then
    raise exception 'entity_type must be casino or psp';
  end if;
  if v_query = '' and v_geo = '' and v_status = '' and v_status_scope in ('', 'all') then
    raise exception 'At least one explicit search filter is required';
  end if;
  if v_status_scope not in ('', 'all', 'active', 'pipeline', 'inactive') then
    raise exception 'Unsupported status scope';
  end if;

  if v_entity = 'psp' then
    select count(*)::integer, coalesce(array_agg(p.id order by p.id), array[]::integer[])
    into v_total, v_ids
    from public.psp_providers p
    where (
      v_query = ''
      or lower(concat_ws(' ', p.name, p.website, p.email, p.telegram, p.contact_name,
        p.specialization, array_to_string(p.supported_countries, ' '),
        array_to_string(p.payment_methods, ' '))) like '%' || v_query || '%'
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
        or (v_status_scope = 'active' and p.record_state = 'active' and lower(coalesce(p.provider_status, '')) in ('active','partner','live','top'))
        or (v_status_scope = 'pipeline' and p.record_state = 'active' and lower(coalesce(p.provider_status, '')) not in ('active','partner','live','top','rejected','lost','paused','inactive'))
        or (v_status_scope = 'inactive' and (p.record_state = 'archived' or lower(coalesce(p.provider_status, '')) in ('rejected','lost','paused','inactive')))
      );
  else
    select count(*)::integer, coalesce(array_agg(c.id order by c.id), array[]::integer[])
    into v_total, v_ids
    from public.casino_leads c
    where (
      v_query = ''
      or lower(concat_ws(' ', c.name, c.website, c.email, c.telegram, c.contact_name,
        c.sphere, c.license, array_to_string(c.tags, ' '))) like '%' || v_query || '%'
    )
      and (v_geo = '' or lower(coalesce(c.geo, '')) like '%' || v_geo || '%')
      and (v_status = '' or lower(coalesce(c.contact_status, '')) = v_status or lower(c.record_state) = v_status)
      and (
        v_status_scope in ('', 'all')
        or (v_status_scope = 'active' and c.record_state = 'active' and lower(coalesce(c.contact_status, '')) in ('active','partner','replied','deal'))
        or (v_status_scope = 'pipeline' and c.record_state = 'active' and lower(coalesce(c.contact_status, '')) not in ('active','partner','replied','deal','rejected','lost','paused'))
        or (v_status_scope = 'inactive' and (c.record_state = 'archived' or lower(coalesce(c.contact_status, '')) in ('rejected','lost','paused')))
      );
  end if;

  if v_total < 2 then
    raise exception 'Bulk operation requires at least two matching records; found %', v_total;
  end if;
  if v_total > 50 then
    raise exception 'Search matched % records. Narrow the filter to 50 or fewer before preparing a bulk operation.', v_total;
  end if;

  v_prepared := public.aibot_n8n_prepare_bulk(
    (p_command - 'query' - 'geo' - 'status' - 'status_scope')
      || jsonb_build_object('ids', to_jsonb(v_ids))
  );

  return v_prepared || jsonb_build_object(
    'matched_total', v_total,
    'search_filter', jsonb_strip_nulls(jsonb_build_object(
      'query', nullif(v_query, ''),
      'geo', nullif(v_geo, ''),
      'status', nullif(v_status, ''),
      'status_scope', nullif(v_status_scope, '')
    ))
  );
end;
$$;

revoke all on function public.aibot_n8n_prepare_bulk_by_search(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_prepare_bulk_by_search(jsonb) to service_role;

comment on function public.aibot_n8n_prepare_bulk_by_search(jsonb) is
  'Resolve an explicit PSP/casino filter and prepare a chat-bound bulk confirmation in one call.';
