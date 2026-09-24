-- Route coverage is supplied by the normalized source. The old non-null
-- `specific` default was applied before the identity trigger and prevented the
-- trigger from deriving `global_except` or `regional` from coverage_scope.

alter table private.offerpsp_offer_routes
  alter column coverage_mode drop default;

create or replace function private.tg_offerpsp_route_identity()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
begin
  if new.revision_of_route_id is not null then
    select route_family_id into new.route_family_id
    from private.offerpsp_offer_routes
    where id = new.revision_of_route_id;
  elsif new.route_family_id is null then
    new.route_family_id := gen_random_uuid();
  end if;

  if new.niche_key like 'GEO:ALLOWLIST|%' then
    new.coverage_mode := 'allowlist';
  elsif new.niche_key like 'GEO:GLOBAL_EXCEPT|%' then
    new.coverage_mode := 'global_except';
  elsif tg_op = 'INSERT' and new.coverage_mode is null then
    new.coverage_mode := case
      when new.coverage_scope = 'global' then 'global_except'
      when new.coverage_scope = 'regional' then 'regional'
      else 'specific'
    end;
  elsif tg_op = 'UPDATE'
        and new.coverage_scope is distinct from old.coverage_scope
        and new.coverage_mode is not distinct from old.coverage_mode then
    new.coverage_mode := case
      when new.coverage_scope = 'global' then 'global_except'
      when new.coverage_scope = 'regional' then 'regional'
      else 'specific'
    end;
  elsif new.coverage_mode is null then
    new.coverage_mode := case
      when new.coverage_scope = 'global' then 'global_except'
      when new.coverage_scope = 'regional' then 'regional'
      else 'specific'
    end;
  end if;

  new.coverage_scope := case
    when new.coverage_mode = 'global_except' then 'global'
    when new.coverage_mode in ('regional', 'allowlist') then 'regional'
    else 'specific'
  end;
  new.geos := coalesce(new.geos, '{}'::text[]);
  new.blocked_geos := coalesce(new.blocked_geos, '{}'::text[]);
  new.card_brands := coalesce(new.card_brands, '{}'::text[]);
  new.route_family_key := private.offerpsp_route_family_key(
    new.coverage_mode,
    new.geos,
    new.currencies,
    new.flow,
    new.methods,
    new.card_brands,
    new.traffic_types,
    new.integrations
  );
  return new;
end;
$$;

revoke all on function private.tg_offerpsp_route_identity()
  from public, anon, authenticated;

comment on function private.tg_offerpsp_route_identity() is
  'Maintains atomic route identity while preserving normalized coverage for new imports and explicit scope edits.';
