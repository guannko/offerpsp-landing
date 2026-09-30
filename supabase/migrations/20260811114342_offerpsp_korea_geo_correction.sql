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
    union all select 'KP' from input where value ~ '(^|[^A-Z])(KP|DPRK|NORTH KOREA|DEMOCRATIC PEOPLE.?S REPUBLIC OF KOREA)([^A-Z]|$)'
    union all select 'KR' from input where value ~ '(^|[^A-Z])(KR|SOUTH KOREA)([^A-Z]|$)'
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

update private.offerpsp_offer_routes
set blocked_geos = array['IR', 'KP', 'MM']::text[],
    updated_at = now()
where coverage_scope = 'global'
  and raw_block ilike '%Democratic People%Republic of Korea%DPRK%'
  and raw_block ilike '%Iran%'
  and raw_block ilike '%Myanmar%'
  and blocked_geos = array['KR']::text[];

