alter table public.offerpsp_leads
  add column if not exists record_state text not null default 'active'
    check (record_state in ('active', 'archived')),
  add column if not exists status_before_archive text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table private.offerpsp_providers
  add column if not exists relationship_tier text not null default 'standard'
    check (relationship_tier in ('top', 'core', 'standard', 'watchlist')),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.offerpsp_organizations
  add column if not exists relationship_tier text not null default 'standard'
    check (relationship_tier in ('top', 'core', 'standard', 'watchlist')),
  add column if not exists relationship_notes text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table private.offerpsp_offer_routes
  add column if not exists revision_of_route_id uuid references private.offerpsp_offer_routes(id) on delete set null;

create index if not exists offerpsp_leads_record_state_idx
  on public.offerpsp_leads (record_state, submitted_at desc);
create index if not exists offerpsp_provider_tier_idx
  on private.offerpsp_providers (relationship_tier, relationship_status, strategic_priority desc);
create index if not exists offerpsp_organization_registry_idx
  on public.offerpsp_organizations (organization_type, status, relationship_tier, updated_at desc);
create index if not exists offerpsp_route_revision_idx
  on private.offerpsp_offer_routes (revision_of_route_id, created_at desc);

create table if not exists private.offerpsp_entity_audit (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('merchant', 'provider', 'offer', 'organization', 'agent_assignment', 'margin_policy')),
  entity_id text not null,
  action_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offerpsp_entity_audit_lookup_idx
  on private.offerpsp_entity_audit (entity_type, entity_id, created_at desc);

revoke all on private.offerpsp_entity_audit from public, anon, authenticated;

create or replace function public.get_offerpsp_management_registry()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return jsonb_build_object(
    'merchants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lead_id', l.lead_id,
        'company', l.company,
        'name', l.name,
        'work_email', l.work_email,
        'telegram', l.telegram,
        'company_url', l.company_url,
        'vertical', l.vertical,
        'status', l.status,
        'record_state', l.record_state,
        'archive_reason', l.archive_reason,
        'archived_at', l.archived_at,
        'merchant_organization_id', l.merchant_organization_id,
        'agent_organization_id', l.agent_organization_id,
        'submitted_at', l.submitted_at,
        'updated_at', l.updated_at
      ) order by (l.record_state = 'active') desc, l.submitted_at desc)
      from public.offerpsp_leads l
    ), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'internal_code', p.internal_code,
        'brand_name', p.brand_name,
        'legal_name', p.legal_name,
        'website', p.website,
        'relationship_status', p.relationship_status,
        'relationship_tier', p.relationship_tier,
        'strategic_priority', p.strategic_priority,
        'margin_included_default', p.margin_included_default,
        'relationship_notes', p.relationship_notes,
        'last_verified_at', p.last_verified_at,
        'route_count', (select count(*) from private.offerpsp_offer_routes r where r.provider_id = p.id),
        'published_route_count', (select count(*) from private.offerpsp_offer_routes r where r.provider_id = p.id and r.status = 'published'),
        'active_margin_count', (select count(*) from private.offerpsp_margin_policies mp where mp.provider_id = p.id and mp.active)
      ) order by p.relationship_status = 'active' desc, p.strategic_priority desc, p.brand_name)
      from private.offerpsp_providers p
    ), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'internal_code', o.internal_code,
        'organization_type', o.organization_type,
        'name', o.name,
        'legal_name', o.legal_name,
        'status', o.status,
        'relationship_tier', o.relationship_tier,
        'relationship_notes', o.relationship_notes,
        'member_count', (select count(*) from public.offerpsp_organization_members om where om.organization_id = o.id and om.active),
        'merchant_count', case when o.organization_type = 'agent' then (
          select count(*) from public.offerpsp_agent_clients ac where ac.agent_organization_id = o.id and ac.status = 'active'
        ) else null end,
        'updated_at', o.updated_at
      ) order by o.organization_type, o.status = 'active' desc, o.name)
      from public.offerpsp_organizations o
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ac.id,
        'agent_organization_id', ac.agent_organization_id,
        'agent_name', a.name,
        'merchant_organization_id', ac.merchant_organization_id,
        'merchant_name', m.name,
        'status', ac.status,
        'updated_at', ac.updated_at
      ) order by ac.status = 'active' desc, a.name, m.name)
      from public.offerpsp_agent_clients ac
      join public.offerpsp_organizations a on a.id = ac.agent_organization_id
      join public.offerpsp_organizations m on m.id = ac.merchant_organization_id
    ), '[]'::jsonb),
    'agent_margin_policies', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.active desc, mp.created_at desc)
      from private.offerpsp_agent_margin_policies mp
    ), '[]'::jsonb),
    'commission_summary', coalesce((
      select jsonb_object_agg(status, count)
      from (
        select status, count(*)::integer as count
        from private.offerpsp_agent_commissions
        group by status
      ) s
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.save_offerpsp_managed_provider(
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
  v_status text;
  v_tier text;
  v_priority integer;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Provider payload must be an object'; end if;
  if nullif(trim(p_payload ->> 'brand_name'), '') is null and p_provider_id is null then raise exception 'Provider brand name is required'; end if;

  v_status := coalesce(nullif(trim(p_payload ->> 'relationship_status'), ''), 'prospect');
  v_tier := coalesce(nullif(trim(p_payload ->> 'relationship_tier'), ''), 'standard');
  v_priority := coalesce(private.offerpsp_jsonb_numeric(p_payload, 'strategic_priority')::integer, 50);
  if v_status not in ('prospect', 'onboarding', 'active', 'paused', 'archived') then raise exception 'Unsupported provider relationship status'; end if;
  if v_tier not in ('top', 'core', 'standard', 'watchlist') then raise exception 'Unsupported provider tier'; end if;
  if v_priority not between 0 and 100 then raise exception 'Strategic priority must be between 0 and 100'; end if;

  if p_provider_id is null then
    insert into private.offerpsp_providers (
      brand_name, legal_name, website, relationship_status, relationship_tier,
      strategic_priority, margin_included_default, relationship_notes, owner_user_id,
      archived_at, archived_by
    ) values (
      trim(p_payload ->> 'brand_name'), nullif(trim(p_payload ->> 'legal_name'), ''),
      nullif(trim(p_payload ->> 'website'), ''), v_status, v_tier, v_priority,
      coalesce((p_payload ->> 'margin_included_default')::boolean, false),
      nullif(trim(p_payload ->> 'relationship_notes'), ''), auth.uid(),
      case when v_status = 'archived' then now() else null end,
      case when v_status = 'archived' then auth.uid() else null end
    ) returning * into v_after;
  else
    select * into v_before from private.offerpsp_providers where id = p_provider_id for update;
    if not found then raise exception 'PSP provider not found'; end if;
    v_status := coalesce(nullif(trim(p_payload ->> 'relationship_status'), ''), v_before.relationship_status);
    v_tier := coalesce(nullif(trim(p_payload ->> 'relationship_tier'), ''), v_before.relationship_tier);
    v_priority := coalesce(private.offerpsp_jsonb_numeric(p_payload, 'strategic_priority')::integer, v_before.strategic_priority);
    update private.offerpsp_providers
    set brand_name = coalesce(nullif(trim(p_payload ->> 'brand_name'), ''), brand_name),
        legal_name = case when p_payload ? 'legal_name' then nullif(trim(p_payload ->> 'legal_name'), '') else legal_name end,
        website = case when p_payload ? 'website' then nullif(trim(p_payload ->> 'website'), '') else website end,
        relationship_status = v_status,
        relationship_tier = v_tier,
        strategic_priority = v_priority,
        margin_included_default = coalesce((p_payload ->> 'margin_included_default')::boolean, margin_included_default),
        relationship_notes = case when p_payload ? 'relationship_notes' then nullif(trim(p_payload ->> 'relationship_notes'), '') else relationship_notes end,
        archived_at = case when v_status = 'archived' then coalesce(archived_at, now()) else null end,
        archived_by = case when v_status = 'archived' then coalesce(archived_by, auth.uid()) else null end,
        updated_at = now()
    where id = p_provider_id returning * into v_after;
  end if;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('provider', v_after.id::text, case when p_provider_id is null then 'created' else 'updated' end, auth.uid(),
    case when p_provider_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after));
  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, before_state, after_state)
  values (v_after.id, auth.uid(), case when p_provider_id is null then 'provider_created' else 'provider_updated' end,
    case when p_provider_id is null then 'PSP created manually' else 'PSP profile updated' end,
    case when p_provider_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after));
  return to_jsonb(v_after) - 'legacy_psp_id' - 'owner_user_id' - 'archived_by';
end;
$$;

create or replace function public.save_offerpsp_managed_merchant(
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before public.offerpsp_leads;
  v_after public.offerpsp_leads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Merchant payload must be an object'; end if;
  select * into v_before from public.offerpsp_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'OfferPSP merchant not found'; end if;

  update public.offerpsp_leads
  set company = coalesce(nullif(trim(p_payload ->> 'company'), ''), company),
      name = coalesce(nullif(trim(p_payload ->> 'name'), ''), name),
      work_email = coalesce(nullif(lower(trim(p_payload ->> 'work_email')), ''), work_email),
      telegram = case when p_payload ? 'telegram' then nullif(trim(p_payload ->> 'telegram'), '') else telegram end,
      company_url = case when p_payload ? 'company_url' then nullif(trim(p_payload ->> 'company_url'), '') else company_url end,
      vertical = coalesce(nullif(trim(p_payload ->> 'vertical'), ''), vertical),
      monthly_volume = case when p_payload ? 'monthly_volume' then nullif(trim(p_payload ->> 'monthly_volume'), '') else monthly_volume end,
      geos = coalesce(nullif(trim(p_payload ->> 'geos'), ''), geos),
      methods = case when p_payload ? 'methods' then nullif(trim(p_payload ->> 'methods'), '') else methods end,
      details = case when p_payload ? 'details' then nullif(trim(p_payload ->> 'details'), '') else details end,
      merchant_organization_id = case when p_payload ? 'merchant_organization_id' then nullif(trim(p_payload ->> 'merchant_organization_id'), '')::uuid else merchant_organization_id end,
      agent_organization_id = case when p_payload ? 'agent_organization_id' then nullif(trim(p_payload ->> 'agent_organization_id'), '')::uuid else agent_organization_id end,
      updated_at = now()
  where lead_id = p_lead_id returning * into v_after;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('merchant', p_lead_id::text, 'updated', auth.uid(), to_jsonb(v_before), to_jsonb(v_after));
  insert into public.offerpsp_lead_activities(lead_id, actor_user_id, actor_type, activity_type, title, metadata)
  values (p_lead_id, auth.uid(), 'staff', 'merchant_record_updated', 'Merchant record updated',
    jsonb_build_object('changed_fields', (select jsonb_object_agg(key, value) from jsonb_each(p_payload))));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.set_offerpsp_merchant_record_state(
  p_lead_id uuid,
  p_record_state text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before public.offerpsp_leads;
  v_after public.offerpsp_leads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_record_state not in ('active', 'archived') then raise exception 'Unsupported merchant record state'; end if;
  if p_record_state = 'archived' and nullif(trim(p_reason), '') is null then raise exception 'Archive reason is required'; end if;
  select * into v_before from public.offerpsp_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'OfferPSP merchant not found'; end if;

  update public.offerpsp_leads
  set record_state = p_record_state,
      status_before_archive = case when p_record_state = 'archived' and record_state = 'active' then status else status_before_archive end,
      status = case when p_record_state = 'archived' then 'closed' else coalesce(status_before_archive, 'new') end,
      archived_at = case when p_record_state = 'archived' then now() else null end,
      archived_by = case when p_record_state = 'archived' then auth.uid() else null end,
      archive_reason = case when p_record_state = 'archived' then trim(p_reason) else null end,
      updated_at = now()
  where lead_id = p_lead_id returning * into v_after;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, reason, before_state, after_state)
  values ('merchant', p_lead_id::text, p_record_state, auth.uid(), nullif(trim(p_reason), ''), to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.purge_offerpsp_merchant(
  p_lead_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead public.offerpsp_leads;
  v_dossier_id uuid;
begin
  if not exists (
    select 1 from public.offerpsp_staff_members
    where user_id = auth.uid() and active and role = 'owner'
  ) then raise exception 'Only an active OfferPSP owner can permanently delete merchants'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'OfferPSP merchant not found'; end if;
  if v_lead.record_state <> 'archived' then raise exception 'Archive the merchant before permanent deletion'; end if;
  if p_confirmation is distinct from ('DELETE ' || v_lead.company) then raise exception 'Permanent deletion confirmation does not match'; end if;
  if exists (
    select 1 from private.offerpsp_agent_commissions
    where lead_id = p_lead_id and status <> 'void'
  ) then raise exception 'Merchant has commission history and can only remain archived'; end if;
  if exists (
    select 1 from private.offerpsp_introductions
    where lead_id = p_lead_id and status = 'won'
  ) then raise exception 'Won merchants must remain archived for commercial history'; end if;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, reason, before_state)
  values ('merchant', p_lead_id::text, 'purged', auth.uid(), v_lead.archive_reason, to_jsonb(v_lead));

  select id into v_dossier_id from private.offerpsp_merchant_dossiers where lead_id = p_lead_id;
  delete from private.offerpsp_introductions where lead_id = p_lead_id;
  if v_dossier_id is not null then
    delete from private.offerpsp_provider_reviews where dossier_id = v_dossier_id;
    delete from private.offerpsp_merchant_dossiers where id = v_dossier_id;
  end if;
  delete from public.offerpsp_leads where lead_id = p_lead_id;
  return jsonb_build_object('lead_id', p_lead_id, 'company', v_lead.company, 'deleted', true);
end;
$$;

create or replace function public.save_offerpsp_organization(
  p_organization_id uuid,
  p_organization_type text,
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
  v_status text;
  v_tier text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_organization_type not in ('merchant', 'agent') then raise exception 'Unsupported organization type'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Organization payload must be an object'; end if;
  if nullif(trim(p_payload ->> 'name'), '') is null then raise exception 'Organization name is required'; end if;
  v_status := coalesce(nullif(trim(p_payload ->> 'status'), ''), 'active');
  v_tier := coalesce(nullif(trim(p_payload ->> 'relationship_tier'), ''), 'standard');
  if v_status not in ('pending', 'active', 'paused', 'archived') then raise exception 'Unsupported organization status'; end if;
  if v_tier not in ('top', 'core', 'standard', 'watchlist') then raise exception 'Unsupported organization tier'; end if;

  if p_organization_id is null then
    insert into public.offerpsp_organizations (
      organization_type, name, legal_name, status, relationship_tier,
      relationship_notes, created_by, archived_at, archived_by
    ) values (
      p_organization_type, trim(p_payload ->> 'name'), nullif(trim(p_payload ->> 'legal_name'), ''),
      v_status, v_tier, nullif(trim(p_payload ->> 'relationship_notes'), ''), auth.uid(),
      case when v_status = 'archived' then now() else null end,
      case when v_status = 'archived' then auth.uid() else null end
    ) returning * into v_after;
  else
    select * into v_before from public.offerpsp_organizations where id = p_organization_id for update;
    if not found then raise exception 'OfferPSP organization not found'; end if;
    if v_before.organization_type <> p_organization_type then raise exception 'Organization type cannot be changed'; end if;
    update public.offerpsp_organizations
    set name = trim(p_payload ->> 'name'),
        legal_name = nullif(trim(p_payload ->> 'legal_name'), ''),
        status = v_status,
        relationship_tier = v_tier,
        relationship_notes = nullif(trim(p_payload ->> 'relationship_notes'), ''),
        archived_at = case when v_status = 'archived' then coalesce(archived_at, now()) else null end,
        archived_by = case when v_status = 'archived' then coalesce(archived_by, auth.uid()) else null end
    where id = p_organization_id returning * into v_after;
  end if;

  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('organization', v_after.id::text, case when p_organization_id is null then 'created' else 'updated' end,
    auth.uid(), case when p_organization_id is null then null else to_jsonb(v_before) end, to_jsonb(v_after));
  return to_jsonb(v_after) - 'created_by' - 'archived_by';
end;
$$;

create or replace function public.set_offerpsp_agent_assignment(
  p_agent_organization_id uuid,
  p_merchant_organization_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before public.offerpsp_agent_clients;
  v_after public.offerpsp_agent_clients;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('pending', 'active', 'paused', 'ended') then raise exception 'Unsupported agent assignment status'; end if;
  select * into v_before from public.offerpsp_agent_clients
  where agent_organization_id = p_agent_organization_id and merchant_organization_id = p_merchant_organization_id;
  insert into public.offerpsp_agent_clients(agent_organization_id, merchant_organization_id, status, created_by)
  values (p_agent_organization_id, p_merchant_organization_id, p_status, auth.uid())
  on conflict (agent_organization_id, merchant_organization_id)
  do update set status = excluded.status
  returning * into v_after;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('agent_assignment', v_after.id::text, p_status, auth.uid(), to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'created_by';
end;
$$;

create or replace function public.set_offerpsp_agent_margin_policy(
  p_agent_organization_id uuid,
  p_merchant_organization_id uuid,
  p_flow text,
  p_mode text,
  p_percent_value numeric,
  p_fixed_value numeric,
  p_fixed_currency text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_policy private.offerpsp_agent_margin_policies;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (select 1 from public.offerpsp_organizations where id = p_agent_organization_id and organization_type = 'agent') then raise exception 'Agent organization not found'; end if;
  if p_merchant_organization_id is not null and not exists (select 1 from public.offerpsp_organizations where id = p_merchant_organization_id and organization_type = 'merchant') then raise exception 'Merchant organization not found'; end if;
  if p_flow not in ('all', 'payin', 'payout', 'settlement', 'refund', 'chargeback') then raise exception 'Unsupported margin flow'; end if;
  if p_mode not in ('percentage_points', 'relative_percent', 'fixed', 'hybrid', 'override') then raise exception 'Unsupported margin mode'; end if;
  if p_mode <> 'override' and p_percent_value is null and p_fixed_value is null then raise exception 'Agent margin value is required'; end if;
  if p_fixed_value is not null and nullif(upper(trim(p_fixed_currency)), '') is null then raise exception 'Fixed margin currency is required'; end if;

  update private.offerpsp_agent_margin_policies
  set active = false,
      effective_to = greatest(clock_timestamp(), effective_from + interval '1 microsecond'),
      updated_at = clock_timestamp()
  where agent_organization_id = p_agent_organization_id
    and merchant_organization_id is not distinct from p_merchant_organization_id
    and merchant_lead_id is null and route_id is null and flow = p_flow and active;
  insert into private.offerpsp_agent_margin_policies(
    agent_organization_id, merchant_organization_id, flow, mode,
    percent_value, fixed_value, fixed_currency, notes, created_by
  ) values (
    p_agent_organization_id, p_merchant_organization_id, p_flow, p_mode,
    p_percent_value, p_fixed_value, nullif(upper(trim(p_fixed_currency)), ''), nullif(trim(p_notes), ''), auth.uid()
  ) returning * into v_policy;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
  values ('margin_policy', v_policy.id::text, 'agent_margin_version_created', auth.uid(), to_jsonb(v_policy));
  return to_jsonb(v_policy) - 'created_by';
end;
$$;

create or replace function public.set_offerpsp_margin_policy(
  p_provider_id uuid,
  p_route_id uuid,
  p_flow text,
  p_mode text,
  p_percent_value numeric,
  p_fixed_value numeric,
  p_fixed_currency text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_policy private.offerpsp_margin_policies;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then raise exception 'PSP provider not found'; end if;
  if p_route_id is not null and not exists (select 1 from private.offerpsp_offer_routes where id = p_route_id and provider_id = p_provider_id) then raise exception 'Route does not belong to this PSP'; end if;
  if p_flow not in ('all', 'payin', 'payout', 'settlement', 'refund', 'chargeback') then raise exception 'Unsupported margin flow'; end if;
  if p_mode not in ('included', 'percentage_points', 'relative_percent', 'fixed', 'hybrid', 'override') then raise exception 'Unsupported margin mode'; end if;
  if p_mode not in ('included', 'override') and p_percent_value is null and p_fixed_value is null then raise exception 'Margin value is required'; end if;
  if p_fixed_value is not null and nullif(upper(trim(p_fixed_currency)), '') is null then raise exception 'Fixed margin currency is required'; end if;

  update private.offerpsp_margin_policies
  set active = false,
      effective_to = greatest(clock_timestamp(), effective_from + interval '1 microsecond'),
      updated_at = clock_timestamp()
  where provider_id = p_provider_id
    and route_id is not distinct from p_route_id
    and merchant_lead_id is null
    and flow = p_flow
    and active;

  insert into private.offerpsp_margin_policies(provider_id, route_id, scope, flow, mode, percent_value, fixed_value, fixed_currency, notes, created_by)
  values (p_provider_id, p_route_id, case when p_route_id is null then 'provider' else 'route' end, p_flow, p_mode, p_percent_value, p_fixed_value, nullif(upper(trim(p_fixed_currency)), ''), nullif(trim(p_notes), ''), auth.uid())
  returning * into v_policy;

  insert into private.offerpsp_supply_activities(provider_id, route_id, actor_user_id, action_type, summary, after_state)
  values (p_provider_id, p_route_id, auth.uid(), 'margin_policy_created', 'Margin policy version created', to_jsonb(v_policy));
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
  values ('margin_policy', v_policy.id::text, 'provider_margin_version_created', auth.uid(), to_jsonb(v_policy));
  return to_jsonb(v_policy) - 'created_by';
end;
$$;

create or replace function public.create_offerpsp_manual_route(
  p_provider_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_route_id uuid;
  v_batch_version integer;
  v_route private.offerpsp_offer_routes;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if not exists (select 1 from private.offerpsp_providers where id = p_provider_id) then raise exception 'PSP provider not found'; end if;
  if nullif(trim(p_payload ->> 'client_title'), '') is null then raise exception 'Offer title is required'; end if;
  if coalesce(nullif(trim(p_payload ->> 'flow'), ''), 'payin') not in ('payin', 'payout', 'both') then raise exception 'Unsupported route flow'; end if;
  select coalesce(max(batch_version), 0) + 1 into v_batch_version from private.offerpsp_rate_card_batches where provider_id = p_provider_id;
  insert into private.offerpsp_rate_card_batches(
    id, provider_id, batch_version, source_type, source_reference, source_text,
    status, parser_version, parser_metadata, created_by
  ) values (
    v_batch_id, p_provider_id, v_batch_version, 'manual',
    coalesce(nullif(trim(p_payload ->> 'source_reference'), ''), 'Staff manual offer'),
    jsonb_build_object('manual_entry_id', v_batch_id, 'payload', p_payload)::text,
    'draft', 'staff-manual-v1', jsonb_build_object('manual', true), auth.uid()
  );
  insert into private.offerpsp_offer_routes(
    provider_id, batch_id, client_title, flow, raw_block, status
  ) values (
    p_provider_id, v_batch_id, trim(p_payload ->> 'client_title'),
    coalesce(nullif(trim(p_payload ->> 'flow'), ''), 'payin'),
    p_payload::text, 'draft'
  ) returning id into v_route_id;
  perform public.save_offerpsp_route(v_route_id, p_payload);
  select * into v_route from private.offerpsp_offer_routes where id = v_route_id;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
  values ('offer', v_route_id::text, 'manual_offer_created', auth.uid(), to_jsonb(v_route));
  return jsonb_build_object('route_id', v_route_id, 'batch_id', v_batch_id, 'batch_version', v_batch_version, 'route_code', v_route.internal_code);
end;
$$;

create or replace function public.revise_offerpsp_route(p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_source private.offerpsp_offer_routes;
  v_batch_id uuid := gen_random_uuid();
  v_new_route_id uuid;
  v_batch_version integer;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_source from private.offerpsp_offer_routes where id = p_route_id;
  if not found then raise exception 'OfferPSP route not found'; end if;
  select coalesce(max(batch_version), 0) + 1 into v_batch_version from private.offerpsp_rate_card_batches where provider_id = v_source.provider_id;
  insert into private.offerpsp_rate_card_batches(
    id, provider_id, batch_version, source_type, source_reference, source_text,
    status, parser_version, parser_metadata, created_by
  ) values (
    v_batch_id, v_source.provider_id, v_batch_version, 'manual',
    'Revision of ' || v_source.internal_code,
    jsonb_build_object('revision_of_route_id', p_route_id, 'source_route', to_jsonb(v_source))::text,
    'draft', 'staff-revision-v1', jsonb_build_object('manual', true, 'revision_of_route_id', p_route_id), auth.uid()
  );
  insert into private.offerpsp_offer_routes(
    provider_id, batch_id, client_title, coverage_scope, geos, blocked_geos, currencies,
    flow, methods, card_brands, traffic_types, verticals, prohibited_verticals, integrations,
    niche_key, status, effective_from, expires_at, freshness_days, min_monthly_volume,
    max_monthly_volume, volume_currency, risk_terms, operational_notes, raw_block,
    revision_of_route_id
  ) select
    provider_id, v_batch_id, client_title, coverage_scope, geos, blocked_geos, currencies,
    flow, methods, card_brands, traffic_types, verticals, prohibited_verticals, integrations,
    niche_key, 'review', effective_from, expires_at, freshness_days, min_monthly_volume,
    max_monthly_volume, volume_currency, risk_terms, operational_notes, raw_block,
    p_route_id
  from private.offerpsp_offer_routes where id = p_route_id
  returning id into v_new_route_id;
  insert into private.offerpsp_offer_fee_components(route_id, flow, traffic_tier, method_scope, region_scope, fee_type, base_percent, base_fixed, base_fixed_currency, applies_on, minimum_fee, maximum_fee, source_text)
  select v_new_route_id, flow, traffic_tier, method_scope, region_scope, fee_type, base_percent, base_fixed, base_fixed_currency, applies_on, minimum_fee, maximum_fee, source_text
  from private.offerpsp_offer_fee_components where route_id = p_route_id;
  insert into private.offerpsp_offer_limits(route_id, flow, scope, method_scope, traffic_tier, currency, minimum_amount, maximum_amount, maximum_count, original_note)
  select v_new_route_id, flow, scope, method_scope, traffic_tier, currency, minimum_amount, maximum_amount, maximum_count, original_note
  from private.offerpsp_offer_limits where route_id = p_route_id;
  insert into private.offerpsp_settlement_terms(route_id, currency, fee_percent, fixed_fee, fixed_fee_currency, period, minimum_amount, exchange_source, exchange_rule, weekdays, netting_percent, liquidity_requirement, original_note)
  select v_new_route_id, currency, fee_percent, fixed_fee, fixed_fee_currency, period, minimum_amount, exchange_source, exchange_rule, weekdays, netting_percent, liquidity_requirement, original_note
  from private.offerpsp_settlement_terms where route_id = p_route_id;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
  values ('offer', v_new_route_id::text, 'revision_created', auth.uid(), to_jsonb(v_source), jsonb_build_object('revision_of_route_id', p_route_id, 'new_route_id', v_new_route_id));
  return jsonb_build_object('route_id', v_new_route_id, 'batch_id', v_batch_id, 'batch_version', v_batch_version, 'revision_of_route_id', p_route_id);
end;
$$;

create or replace function public.deactivate_offerpsp_margin_policy(p_policy_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_margin_policies;
  v_after private.offerpsp_margin_policies;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Reason is required'; end if;
  select * into v_before from private.offerpsp_margin_policies where id = p_policy_id for update;
  if not found then raise exception 'Margin policy not found'; end if;
  update private.offerpsp_margin_policies
  set active = false,
      effective_to = coalesce(effective_to, greatest(clock_timestamp(), effective_from + interval '1 microsecond')),
      notes = concat_ws(E'\n', notes, 'Deactivated: ' || trim(p_reason)),
      updated_at = clock_timestamp()
  where id = p_policy_id returning * into v_after;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, reason, before_state, after_state)
  values ('margin_policy', p_policy_id::text, 'deactivated', auth.uid(), trim(p_reason), to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after) - 'created_by';
end;
$$;

revoke all on function public.get_offerpsp_management_registry() from public;
revoke all on function public.save_offerpsp_managed_provider(uuid, jsonb) from public;
revoke all on function public.save_offerpsp_managed_merchant(uuid, jsonb) from public;
revoke all on function public.set_offerpsp_merchant_record_state(uuid, text, text) from public;
revoke all on function public.purge_offerpsp_merchant(uuid, text) from public;
revoke all on function public.save_offerpsp_organization(uuid, text, jsonb) from public;
revoke all on function public.set_offerpsp_agent_assignment(uuid, uuid, text) from public;
revoke all on function public.set_offerpsp_agent_margin_policy(uuid, uuid, text, text, numeric, numeric, text, text) from public;
revoke all on function public.create_offerpsp_manual_route(uuid, jsonb) from public;
revoke all on function public.revise_offerpsp_route(uuid) from public;
revoke all on function public.deactivate_offerpsp_margin_policy(uuid, text) from public;

grant execute on function public.get_offerpsp_management_registry() to authenticated;
grant execute on function public.save_offerpsp_managed_provider(uuid, jsonb) to authenticated;
grant execute on function public.save_offerpsp_managed_merchant(uuid, jsonb) to authenticated;
grant execute on function public.set_offerpsp_merchant_record_state(uuid, text, text) to authenticated;
grant execute on function public.purge_offerpsp_merchant(uuid, text) to authenticated;
grant execute on function public.save_offerpsp_organization(uuid, text, jsonb) to authenticated;
grant execute on function public.set_offerpsp_agent_assignment(uuid, uuid, text) to authenticated;
grant execute on function public.set_offerpsp_agent_margin_policy(uuid, uuid, text, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.create_offerpsp_manual_route(uuid, jsonb) to authenticated;
grant execute on function public.revise_offerpsp_route(uuid) to authenticated;
grant execute on function public.deactivate_offerpsp_margin_policy(uuid, text) to authenticated;
