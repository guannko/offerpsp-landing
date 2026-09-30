-- Invite-only PSP portal over the existing private supply model.
-- Providers can manage their own profile and drafts, but only staff can publish supply.

create table if not exists public.offerpsp_provider_memberships (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, user_id)
);

create table if not exists public.offerpsp_provider_offer_drafts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'withdrawn')),
  submitted_batch_id uuid references private.offerpsp_rate_card_batches(id) on delete set null,
  submitted_route_id uuid references private.offerpsp_offer_routes(id) on delete set null,
  submitted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offerpsp_provider_memberships_user_idx
  on public.offerpsp_provider_memberships (user_id, active, provider_id);
create index if not exists offerpsp_provider_offer_drafts_provider_idx
  on public.offerpsp_provider_offer_drafts (provider_id, status, updated_at desc);

alter table public.offerpsp_provider_memberships enable row level security;
alter table public.offerpsp_provider_offer_drafts enable row level security;

revoke all on table public.offerpsp_provider_memberships from public, anon, authenticated;
revoke all on table public.offerpsp_provider_offer_drafts from public, anon, authenticated;

drop trigger if exists offerpsp_provider_memberships_set_updated_at
  on public.offerpsp_provider_memberships;
create trigger offerpsp_provider_memberships_set_updated_at
before update on public.offerpsp_provider_memberships
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_provider_offer_drafts_set_updated_at
  on public.offerpsp_provider_offer_drafts;
create trigger offerpsp_provider_offer_drafts_set_updated_at
before update on public.offerpsp_provider_offer_drafts
for each row execute function public.set_offerpsp_updated_at();

create or replace function private.is_offerpsp_provider_member(
  p_provider_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.offerpsp_provider_memberships membership
      where membership.provider_id = p_provider_id
        and membership.user_id = auth.uid()
        and membership.active
        and (p_roles is null or membership.role = any(p_roles))
    );
$$;

revoke all on function private.is_offerpsp_provider_member(uuid,text[]) from public, anon, authenticated;

create or replace function public.get_offerpsp_provider_members(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then
    raise exception 'PSP provider not found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', membership.id,
      'provider_id', membership.provider_id,
      'user_id', membership.user_id,
      'email', auth_user.email,
      'role', membership.role,
      'active', membership.active,
      'created_at', membership.created_at,
      'updated_at', membership.updated_at
    ) order by membership.active desc, membership.role = 'owner' desc, lower(auth_user.email))
    from public.offerpsp_provider_memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    where membership.provider_id = p_provider_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_offerpsp_provider_member(
  p_provider_id uuid,
  p_member_id uuid default null,
  p_email text default null,
  p_role text default 'editor',
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $$
declare
  v_member public.offerpsp_provider_memberships;
  v_before public.offerpsp_provider_memberships;
  v_user_id uuid;
  v_email text;
  v_action text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then
    raise exception 'PSP provider not found';
  end if;
  if p_role not in ('owner', 'admin', 'editor', 'viewer') then
    raise exception 'Unsupported PSP role';
  end if;

  if p_member_id is null then
    v_email := lower(nullif(trim(p_email), ''));
    if v_email is null then raise exception 'Member email is required'; end if;
    select id into v_user_id from auth.users where lower(email) = v_email;
    if v_user_id is null then
      raise exception 'No Supabase user exists for this email. Invite the user before assigning a role';
    end if;

    select * into v_before
    from public.offerpsp_provider_memberships
    where provider_id = p_provider_id and user_id = v_user_id
    for update;

    if not exists (
      select 1
      from public.offerpsp_provider_memberships owner_member
      where owner_member.provider_id = p_provider_id
        and owner_member.active
        and owner_member.role = 'owner'
    ) and (not p_active or p_role <> 'owner') then
      raise exception 'The first active PSP member must be an owner';
    end if;
    if v_before.id is not null
      and v_before.active
      and v_before.role = 'owner'
      and (not p_active or p_role <> 'owner')
      and not exists (
        select 1 from public.offerpsp_provider_memberships other
        where other.provider_id = p_provider_id
          and other.id <> v_before.id
          and other.active
          and other.role = 'owner'
      )
    then
      raise exception 'PSP workspace must keep at least one active owner';
    end if;

    insert into public.offerpsp_provider_memberships(
      provider_id, user_id, role, active, created_by
    ) values (
      p_provider_id, v_user_id, p_role, p_active, auth.uid()
    )
    on conflict (provider_id, user_id) do update
    set role = excluded.role,
        active = excluded.active
    returning * into v_member;
    v_action := case when v_before.id is null then 'provider_member_added' else 'provider_member_updated' end;
  else
    select * into v_before
    from public.offerpsp_provider_memberships
    where id = p_member_id and provider_id = p_provider_id
    for update;
    if not found then raise exception 'PSP member not found'; end if;

    if v_before.active and v_before.role = 'owner'
      and (not p_active or p_role <> 'owner')
      and not exists (
        select 1 from public.offerpsp_provider_memberships other
        where other.provider_id = p_provider_id
          and other.id <> v_before.id
          and other.active
          and other.role = 'owner'
      )
    then
      raise exception 'PSP workspace must keep at least one active owner';
    end if;

    update public.offerpsp_provider_memberships
    set role = p_role,
        active = p_active
    where id = v_before.id
    returning * into v_member;
    v_action := case when p_active then 'provider_member_updated' else 'provider_member_deactivated' end;
  end if;

  select email into v_email from auth.users where id = v_member.user_id;
  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state, after_state
  ) values (
    'provider', p_provider_id::text, v_action, auth.uid(),
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_member) || jsonb_build_object('email', v_email)
  );

  return jsonb_build_object(
    'id', v_member.id,
    'provider_id', v_member.provider_id,
    'user_id', v_member.user_id,
    'email', v_email,
    'role', v_member.role,
    'active', v_member.active,
    'updated_at', v_member.updated_at
  );
end;
$$;

create or replace function public.list_offerpsp_my_provider_workspaces()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'provider_id', provider.id,
      'internal_code', provider.internal_code,
      'brand_name', provider.brand_name,
      'legal_name', provider.legal_name,
      'website', provider.website,
      'relationship_status', provider.relationship_status,
      'last_verified_at', provider.last_verified_at,
      'role', membership.role,
      'draft_count', (
        select count(*) from public.offerpsp_provider_offer_drafts draft
        where draft.provider_id = provider.id and draft.status = 'draft'
      ),
      'review_count', (
        select count(*) from private.offerpsp_offer_routes route
        where route.provider_id = provider.id and route.status in ('draft', 'review')
      ),
      'published_count', (
        select count(*) from private.offerpsp_offer_routes route
        where route.provider_id = provider.id and route.status = 'published'
      ),
      'paused_count', (
        select count(*) from private.offerpsp_offer_routes route
        where route.provider_id = provider.id and route.status = 'paused'
      )
    ) order by provider.brand_name)
    from public.offerpsp_provider_memberships membership
    join private.offerpsp_providers provider on provider.id = membership.provider_id
    where membership.user_id = auth.uid()
      and membership.active
      and provider.relationship_status <> 'archived'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_offerpsp_provider_portal_workspace(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.is_offerpsp_provider_member(p_provider_id) then
    raise exception 'PSP workspace access required';
  end if;

  return jsonb_build_object(
    'provider', (
      select jsonb_build_object(
        'id', provider.id,
        'internal_code', provider.internal_code,
        'brand_name', provider.brand_name,
        'legal_name', provider.legal_name,
        'website', provider.website,
        'relationship_status', provider.relationship_status,
        'last_verified_at', provider.last_verified_at,
        'created_at', provider.created_at,
        'updated_at', provider.updated_at
      )
      from private.offerpsp_providers provider
      where provider.id = p_provider_id
    ),
    'membership', (
      select jsonb_build_object('id', membership.id, 'role', membership.role)
      from public.offerpsp_provider_memberships membership
      where membership.provider_id = p_provider_id
        and membership.user_id = auth.uid()
        and membership.active
    ),
    'drafts', coalesce((
      select jsonb_agg(to_jsonb(draft) order by draft.updated_at desc)
      from public.offerpsp_provider_offer_drafts draft
      where draft.provider_id = p_provider_id
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(
        (to_jsonb(route) - 'raw_block') || jsonb_build_object(
          'batch_version', batch.batch_version,
          'batch_status', batch.status,
          'source_effective_date', batch.source_effective_date,
          'fees', coalesce((
            select jsonb_agg(to_jsonb(fee) order by fee.flow, fee.created_at)
            from private.offerpsp_offer_fee_components fee
            where fee.route_id = route.id
          ), '[]'::jsonb),
          'limits', coalesce((
            select jsonb_agg(to_jsonb(route_limit) order by route_limit.flow, route_limit.currency)
            from private.offerpsp_offer_limits route_limit
            where route_limit.route_id = route.id
          ), '[]'::jsonb),
          'settlements', coalesce((
            select jsonb_agg(to_jsonb(settlement) order by settlement.created_at)
            from private.offerpsp_settlement_terms settlement
            where settlement.route_id = route.id
          ), '[]'::jsonb),
          'is_stale', (
            (route.expires_at is not null and route.expires_at < current_date)
            or not exists (
              select 1
              from private.offerpsp_providers verified_provider
              where verified_provider.id = route.provider_id
                and verified_provider.last_verified_at is not null
                and verified_provider.last_verified_at
                  + make_interval(days => route.freshness_days) >= now()
            )
          )
        ) order by route.updated_at desc
      )
      from private.offerpsp_offer_routes route
      join private.offerpsp_rate_card_batches batch on batch.id = route.batch_id
      where route.provider_id = p_provider_id
        and route.status <> 'archived'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_offerpsp_provider_portal_profile(
  p_provider_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_providers;
  v_after private.offerpsp_providers;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin']) then
    raise exception 'PSP owner or admin access required';
  end if;
  select * into v_before from private.offerpsp_providers where id = p_provider_id for update;
  if not found then raise exception 'PSP provider not found'; end if;
  if nullif(trim(p_payload ->> 'brand_name'), '') is null then
    raise exception 'PSP brand name is required';
  end if;

  update private.offerpsp_providers
  set brand_name = trim(p_payload ->> 'brand_name'),
      legal_name = nullif(trim(p_payload ->> 'legal_name'), ''),
      website = nullif(trim(p_payload ->> 'website'), ''),
      updated_at = now()
  where id = p_provider_id
  returning * into v_after;

  insert into private.offerpsp_supply_activities(
    provider_id, actor_user_id, action_type, summary, before_state, after_state
  ) values (
    p_provider_id, auth.uid(), 'provider_profile_updated',
    'PSP profile updated through provider portal', to_jsonb(v_before), to_jsonb(v_after)
  );

  return jsonb_build_object(
    'id', v_after.id,
    'brand_name', v_after.brand_name,
    'legal_name', v_after.legal_name,
    'website', v_after.website,
    'relationship_status', v_after.relationship_status,
    'last_verified_at', v_after.last_verified_at,
    'updated_at', v_after.updated_at
  );
end;
$$;

create or replace function public.save_offerpsp_provider_offer_draft(
  p_provider_id uuid,
  p_draft_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.offerpsp_provider_offer_drafts;
  v_title text := nullif(trim(p_payload ->> 'client_title'), '');
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP editor access required';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Offer payload must be a JSON object';
  end if;
  if v_title is null then raise exception 'Offer title is required'; end if;

  if p_draft_id is null then
    insert into public.offerpsp_provider_offer_drafts(
      provider_id, title, payload, created_by, updated_by
    ) values (
      p_provider_id, v_title, p_payload, auth.uid(), auth.uid()
    ) returning * into v_draft;
  else
    select * into v_draft
    from public.offerpsp_provider_offer_drafts
    where id = p_draft_id and provider_id = p_provider_id
    for update;
    if not found then raise exception 'PSP offer draft not found'; end if;
    if v_draft.status <> 'draft' then raise exception 'Only a draft offer can be edited'; end if;

    update public.offerpsp_provider_offer_drafts
    set title = v_title,
        payload = p_payload,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_draft_id
    returning * into v_draft;
  end if;

  return to_jsonb(v_draft);
end;
$$;

create or replace function public.withdraw_offerpsp_provider_offer_draft(
  p_provider_id uuid,
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.offerpsp_provider_offer_drafts;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP editor access required';
  end if;
  update public.offerpsp_provider_offer_drafts
  set status = 'withdrawn', updated_by = auth.uid(), updated_at = now()
  where id = p_draft_id and provider_id = p_provider_id and status = 'draft'
  returning * into v_draft;
  if not found then raise exception 'Editable PSP offer draft not found'; end if;
  return to_jsonb(v_draft);
end;
$$;

create or replace function public.submit_offerpsp_provider_offer_draft(
  p_provider_id uuid,
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.offerpsp_provider_offer_drafts;
  v_payload jsonb;
  v_batch private.offerpsp_rate_card_batches;
  v_route private.offerpsp_offer_routes;
  v_batch_version integer;
  v_flow text;
  v_coverage_mode text;
  v_coverage_scope text;
  v_geos text[];
  v_blocked_geos text[];
  v_currencies text[];
  v_methods text[];
  v_card_brands text[];
  v_traffic_types text[];
  v_verticals text[];
  v_prohibited_verticals text[];
  v_integrations text[];
  v_fee jsonb;
  v_limit jsonb;
  v_settlement jsonb;
  v_fee_count integer := 0;
  v_percent numeric;
  v_fixed numeric;
  v_fixed_currency text;
  v_minimum numeric;
  v_maximum numeric;
  v_settlement_percent numeric;
  v_settlement_fixed numeric;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP editor access required';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('offerpsp-provider-batch:' || p_provider_id::text, 0)
  );

  select * into v_draft
  from public.offerpsp_provider_offer_drafts
  where id = p_draft_id and provider_id = p_provider_id
  for update;
  if not found then raise exception 'PSP offer draft not found'; end if;
  if v_draft.status <> 'draft' then raise exception 'Only a draft offer can be submitted'; end if;

  v_payload := v_draft.payload;
  v_flow := coalesce(nullif(lower(trim(v_payload ->> 'flow')), ''), 'payin');
  v_coverage_mode := coalesce(nullif(lower(trim(v_payload ->> 'coverage_mode')), ''), 'specific');
  if v_flow not in ('payin','payout','both') then raise exception 'Unsupported offer flow'; end if;
  if v_coverage_mode not in ('specific','regional','allowlist','global_except') then
    raise exception 'Unsupported coverage mode';
  end if;

  v_geos := private.offerpsp_jsonb_text_array(v_payload -> 'geos');
  v_blocked_geos := private.offerpsp_jsonb_text_array(v_payload -> 'blocked_geos');
  v_currencies := private.offerpsp_jsonb_text_array(v_payload -> 'currencies');
  v_methods := private.offerpsp_jsonb_text_array(v_payload -> 'methods');
  v_card_brands := private.offerpsp_jsonb_text_array(v_payload -> 'card_brands');
  v_traffic_types := private.offerpsp_jsonb_text_array(v_payload -> 'traffic_types');
  v_verticals := private.offerpsp_jsonb_text_array(v_payload -> 'verticals');
  v_prohibited_verticals := private.offerpsp_jsonb_text_array(v_payload -> 'prohibited_verticals');
  v_integrations := private.offerpsp_jsonb_text_array(v_payload -> 'integrations');
  if cardinality(v_currencies) = 0 then raise exception 'At least one currency is required'; end if;
  if cardinality(v_methods) = 0 then raise exception 'At least one payment method is required'; end if;
  if v_coverage_mode in ('specific','allowlist') and cardinality(v_geos) = 0 then
    raise exception 'At least one GEO is required for this coverage mode';
  end if;
  if jsonb_typeof(coalesce(v_payload -> 'fees', '[]'::jsonb)) <> 'array' then
    raise exception 'Fees must be a JSON array';
  end if;

  select coalesce(max(batch_version), 0) + 1
  into v_batch_version
  from private.offerpsp_rate_card_batches
  where provider_id = p_provider_id;

  insert into private.offerpsp_rate_card_batches(
    provider_id, batch_version, source_type, source_reference, source_text,
    source_effective_date, status, parser_version, parser_metadata, created_by
  ) values (
    p_provider_id,
    v_batch_version,
    'manual',
    'PSP portal draft ' || p_draft_id::text,
    v_payload::text,
    nullif(trim(v_payload ->> 'source_effective_date'), '')::date,
    'review',
    'provider-portal-v1',
    jsonb_build_object('provider_portal', true, 'draft_id', p_draft_id),
    auth.uid()
  ) returning * into v_batch;

  v_coverage_scope := case
    when v_coverage_mode = 'global_except' then 'global'
    when v_coverage_mode in ('regional','allowlist') then 'regional'
    else 'specific'
  end;

  insert into private.offerpsp_offer_routes(
    provider_id, batch_id, client_title, coverage_scope, coverage_mode,
    geos, blocked_geos, currencies, flow, methods, card_brands, traffic_types,
    verticals, prohibited_verticals, integrations, status, effective_from, expires_at,
    freshness_days, min_monthly_volume, max_monthly_volume, volume_currency,
    risk_terms, operational_notes, raw_block
  ) values (
    p_provider_id,
    v_batch.id,
    trim(v_payload ->> 'client_title'),
    v_coverage_scope,
    v_coverage_mode,
    v_geos,
    v_blocked_geos,
    v_currencies,
    v_flow,
    v_methods,
    v_card_brands,
    v_traffic_types,
    v_verticals,
    v_prohibited_verticals,
    v_integrations,
    'review',
    nullif(trim(v_payload ->> 'effective_from'), '')::date,
    nullif(trim(v_payload ->> 'expires_at'), '')::date,
    greatest(1, coalesce(private.offerpsp_jsonb_numeric(v_payload, 'freshness_days')::integer, 30)),
    private.offerpsp_jsonb_numeric(v_payload, 'min_monthly_volume'),
    private.offerpsp_jsonb_numeric(v_payload, 'max_monthly_volume'),
    nullif(upper(trim(v_payload ->> 'volume_currency')), ''),
    case when jsonb_typeof(v_payload -> 'risk_terms') = 'object' then v_payload -> 'risk_terms' else '{}'::jsonb end,
    nullif(trim(v_payload ->> 'operational_notes'), ''),
    v_payload::text
  ) returning * into v_route;

  for v_fee in select value from jsonb_array_elements(coalesce(v_payload -> 'fees', '[]'::jsonb))
  loop
    v_percent := private.offerpsp_jsonb_numeric(v_fee, 'percent');
    v_fixed := private.offerpsp_jsonb_numeric(v_fee, 'fixed');
    if v_percent is null and v_fixed is null then continue; end if;
    if v_percent is not null and (v_percent < 0 or v_percent > 100) then
      raise exception 'Fee percent must be between 0 and 100';
    end if;
    if v_fixed is not null and v_fixed < 0 then
      raise exception 'Fixed fee cannot be negative';
    end if;
    if coalesce(nullif(lower(trim(v_fee ->> 'flow')), ''), v_flow) not in
      ('payin','payout','settlement','refund','chargeback','decline') then
      raise exception 'Unsupported fee flow';
    end if;
    if coalesce(nullif(lower(trim(v_fee ->> 'applies_on')), ''), 'success') not in
      ('success','decline','both','event') then
      raise exception 'Unsupported fee application rule';
    end if;
    v_fixed_currency := coalesce(
      nullif(upper(trim(v_fee ->> 'fixed_currency')), ''),
      case when v_fixed is not null then v_currencies[1] else null end
    );
    insert into private.offerpsp_offer_fee_components(
      route_id, flow, traffic_tier, method_scope, region_scope, fee_type,
      base_percent, base_fixed, base_fixed_currency, applies_on, source_text
    ) values (
      v_route.id,
      coalesce(nullif(lower(trim(v_fee ->> 'flow')), ''), case when v_flow = 'both' then 'payin' else v_flow end),
      nullif(trim(v_fee ->> 'traffic_tier'), ''),
      private.offerpsp_jsonb_text_array(v_fee -> 'method_scope'),
      private.offerpsp_jsonb_text_array(v_fee -> 'region_scope'),
      case when v_percent is not null and v_fixed is not null then 'percent_plus_fixed'
           when v_percent is not null then 'percent' else 'fixed' end,
      v_percent,
      v_fixed,
      v_fixed_currency,
      coalesce(nullif(lower(trim(v_fee ->> 'applies_on')), ''), 'success'),
      v_fee::text
    );
    v_fee_count := v_fee_count + 1;
  end loop;
  if v_fee_count = 0 then raise exception 'At least one valid fee is required'; end if;

  if jsonb_typeof(coalesce(v_payload -> 'limits', '[]'::jsonb)) <> 'array' then
    raise exception 'Limits must be a JSON array';
  end if;
  for v_limit in select value from jsonb_array_elements(coalesce(v_payload -> 'limits', '[]'::jsonb))
  loop
    if nullif(upper(trim(v_limit ->> 'currency')), '') is null then continue; end if;
    v_minimum := private.offerpsp_jsonb_numeric(v_limit, 'minimum_amount');
    v_maximum := private.offerpsp_jsonb_numeric(v_limit, 'maximum_amount');
    if (v_minimum is not null and v_minimum < 0)
      or (v_maximum is not null and v_maximum < 0) then
      raise exception 'Offer limits cannot be negative';
    end if;
    if v_minimum is not null and v_maximum is not null and v_maximum < v_minimum then
      raise exception 'Offer maximum limit cannot be lower than minimum';
    end if;
    insert into private.offerpsp_offer_limits(
      route_id, flow, scope, method_scope, traffic_tier, currency,
      minimum_amount, maximum_amount, maximum_count, original_note
    ) values (
      v_route.id,
      coalesce(nullif(lower(trim(v_limit ->> 'flow')), ''), v_flow),
      coalesce(nullif(lower(trim(v_limit ->> 'scope')), ''), 'transaction'),
      private.offerpsp_jsonb_text_array(v_limit -> 'method_scope'),
      nullif(trim(v_limit ->> 'traffic_tier'), ''),
      upper(trim(v_limit ->> 'currency')),
      v_minimum,
      v_maximum,
      private.offerpsp_jsonb_numeric(v_limit, 'maximum_count')::integer,
      nullif(trim(v_limit ->> 'note'), '')
    );
  end loop;

  if jsonb_typeof(coalesce(v_payload -> 'settlements', '[]'::jsonb)) <> 'array' then
    raise exception 'Settlements must be a JSON array';
  end if;
  for v_settlement in select value from jsonb_array_elements(coalesce(v_payload -> 'settlements', '[]'::jsonb))
  loop
    v_settlement_percent := private.offerpsp_jsonb_numeric(v_settlement, 'fee_percent');
    v_settlement_fixed := private.offerpsp_jsonb_numeric(v_settlement, 'fixed_fee');
    v_minimum := private.offerpsp_jsonb_numeric(v_settlement, 'minimum_amount');
    if v_settlement_percent is not null and (v_settlement_percent < 0 or v_settlement_percent > 100) then
      raise exception 'Settlement fee percent must be between 0 and 100';
    end if;
    if (v_settlement_fixed is not null and v_settlement_fixed < 0)
      or (v_minimum is not null and v_minimum < 0) then
      raise exception 'Settlement amounts cannot be negative';
    end if;
    insert into private.offerpsp_settlement_terms(
      route_id, currency, fee_percent, fixed_fee, fixed_fee_currency, period,
      minimum_amount, exchange_source, exchange_rule, weekdays, netting_percent,
      liquidity_requirement, original_note
    ) values (
      v_route.id,
      nullif(upper(trim(v_settlement ->> 'currency')), ''),
      v_settlement_percent,
      v_settlement_fixed,
      nullif(upper(trim(v_settlement ->> 'fixed_fee_currency')), ''),
      nullif(trim(v_settlement ->> 'period'), ''),
      v_minimum,
      nullif(trim(v_settlement ->> 'exchange_source'), ''),
      nullif(trim(v_settlement ->> 'exchange_rule'), ''),
      private.offerpsp_jsonb_text_array(v_settlement -> 'weekdays'),
      private.offerpsp_jsonb_numeric(v_settlement, 'netting_percent'),
      nullif(trim(v_settlement ->> 'liquidity_requirement'), ''),
      nullif(trim(v_settlement ->> 'note'), '')
    );
  end loop;

  update public.offerpsp_provider_offer_drafts
  set status = 'submitted',
      submitted_batch_id = v_batch.id,
      submitted_route_id = v_route.id,
      submitted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_draft_id;

  insert into private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, after_state
  ) values (
    p_provider_id, v_route.id, v_batch.id, auth.uid(),
    'provider_offer_submitted', 'PSP submitted an offer for staff review',
    jsonb_build_object('draft_id', p_draft_id, 'route_id', v_route.id, 'batch_id', v_batch.id)
  );

  return jsonb_build_object(
    'draft_id', p_draft_id,
    'batch_id', v_batch.id,
    'route_id', v_route.id,
    'route_code', v_route.internal_code,
    'status', v_route.status
  );
exception
  when others then
    raise;
end;
$$;

create or replace function public.pause_offerpsp_provider_route(
  p_provider_id uuid,
  p_route_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_offer_routes;
  v_after private.offerpsp_offer_routes;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP editor access required';
  end if;
  select * into v_before
  from private.offerpsp_offer_routes
  where id = p_route_id and provider_id = p_provider_id
  for update;
  if not found then raise exception 'PSP offer route not found'; end if;
  if v_before.status = 'paused' then return to_jsonb(v_before) - 'raw_block'; end if;
  if v_before.status <> 'published' then raise exception 'Only a published offer can be paused'; end if;

  update private.offerpsp_offer_routes
  set status = 'paused', updated_at = now()
  where id = p_route_id
  returning * into v_after;

  insert into private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state
  ) values (
    p_provider_id, p_route_id, v_after.batch_id, auth.uid(),
    'provider_route_paused', coalesce(nullif(trim(p_reason), ''), 'PSP paused the offer'),
    to_jsonb(v_before), to_jsonb(v_after)
  );
  return to_jsonb(v_after) - 'raw_block';
end;
$$;

create or replace function public.confirm_offerpsp_provider_portal_freshness(p_provider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_provider private.offerpsp_providers;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP editor access required';
  end if;
  update private.offerpsp_providers
  set last_verified_at = now(), updated_at = now()
  where id = p_provider_id
  returning * into v_provider;
  if not found then raise exception 'PSP provider not found'; end if;

  insert into private.offerpsp_supply_activities(
    provider_id, actor_user_id, action_type, summary, after_state
  ) values (
    p_provider_id, auth.uid(), 'provider_freshness_confirmed',
    'PSP confirmed its current offer terms through provider portal',
    jsonb_build_object('last_verified_at', v_provider.last_verified_at)
  );
  return jsonb_build_object(
    'provider_id', v_provider.id,
    'last_verified_at', v_provider.last_verified_at
  );
end;
$$;

revoke all on function public.get_offerpsp_provider_members(uuid) from public, anon;
revoke all on function public.save_offerpsp_provider_member(uuid,uuid,text,text,boolean) from public, anon;
revoke all on function public.list_offerpsp_my_provider_workspaces() from public, anon;
revoke all on function public.get_offerpsp_provider_portal_workspace(uuid) from public, anon;
revoke all on function public.save_offerpsp_provider_portal_profile(uuid,jsonb) from public, anon;
revoke all on function public.save_offerpsp_provider_offer_draft(uuid,uuid,jsonb) from public, anon;
revoke all on function public.withdraw_offerpsp_provider_offer_draft(uuid,uuid) from public, anon;
revoke all on function public.submit_offerpsp_provider_offer_draft(uuid,uuid) from public, anon;
revoke all on function public.pause_offerpsp_provider_route(uuid,uuid,text) from public, anon;
revoke all on function public.confirm_offerpsp_provider_portal_freshness(uuid) from public, anon;

grant execute on function public.get_offerpsp_provider_members(uuid) to authenticated;
grant execute on function public.save_offerpsp_provider_member(uuid,uuid,text,text,boolean) to authenticated;
grant execute on function public.list_offerpsp_my_provider_workspaces() to authenticated;
grant execute on function public.get_offerpsp_provider_portal_workspace(uuid) to authenticated;
grant execute on function public.save_offerpsp_provider_portal_profile(uuid,jsonb) to authenticated;
grant execute on function public.save_offerpsp_provider_offer_draft(uuid,uuid,jsonb) to authenticated;
grant execute on function public.withdraw_offerpsp_provider_offer_draft(uuid,uuid) to authenticated;
grant execute on function public.submit_offerpsp_provider_offer_draft(uuid,uuid) to authenticated;
grant execute on function public.pause_offerpsp_provider_route(uuid,uuid,text) to authenticated;
grant execute on function public.confirm_offerpsp_provider_portal_freshness(uuid) to authenticated;

comment on table public.offerpsp_provider_memberships is
  'Invite-only authenticated membership for one private OfferPSP provider workspace.';
comment on table public.offerpsp_provider_offer_drafts is
  'Provider-owned editable offer staging. Submission creates immutable private supply for staff review.';
comment on function public.submit_offerpsp_provider_offer_draft(uuid,uuid) is
  'Provider-scoped submission into private review supply. Never publishes an offer and never exposes OfferPSP margins.';
