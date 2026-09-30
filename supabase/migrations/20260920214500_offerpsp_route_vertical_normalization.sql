-- Keep provider route verticals in the same canonical vocabulary used by
-- merchant matching. Without this boundary a staff-entered value such as
-- "Licensed gambling" is classified as high risk but never matches a
-- merchant whose equivalent vertical normalizes to IGAMING.

create or replace function private.offerpsp_normalize_vertical_array(p_values text[])
returns text[]
language sql
immutable
set search_path = private, pg_catalog
as $$
  select coalesce(array_agg(distinct normalized order by normalized), '{}'::text[])
  from (
    select private.offerpsp_normalize_vertical(value) as normalized
    from unnest(coalesce(p_values, '{}'::text[])) value
  ) values_to_normalize
  where normalized is not null;
$$;

create or replace function private.offerpsp_normalize_route_verticals()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  new.verticals := private.offerpsp_normalize_vertical_array(new.verticals);
  new.prohibited_verticals := private.offerpsp_normalize_vertical_array(new.prohibited_verticals);
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_normalize_route_verticals on private.offerpsp_offer_routes;
create trigger tg_offerpsp_normalize_route_verticals
before insert or update of verticals, prohibited_verticals
on private.offerpsp_offer_routes
for each row execute function private.offerpsp_normalize_route_verticals();

update private.offerpsp_offer_routes
set verticals = private.offerpsp_normalize_vertical_array(verticals),
    prohibited_verticals = private.offerpsp_normalize_vertical_array(prohibited_verticals),
    updated_at = now()
where verticals is distinct from private.offerpsp_normalize_vertical_array(verticals)
   or prohibited_verticals is distinct from private.offerpsp_normalize_vertical_array(prohibited_verticals);

revoke all on function private.offerpsp_normalize_vertical_array(text[]) from public, anon, authenticated;
revoke all on function private.offerpsp_normalize_route_verticals() from public, anon, authenticated;
grant execute on function private.offerpsp_normalize_vertical_array(text[]) to service_role;
grant execute on function private.offerpsp_normalize_route_verticals() to service_role;

comment on function private.offerpsp_normalize_vertical_array(text[]) is
  'Normalizes provider route verticals into the canonical merchant-matching vocabulary.';
