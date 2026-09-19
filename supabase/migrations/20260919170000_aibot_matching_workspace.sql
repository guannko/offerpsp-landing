-- Give the shared OfferPSP AIBot a canonical, read-only matching view.
-- search_offers describes published supply, but it does not contain the
-- merchant-specific pricing snapshot produced by deterministic matching.

create or replace function public.aibot_n8n_operating_desk_v5(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text := lower(trim(coalesce(p_command ->> 'action', '')));
  v_lead_id uuid;
  v_lead_status text;
  v_matches jsonb := '[]'::jsonb;
  v_shortlist_count integer := 0;
  v_shortlist_item_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Command must be an object';
  end if;

  if v_action <> 'get_matching' then
    return public.aibot_n8n_operating_desk_v4(p_command);
  end if;

  begin
    v_lead_id := coalesce(
      nullif(trim(p_command ->> 'lead_id'), ''),
      nullif(trim(p_command ->> 'merchant_id'), ''),
      nullif(trim(p_command ->> 'entity_id'), '')
    )::uuid;
  exception when invalid_text_representation then
    raise exception 'A valid lead_id UUID is required';
  end;

  if v_lead_id is null then
    raise exception 'lead_id is required';
  end if;

  select l.status
  into v_lead_status
  from public.offerpsp_leads l
  where l.lead_id = v_lead_id;

  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  v_matches := public.list_offerpsp_route_matches(v_lead_id);

  select
    count(distinct s.id)::integer,
    count(si.id)::integer
  into v_shortlist_count, v_shortlist_item_count
  from public.offerpsp_shortlists s
  left join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
  where s.lead_id = v_lead_id;

  return jsonb_build_object(
    'action', 'get_matching',
    'lead_id', v_lead_id,
    'lead_status', v_lead_status,
    'matching_state', case
      when v_shortlist_item_count > 0 then 'shortlist_saved'
      when jsonb_array_length(v_matches) > 0 then 'candidates_ready'
      else 'no_candidates'
    end,
    'match_count', jsonb_array_length(v_matches),
    'matches', v_matches,
    'saved_shortlist_count', v_shortlist_count,
    'saved_shortlist_item_count', v_shortlist_item_count,
    'confidentiality', 'Provider identity and provider mapping are staff-only until a controlled introduction.'
  );
end;
$$;

revoke all on function public.aibot_n8n_operating_desk_v5(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_operating_desk_v5(jsonb) to service_role;

comment on function public.aibot_n8n_operating_desk_v5(jsonb) is
  'Service-role OfferPSP/AIBot operating desk with canonical merchant-specific matching and calculated client pricing snapshots.';
