alter table public.offerpsp_organizations
  add column if not exists co_brand_enabled boolean not null default false,
  add column if not exists brand_display_name text,
  add column if not exists brand_tagline_ru text,
  add column if not exists brand_tagline_en text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_accent_color text,
  add column if not exists brand_support_email text;

alter table public.offerpsp_organizations
  drop constraint if exists offerpsp_organizations_brand_display_name_length,
  add constraint offerpsp_organizations_brand_display_name_length
    check (brand_display_name is null or char_length(brand_display_name) between 1 and 80),
  drop constraint if exists offerpsp_organizations_brand_tagline_ru_length,
  add constraint offerpsp_organizations_brand_tagline_ru_length
    check (brand_tagline_ru is null or char_length(brand_tagline_ru) <= 180),
  drop constraint if exists offerpsp_organizations_brand_tagline_en_length,
  add constraint offerpsp_organizations_brand_tagline_en_length
    check (brand_tagline_en is null or char_length(brand_tagline_en) <= 180),
  drop constraint if exists offerpsp_organizations_brand_logo_url_format,
  add constraint offerpsp_organizations_brand_logo_url_format
    check (brand_logo_url is null or brand_logo_url ~ '^https://[^[:space:]]+$'),
  drop constraint if exists offerpsp_organizations_brand_accent_color_format,
  add constraint offerpsp_organizations_brand_accent_color_format
    check (brand_accent_color is null or brand_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  drop constraint if exists offerpsp_organizations_brand_support_email_format,
  add constraint offerpsp_organizations_brand_support_email_format
    check (brand_support_email is null or brand_support_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  drop constraint if exists offerpsp_organizations_cobrand_agent_only,
  add constraint offerpsp_organizations_cobrand_agent_only
    check (
      organization_type = 'agent'
      or (
        co_brand_enabled = false
        and brand_display_name is null
        and brand_tagline_ru is null
        and brand_tagline_en is null
        and brand_logo_url is null
        and brand_accent_color is null
        and brand_support_email is null
      )
    );

create or replace function public.get_offerpsp_agent_brand_settings(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select jsonb_build_object(
    'organization_id', o.id,
    'co_brand_enabled', o.co_brand_enabled,
    'brand_display_name', o.brand_display_name,
    'brand_tagline_ru', o.brand_tagline_ru,
    'brand_tagline_en', o.brand_tagline_en,
    'brand_logo_url', o.brand_logo_url,
    'brand_accent_color', o.brand_accent_color,
    'brand_support_email', o.brand_support_email
  ) into v_result
  from public.offerpsp_organizations o
  where o.id = p_organization_id
    and o.organization_type = 'agent';

  if v_result is null then
    raise exception 'Agent organization not found';
  end if;
  return v_result;
end;
$$;

create or replace function public.save_offerpsp_agent_brand_settings(
  p_organization_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before public.offerpsp_organizations;
  v_after public.offerpsp_organizations;
  v_enabled boolean;
  v_display_name text;
  v_tagline_ru text;
  v_tagline_en text;
  v_logo_url text;
  v_accent_color text;
  v_support_email text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Brand settings payload must be an object';
  end if;

  select * into v_before
  from public.offerpsp_organizations
  where id = p_organization_id and organization_type = 'agent'
  for update;
  if not found then
    raise exception 'Agent organization not found';
  end if;

  v_enabled := coalesce((p_payload ->> 'co_brand_enabled')::boolean, false);
  v_display_name := nullif(trim(p_payload ->> 'brand_display_name'), '');
  v_tagline_ru := nullif(trim(p_payload ->> 'brand_tagline_ru'), '');
  v_tagline_en := nullif(trim(p_payload ->> 'brand_tagline_en'), '');
  v_logo_url := nullif(trim(p_payload ->> 'brand_logo_url'), '');
  v_accent_color := upper(nullif(trim(p_payload ->> 'brand_accent_color'), ''));
  v_support_email := lower(nullif(trim(p_payload ->> 'brand_support_email'), ''));

  if v_enabled and v_display_name is null then
    raise exception 'Brand display name is required when co-branding is enabled';
  end if;
  if v_display_name is not null and char_length(v_display_name) > 80 then
    raise exception 'Brand display name is too long';
  end if;
  if v_tagline_ru is not null and char_length(v_tagline_ru) > 180 then
    raise exception 'Russian brand tagline is too long';
  end if;
  if v_tagline_en is not null and char_length(v_tagline_en) > 180 then
    raise exception 'English brand tagline is too long';
  end if;
  if v_logo_url is not null and v_logo_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Brand logo URL must use HTTPS';
  end if;
  if v_accent_color is not null and v_accent_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Brand accent color must be a six-digit HEX value';
  end if;
  if v_support_email is not null and v_support_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Brand support email is invalid';
  end if;

  update public.offerpsp_organizations
  set co_brand_enabled = v_enabled,
      brand_display_name = v_display_name,
      brand_tagline_ru = v_tagline_ru,
      brand_tagline_en = v_tagline_en,
      brand_logo_url = v_logo_url,
      brand_accent_color = v_accent_color,
      brand_support_email = v_support_email
  where id = p_organization_id
  returning * into v_after;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state, after_state
  ) values (
    'organization', v_after.id::text, 'brand_settings_updated', auth.uid(),
    to_jsonb(v_before) - 'created_by' - 'archived_by',
    to_jsonb(v_after) - 'created_by' - 'archived_by'
  );

  return jsonb_build_object(
    'organization_id', v_after.id,
    'co_brand_enabled', v_after.co_brand_enabled,
    'brand_display_name', v_after.brand_display_name,
    'brand_tagline_ru', v_after.brand_tagline_ru,
    'brand_tagline_en', v_after.brand_tagline_en,
    'brand_logo_url', v_after.brand_logo_url,
    'brand_accent_color', v_after.brand_accent_color,
    'brand_support_email', v_after.brand_support_email
  );
end;
$$;

create or replace function public.get_offerpsp_my_agent_brand(p_organization_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'organization_id', o.id,
    'co_brand_enabled', o.co_brand_enabled,
    'brand_display_name', o.brand_display_name,
    'brand_tagline_ru', o.brand_tagline_ru,
    'brand_tagline_en', o.brand_tagline_en,
    'brand_logo_url', o.brand_logo_url,
    'brand_accent_color', o.brand_accent_color,
    'brand_support_email', o.brand_support_email
  ) into v_result
  from public.offerpsp_organization_members om
  join public.offerpsp_organizations o on o.id = om.organization_id
  where om.user_id = auth.uid()
    and om.active
    and o.organization_type = 'agent'
    and o.status = 'active'
    and (p_organization_id is null or o.id = p_organization_id)
  order by o.name
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_offerpsp_agent_brand_settings(uuid) from public, anon;
revoke all on function public.save_offerpsp_agent_brand_settings(uuid, jsonb) from public, anon;
revoke all on function public.get_offerpsp_my_agent_brand(uuid) from public, anon;

grant execute on function public.get_offerpsp_agent_brand_settings(uuid) to authenticated;
grant execute on function public.save_offerpsp_agent_brand_settings(uuid, jsonb) to authenticated;
grant execute on function public.get_offerpsp_my_agent_brand(uuid) to authenticated;

comment on function public.get_offerpsp_my_agent_brand(uuid) is
  'Returns only client-safe co-brand settings for an authenticated member of the requested agent organization.';
