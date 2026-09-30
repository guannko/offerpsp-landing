-- Canonical legal, trading, and brand aliases for merchant organizations and PSPs.
-- The registry stays private because provider identities and operational links are
-- not part of the public API surface.

create table private.offerpsp_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.offerpsp_organizations(id) on delete cascade,
  provider_id uuid references private.offerpsp_providers(id) on delete cascade,
  alias_type text not null
    check (alias_type in ('legal_name', 'trading_name', 'brand')),
  alias text not null check (length(trim(alias)) between 2 and 160),
  normalized_alias text generated always as (
    private.offerpsp_normalize_company_name(alias)
  ) stored,
  source text not null default 'staff'
    check (source in ('canonical', 'historical', 'staff')),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is not null)::integer + (provider_id is not null)::integer = 1),
  check (normalized_alias is not null)
);

create unique index offerpsp_entity_aliases_organization_name_uidx
  on private.offerpsp_entity_aliases(normalized_alias)
  where organization_id is not null;

create unique index offerpsp_entity_aliases_provider_name_uidx
  on private.offerpsp_entity_aliases(provider_id, normalized_alias)
  where provider_id is not null;

create index offerpsp_entity_aliases_organization_idx
  on private.offerpsp_entity_aliases(organization_id, is_primary desc, updated_at desc)
  where organization_id is not null;

create index offerpsp_entity_aliases_provider_idx
  on private.offerpsp_entity_aliases(provider_id, is_primary desc, updated_at desc)
  where provider_id is not null;

alter table private.offerpsp_entity_aliases enable row level security;
revoke all on table private.offerpsp_entity_aliases from public, anon, authenticated;
grant all on table private.offerpsp_entity_aliases to service_role;

drop trigger if exists offerpsp_entity_aliases_set_updated_at
  on private.offerpsp_entity_aliases;
create trigger offerpsp_entity_aliases_set_updated_at
before update on private.offerpsp_entity_aliases
for each row execute function public.set_offerpsp_updated_at();

create or replace function private.offerpsp_register_entity_alias(
  p_organization_id uuid,
  p_provider_id uuid,
  p_alias_type text,
  p_alias text,
  p_source text,
  p_is_primary boolean,
  p_created_by uuid default null
)
returns void
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_alias text := nullif(trim(p_alias), '');
  v_normalized text;
  v_existing private.offerpsp_entity_aliases;
begin
  if (p_organization_id is not null)::integer + (p_provider_id is not null)::integer <> 1 then
    raise exception 'Exactly one OfferPSP alias target is required';
  end if;
  if p_alias_type not in ('legal_name', 'trading_name', 'brand') then
    raise exception 'Unsupported OfferPSP alias type';
  end if;
  if p_source not in ('canonical', 'historical', 'staff') then
    raise exception 'Unsupported OfferPSP alias source';
  end if;
  if v_alias is null then return; end if;
  if length(v_alias) > 160 then raise exception 'OfferPSP alias is too long'; end if;

  v_normalized := private.offerpsp_normalize_company_name(v_alias);
  if v_normalized is null or length(v_normalized) < 2 then
    raise exception 'OfferPSP alias is too short after normalization';
  end if;

  if p_organization_id is not null then
    select * into v_existing
    from private.offerpsp_entity_aliases a
    where a.normalized_alias = v_normalized and a.organization_id is not null
    for update;
  else
    select * into v_existing
    from private.offerpsp_entity_aliases a
    where a.normalized_alias = v_normalized and a.provider_id = p_provider_id
    for update;
  end if;

  if found then
    if v_existing.organization_id is distinct from p_organization_id
      or v_existing.provider_id is distinct from p_provider_id then
      raise exception 'OfferPSP alias is already assigned to another entity';
    end if;
    update private.offerpsp_entity_aliases set
      alias = v_alias,
      alias_type = case
        when alias_type in ('brand', 'trading_name') and p_alias_type = 'legal_name'
          then alias_type
        else p_alias_type
      end,
      source = case
        when source = 'canonical' and p_source = 'staff' then source
        else p_source
      end,
      is_primary = is_primary or p_is_primary,
      created_by = coalesce(created_by, p_created_by)
    where id = v_existing.id;
    return;
  end if;

  insert into private.offerpsp_entity_aliases(
    organization_id, provider_id, alias_type, alias, source, is_primary, created_by
  ) values (
    p_organization_id, p_provider_id, p_alias_type, v_alias, p_source,
    p_is_primary, p_created_by
  );
end;
$$;

revoke all on function private.offerpsp_register_entity_alias(uuid,uuid,text,text,text,boolean,uuid)
  from public, anon, authenticated;
grant execute on function private.offerpsp_register_entity_alias(uuid,uuid,text,text,text,boolean,uuid)
  to service_role;

create or replace function private.sync_offerpsp_organization_aliases()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_name_norm text := private.offerpsp_normalize_company_name(new.name);
  v_legal_norm text := private.offerpsp_normalize_company_name(new.legal_name);
begin
  update private.offerpsp_entity_aliases set source = 'historical', is_primary = false
  where organization_id = new.id and source = 'canonical'
    and alias_type = 'trading_name' and normalized_alias is distinct from v_name_norm;
  perform private.offerpsp_register_entity_alias(
    new.id, null, 'trading_name', new.name, 'canonical', true, new.created_by
  );

  update private.offerpsp_entity_aliases set source = 'historical', is_primary = false
  where organization_id = new.id and source = 'canonical'
    and alias_type = 'legal_name' and normalized_alias is distinct from v_legal_norm;
  perform private.offerpsp_register_entity_alias(
    new.id, null, 'legal_name', new.legal_name, 'canonical', true, new.created_by
  );
  return new;
end;
$$;

revoke all on function private.sync_offerpsp_organization_aliases()
  from public, anon, authenticated;

create or replace function private.sync_offerpsp_provider_aliases()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_brand_norm text := private.offerpsp_normalize_company_name(new.brand_name);
  v_legal_norm text := private.offerpsp_normalize_company_name(new.legal_name);
begin
  update private.offerpsp_entity_aliases set source = 'historical', is_primary = false
  where provider_id = new.id and source = 'canonical'
    and alias_type = 'brand' and normalized_alias is distinct from v_brand_norm;
  perform private.offerpsp_register_entity_alias(
    null, new.id, 'brand', new.brand_name, 'canonical', true, new.owner_user_id
  );

  update private.offerpsp_entity_aliases set source = 'historical', is_primary = false
  where provider_id = new.id and source = 'canonical'
    and alias_type = 'legal_name' and normalized_alias is distinct from v_legal_norm;
  perform private.offerpsp_register_entity_alias(
    null, new.id, 'legal_name', new.legal_name, 'canonical', true, new.owner_user_id
  );
  return new;
end;
$$;

revoke all on function private.sync_offerpsp_provider_aliases()
  from public, anon, authenticated;

drop trigger if exists offerpsp_organizations_sync_aliases on public.offerpsp_organizations;
create trigger offerpsp_organizations_sync_aliases
after insert or update of name, legal_name on public.offerpsp_organizations
for each row execute function private.sync_offerpsp_organization_aliases();

drop trigger if exists offerpsp_providers_sync_aliases on private.offerpsp_providers;
create trigger offerpsp_providers_sync_aliases
after insert or update of brand_name, legal_name on private.offerpsp_providers
for each row execute function private.sync_offerpsp_provider_aliases();

do $$
declare
  v_item record;
begin
  for v_item in
    select id, name, legal_name, created_by from public.offerpsp_organizations
  loop
    perform private.offerpsp_register_entity_alias(
      v_item.id, null, 'trading_name', v_item.name, 'canonical', true, v_item.created_by
    );
    perform private.offerpsp_register_entity_alias(
      v_item.id, null, 'legal_name', v_item.legal_name, 'canonical', true, v_item.created_by
    );
  end loop;

  for v_item in
    select id, brand_name, legal_name, owner_user_id from private.offerpsp_providers
  loop
    perform private.offerpsp_register_entity_alias(
      null, v_item.id, 'brand', v_item.brand_name, 'canonical', true, v_item.owner_user_id
    );
    perform private.offerpsp_register_entity_alias(
      null, v_item.id, 'legal_name', v_item.legal_name, 'canonical', true, v_item.owner_user_id
    );
  end loop;
end;
$$;

create or replace function public.get_offerpsp_entity_aliases(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('organization', 'provider') or p_entity_id is null then
    raise exception 'Valid OfferPSP alias target is required';
  end if;
  if p_entity_type = 'organization' and not exists (
    select 1 from public.offerpsp_organizations where id = p_entity_id
  ) then raise exception 'OfferPSP organization not found'; end if;
  if p_entity_type = 'provider' and not exists (
    select 1 from private.offerpsp_providers where id = p_entity_id
  ) then raise exception 'OfferPSP provider not found'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'alias', a.alias,
      'alias_type', a.alias_type,
      'source', a.source,
      'is_primary', a.is_primary,
      'updated_at', a.updated_at
    ) order by a.is_primary desc, a.alias_type, lower(a.alias))
    from private.offerpsp_entity_aliases a
    where (p_entity_type = 'organization' and a.organization_id = p_entity_id)
       or (p_entity_type = 'provider' and a.provider_id = p_entity_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_offerpsp_entity_aliases(
  p_entity_type text,
  p_entity_id uuid,
  p_aliases text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_alias text;
  v_normalized text;
  v_normalized_aliases text[] := array[]::text[];
  v_clean_aliases text[] := array[]::text[];
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('organization', 'provider') or p_entity_id is null then
    raise exception 'Valid OfferPSP alias target is required';
  end if;
  if coalesce(cardinality(p_aliases), 0) > 25 then
    raise exception 'At most 25 OfferPSP aliases are allowed';
  end if;
  if p_entity_type = 'organization' and not exists (
    select 1 from public.offerpsp_organizations where id = p_entity_id
  ) then raise exception 'OfferPSP organization not found'; end if;
  if p_entity_type = 'provider' and not exists (
    select 1 from private.offerpsp_providers where id = p_entity_id
  ) then raise exception 'OfferPSP provider not found'; end if;

  foreach v_alias in array coalesce(p_aliases, array[]::text[]) loop
    v_alias := nullif(trim(v_alias), '');
    if v_alias is null then continue; end if;
    if length(v_alias) > 160 then raise exception 'OfferPSP alias is too long'; end if;
    v_normalized := private.offerpsp_normalize_company_name(v_alias);
    if v_normalized is null or length(v_normalized) < 2 then
      raise exception 'OfferPSP alias is too short after normalization';
    end if;
    if not (v_normalized = any(v_normalized_aliases)) then
      v_normalized_aliases := array_append(v_normalized_aliases, v_normalized);
      v_clean_aliases := array_append(v_clean_aliases, v_alias);
    end if;
  end loop;

  if exists (
    select 1
    from private.offerpsp_entity_aliases a
    where a.normalized_alias = any(v_normalized_aliases)
      and (
        (p_entity_type = 'organization' and a.organization_id is not null and a.organization_id <> p_entity_id)
        or (p_entity_type = 'provider' and a.provider_id is not null and a.provider_id <> p_entity_id)
      )
  ) then raise exception 'OfferPSP alias is already assigned to another entity'; end if;

  delete from private.offerpsp_entity_aliases a
  where a.source = 'staff'
    and ((p_entity_type = 'organization' and a.organization_id = p_entity_id)
      or (p_entity_type = 'provider' and a.provider_id = p_entity_id));

  foreach v_alias in array v_clean_aliases loop
    perform private.offerpsp_register_entity_alias(
      case when p_entity_type = 'organization' then p_entity_id end,
      case when p_entity_type = 'provider' then p_entity_id end,
      'brand', v_alias, 'staff', false, auth.uid()
    );
  end loop;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, after_state
  ) values (
    p_entity_type, p_entity_id::text, 'aliases_updated', auth.uid(),
    jsonb_build_object('aliases', v_clean_aliases)
  );

  return public.get_offerpsp_entity_aliases(p_entity_type, p_entity_id);
end;
$$;

revoke all on function public.get_offerpsp_entity_aliases(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_offerpsp_entity_aliases(text,uuid,text[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_offerpsp_entity_aliases(text,uuid) to authenticated;
grant execute on function public.save_offerpsp_entity_aliases(text,uuid,text[]) to authenticated;

comment on table private.offerpsp_entity_aliases is
  'Private canonical and staff-managed legal, trading, and brand aliases for OfferPSP entities.';
comment on function public.get_offerpsp_entity_aliases(text,uuid) is
  'Staff-only alias registry reader. Provider identity remains private.';
comment on function public.save_offerpsp_entity_aliases(text,uuid,text[]) is
  'Staff-only replacement of additional entity aliases. Canonical and historical aliases are preserved.';

-- Preserve the proven intake implementation and put alias resolution in a thin,
-- service-only wrapper. The wrapper substitutes the canonical company identity
-- only for matching, then restores the submitted spelling in the audit record.
alter function public.upsert_offerpsp_lead_intake(jsonb)
  rename to offerpsp_upsert_lead_intake_without_aliases;
alter function public.offerpsp_upsert_lead_intake_without_aliases(jsonb)
  set schema private;

revoke all on function private.offerpsp_upsert_lead_intake_without_aliases(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.upsert_offerpsp_lead_intake(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  v_original_company text := nullif(trim(p_payload ->> 'company'), '');
  v_original_norm text;
  v_canonical_company text;
  v_canonical_norm text;
  v_effective_payload jsonb := p_payload;
  v_result jsonb;
  v_submission_id uuid;
begin
  if v_role <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;

  v_original_norm := private.offerpsp_normalize_company_name(v_original_company);
  if v_original_norm is not null then
    select coalesce(
      (
        select l.company
        from public.offerpsp_leads l
        where l.merchant_organization_id = a.organization_id
          and l.status <> 'spam'
        order by l.submitted_at, l.lead_id
        limit 1
      ),
      o.name
    )
    into v_canonical_company
    from private.offerpsp_entity_aliases a
    join public.offerpsp_organizations o on o.id = a.organization_id
    where a.normalized_alias = v_original_norm
    limit 1;
  end if;

  v_canonical_norm := private.offerpsp_normalize_company_name(v_canonical_company);
  if v_canonical_norm is not null and v_canonical_norm is distinct from v_original_norm then
    v_effective_payload := jsonb_set(
      p_payload, '{company}', to_jsonb(v_canonical_company), true
    );
  end if;

  v_result := private.offerpsp_upsert_lead_intake_without_aliases(v_effective_payload);
  v_submission_id := nullif(v_result ->> 'submission_id', '')::uuid;

  if v_submission_id is not null
    and v_canonical_norm is not null
    and v_canonical_norm is distinct from v_original_norm then
    update private.offerpsp_intake_submissions set
      submitted_company = v_original_company,
      payload = jsonb_set(payload, '{company}', to_jsonb(v_original_company), true)
    where id = v_submission_id;

    update public.offerpsp_lead_activities set
      metadata = jsonb_set(metadata, '{submitted_company}', to_jsonb(v_original_company), true)
    where metadata ->> 'submission_id' = v_submission_id::text;
  end if;

  return v_result;
end;
$$;

revoke all on function public.upsert_offerpsp_lead_intake(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_offerpsp_lead_intake(jsonb) to service_role;

comment on function public.upsert_offerpsp_lead_intake(jsonb) is
  'Service-only public intake with canonical OfferPSP organization alias resolution.';
