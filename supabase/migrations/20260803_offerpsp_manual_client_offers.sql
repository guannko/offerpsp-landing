create or replace function public.create_offerpsp_manual_shortlist(
  p_lead_id uuid,
  p_route_ids uuid[],
  p_title text default 'Selected payment routes',
  p_introduction text default 'OfferPSP selected these anonymous payment routes for your review.',
  p_client_note text default 'Selected manually by OfferPSP for your review.'
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

  if cardinality(p_route_ids) is null or cardinality(p_route_ids) = 0 then
    raise exception 'Select at least one published route';
  end if;

  perform 1
  from public.offerpsp_leads
  where lead_id = p_lead_id
    and record_state = 'active'
  for update;
  if not found then
    raise exception 'Active OfferPSP lead not found';
  end if;

  if exists (
    select 1
    from unnest(p_route_ids) selected_id
    left join private.offerpsp_offer_routes r on r.id = selected_id
    left join private.offerpsp_rate_card_batches b on b.id = r.batch_id
    left join private.offerpsp_providers p on p.id = r.provider_id
    where r.id is null
      or r.status <> 'published'
      or b.status <> 'published'
      or p.relationship_status <> 'active'
  ) then
    raise exception 'Every manually selected route must be published and belong to an active PSP';
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
    coalesce(nullif(trim(p_title), ''), 'Selected payment routes'),
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
    null,
    r.provider_id,
    r.id,
    null,
    selected.position::integer,
    coalesce(nullif(trim(p_client_note), ''), 'Selected manually by OfferPSP for your review.'),
    private.offerpsp_build_client_route_snapshot(r.id, p_lead_id)
  from (
    select distinct on (route_id) route_id, position
    from unnest(p_route_ids) with ordinality as requested(route_id, position)
    order by route_id, position
  ) selected
  join private.offerpsp_offer_routes r on r.id = selected.route_id
  order by selected.position;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'shortlist_id', v_shortlist_id,
    'version', v_version,
    'item_count', v_inserted,
    'status', 'draft',
    'selection_mode', 'manual'
  );
end;
$$;

revoke all on function public.create_offerpsp_manual_shortlist(uuid, uuid[], text, text, text)
  from public, anon;
grant execute on function public.create_offerpsp_manual_shortlist(uuid, uuid[], text, text, text)
  to authenticated, service_role;

comment on function public.create_offerpsp_manual_shortlist(uuid, uuid[], text, text, text) is
  'Staff-only manual shortlist creation from published routes. It bypasses lead matching but keeps provider identity and internal pricing private.';
