create or replace function private.offerpsp_normalize_lead_geos()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_geo_values text[];
begin
  if tg_op = 'UPDATE'
     and new.geos is distinct from old.geos
     and new.target_geos is not distinct from old.target_geos then
    v_geo_values := private.offerpsp_extract_geo_codes(new.geos);
  elsif cardinality(coalesce(new.target_geos, '{}'::text[])) > 0 then
    v_geo_values := new.target_geos;
  else
    v_geo_values := private.offerpsp_extract_geo_codes(new.geos);
  end if;

  new.target_geos := private.offerpsp_expand_geo_regions(v_geo_values);
  return new;
end;
$$;

revoke all on function private.offerpsp_normalize_lead_geos() from public, anon, authenticated;

comment on function private.offerpsp_normalize_lead_geos() is
  'Keeps structured matching GEOs synchronized when the raw lead GEO is edited, while preserving explicitly supplied target_geos.';
