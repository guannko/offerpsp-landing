-- Keep the atomic route-lineage validator compatible with the grouped
-- shortlist replacement workflow introduced by Impact Control v4.

create or replace function private.offerpsp_validate_route_replacement(
  p_old_route_id uuid,
  p_new_route_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
declare
  v_old private.offerpsp_offer_routes;
  v_new private.offerpsp_offer_routes;
begin
  select * into v_old from private.offerpsp_offer_routes where id = p_old_route_id;
  if not found then
    raise exception 'Original route not found' using errcode = 'P0001';
  end if;

  select * into v_new from private.offerpsp_offer_routes where id = p_new_route_id;
  if not found then
    raise exception 'Replacement route not found' using errcode = 'P0001';
  end if;

  if v_new.status <> 'published' then
    raise exception 'Replacement route must be published (current status: %)', v_new.status
      using errcode = 'P0001';
  end if;

  if v_old.provider_id <> v_new.provider_id
     or v_old.route_family_id <> v_new.route_family_id then
    raise exception 'Incompatible replacement: staff did not confirm the same route lineage'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'compatible', true,
    'requires_override', false,
    'same_geo', true,
    'same_method', true,
    'atomic_family_match', true,
    'route_family_id', v_new.route_family_id,
    'old_similarity_key', v_old.route_family_key,
    'new_similarity_key', v_new.route_family_key
  );
end;
$$;

revoke all on function private.offerpsp_validate_route_replacement(uuid, uuid)
  from public, anon, authenticated;
