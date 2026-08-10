create table if not exists private.offerpsp_geo_region_members (
  region_code text not null,
  country_code text not null,
  active boolean not null default true,
  notes text,
  primary key (region_code, country_code),
  constraint offerpsp_geo_region_code_format check (region_code = upper(region_code)),
  constraint offerpsp_geo_country_code_format check (country_code ~ '^[A-Z]{2}$')
);

revoke all on table private.offerpsp_geo_region_members from public, anon, authenticated;
grant select on table private.offerpsp_geo_region_members to service_role;

comment on table private.offerpsp_geo_region_members is
  'Staff-managed commercial region aliases used to expand broad GEO requests before matching. Raw source values remain unchanged.';

insert into private.offerpsp_geo_region_members (region_code, country_code, notes)
values
  ('CIS', 'AM', 'Commercial CIS alias'),
  ('CIS', 'AZ', 'Commercial CIS alias'),
  ('CIS', 'BY', 'Commercial CIS alias'),
  ('CIS', 'KZ', 'Commercial CIS alias'),
  ('CIS', 'KG', 'Commercial CIS alias'),
  ('CIS', 'MD', 'Commercial CIS alias'),
  ('CIS', 'RU', 'Commercial CIS alias'),
  ('CIS', 'TJ', 'Commercial CIS alias'),
  ('CIS', 'TM', 'Commercial CIS alias'),
  ('CIS', 'UZ', 'Commercial CIS alias')
on conflict (region_code, country_code) do nothing;

create or replace function private.offerpsp_expand_geo_regions(p_values text[])
returns text[]
language sql
stable
set search_path = pg_catalog
as $$
  with normalized as (
    select distinct
      case
        when upper(trim(value)) in ('CIS', 'СНГ', 'COMMONWEALTH OF INDEPENDENT STATES') then 'CIS'
        else upper(trim(value))
      end as code
    from unnest(coalesce(p_values, '{}'::text[])) value
    where nullif(trim(value), '') is not null
  ), expanded as (
    select coalesce(member.country_code, normalized.code) as code
    from normalized
    left join private.offerpsp_geo_region_members member
      on member.region_code = normalized.code
     and member.active
  )
  select coalesce(array_agg(distinct code order by code), '{}'::text[])
  from expanded;
$$;

revoke all on function private.offerpsp_expand_geo_regions(text[]) from public, anon, authenticated;
grant execute on function private.offerpsp_expand_geo_regions(text[]) to service_role;

create or replace function private.offerpsp_extract_geo_codes(p_value text)
returns text[]
language sql
stable
set search_path = pg_catalog
as $$
  with input as (
    select upper(coalesce(p_value, '')) as value
  ), mapped(code) as (
    select 'UZ' from input where value ~ '(^|[^A-Z])(UZ|UZBEKISTAN)([^A-Z]|$)'
    union all select 'KG' from input where value ~ '(^|[^A-Z])(KG|KYRGYZSTAN|KYRGYZ REPUBLIC)([^A-Z]|$)'
    union all select 'IN' from input where value ~ '(^|[^A-Z])(IN|INDIA)([^A-Z]|$)'
    union all select 'AZ' from input where value ~ '(^|[^A-Z])(AZ|AZERBAIJAN)([^A-Z]|$)'
    union all select 'RU' from input where value ~ '(^|[^A-Z])(RU|RUSSIA|RUSSIAN FEDERATION)([^A-Z]|$)'
    union all select 'AR' from input where value ~ '(^|[^A-Z])(AR|ARGENTINA)([^A-Z]|$)'
    union all select 'KR' from input where value ~ '(^|[^A-Z])(KR|SOUTH KOREA|KOREA)([^A-Z]|$)'
    union all select 'TR' from input where value ~ '(^|[^A-Z])(TR|TURKEY|TURKIYE)([^A-Z]|$)'
    union all select 'PL' from input where value ~ '(^|[^A-Z])(PL|POLAND)([^A-Z]|$)'
    union all select 'AU' from input where value ~ '(^|[^A-Z])(AU|AUSTRALIA)([^A-Z]|$)'
    union all select 'GB' from input where value ~ '(^|[^A-Z])(GB|UK|UNITED KINGDOM)([^A-Z]|$)'
    union all select 'CH' from input where value ~ '(^|[^A-Z])(CH|SWITZERLAND)([^A-Z]|$)'
    union all select 'DE' from input where value ~ '(^|[^A-Z])(DE|GERMANY)([^A-Z]|$)'
    union all select 'EU' from input where value ~ '(^|[^A-Z])(EU|EEA|EUROPE)([^A-Z]|$)'
    union all
    select member.country_code
    from input
    join private.offerpsp_geo_region_members member
      on member.region_code = 'CIS'
     and member.active
    where value ~ '(^|[^A-Z])(CIS|COMMONWEALTH OF INDEPENDENT STATES)([^A-Z]|$)'
       or value ~ '(^|[^А-ЯЁ])СНГ([^А-ЯЁ]|$)'
  )
  select coalesce(array_agg(distinct code order by code), '{}'::text[])
  from mapped;
$$;

revoke all on function private.offerpsp_extract_geo_codes(text) from public, anon, authenticated;
grant execute on function private.offerpsp_extract_geo_codes(text) to service_role;

create or replace function private.offerpsp_normalize_lead_geos()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  new.target_geos := private.offerpsp_expand_geo_regions(
    case
      when cardinality(coalesce(new.target_geos, '{}'::text[])) > 0 then new.target_geos
      else private.offerpsp_extract_geo_codes(new.geos)
    end
  );
  return new;
end;
$$;

revoke all on function private.offerpsp_normalize_lead_geos() from public, anon, authenticated;

drop trigger if exists offerpsp_leads_normalize_geo_regions on public.offerpsp_leads;
create trigger offerpsp_leads_normalize_geo_regions
before insert or update of geos, target_geos on public.offerpsp_leads
for each row execute function private.offerpsp_normalize_lead_geos();

create or replace function private.offerpsp_normalize_route_geos()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  new.geos := private.offerpsp_expand_geo_regions(new.geos);
  new.blocked_geos := private.offerpsp_expand_geo_regions(new.blocked_geos);
  return new;
end;
$$;

revoke all on function private.offerpsp_normalize_route_geos() from public, anon, authenticated;

drop trigger if exists offerpsp_routes_normalize_geo_regions on private.offerpsp_offer_routes;
create trigger offerpsp_routes_normalize_geo_regions
before insert or update of geos, blocked_geos on private.offerpsp_offer_routes
for each row execute function private.offerpsp_normalize_route_geos();

update public.offerpsp_leads
set target_geos = private.offerpsp_extract_geo_codes(geos)
where cardinality(coalesce(target_geos, '{}'::text[])) = 0
  and (
    upper(coalesce(geos, '')) ~ '(^|[^A-Z])(CIS|COMMONWEALTH OF INDEPENDENT STATES)([^A-Z]|$)'
    or upper(coalesce(geos, '')) ~ '(^|[^А-ЯЁ])СНГ([^А-ЯЁ]|$)'
  );

update private.offerpsp_offer_routes
set geos = private.offerpsp_expand_geo_regions(geos),
    blocked_geos = private.offerpsp_expand_geo_regions(blocked_geos)
where exists (
    select 1 from unnest(coalesce(geos, '{}'::text[]) || coalesce(blocked_geos, '{}'::text[])) value
    where upper(trim(value)) in ('CIS', 'СНГ', 'COMMONWEALTH OF INDEPENDENT STATES')
  );
