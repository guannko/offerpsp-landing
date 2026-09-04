create table if not exists public.offerpsp_organizations (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null default ('ORG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  organization_type text not null
    check (organization_type in ('merchant', 'agent')),
  name text not null,
  legal_name text,
  status text not null default 'active'
    check (status in ('pending', 'active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_code)
);

create table if not exists public.offerpsp_organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.offerpsp_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'manager', 'viewer')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.offerpsp_agent_clients (
  id uuid primary key default gen_random_uuid(),
  agent_organization_id uuid not null references public.offerpsp_organizations(id) on delete cascade,
  merchant_organization_id uuid not null references public.offerpsp_organizations(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'ended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_organization_id, merchant_organization_id),
  check (agent_organization_id <> merchant_organization_id)
);

alter table public.offerpsp_leads
  add column if not exists merchant_organization_id uuid references public.offerpsp_organizations(id) on delete set null,
  add column if not exists agent_organization_id uuid references public.offerpsp_organizations(id) on delete set null;

create index if not exists offerpsp_organization_members_user_idx
  on public.offerpsp_organization_members (user_id, active);
create index if not exists offerpsp_agent_clients_agent_idx
  on public.offerpsp_agent_clients (agent_organization_id, status);
create index if not exists offerpsp_agent_clients_merchant_idx
  on public.offerpsp_agent_clients (merchant_organization_id, status);
create index if not exists offerpsp_leads_merchant_organization_idx
  on public.offerpsp_leads (merchant_organization_id, submitted_at desc);
create index if not exists offerpsp_leads_agent_organization_idx
  on public.offerpsp_leads (agent_organization_id, submitted_at desc);

create or replace function private.validate_offerpsp_agent_client_types()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
declare
  v_agent_type text;
  v_merchant_type text;
begin
  select organization_type into v_agent_type
  from public.offerpsp_organizations where id = new.agent_organization_id;
  select organization_type into v_merchant_type
  from public.offerpsp_organizations where id = new.merchant_organization_id;
  if v_agent_type is distinct from 'agent' or v_merchant_type is distinct from 'merchant' then
    raise exception 'Agent-client relationships require an agent organization and a merchant organization';
  end if;
  return new;
end;
$$;

create or replace function private.validate_offerpsp_lead_organization_types()
returns trigger
language plpgsql
set search_path = public, private, pg_catalog
as $$
begin
  if new.merchant_organization_id is not null and not exists (
    select 1 from public.offerpsp_organizations o
    where o.id = new.merchant_organization_id and o.organization_type = 'merchant'
  ) then
    raise exception 'Lead merchant_organization_id must reference a merchant organization';
  end if;
  if new.agent_organization_id is not null then
    if new.merchant_organization_id is null then
      raise exception 'Agent-managed leads require a merchant organization';
    end if;
    if not exists (
      select 1 from public.offerpsp_organizations o
      where o.id = new.agent_organization_id and o.organization_type = 'agent'
    ) then
      raise exception 'Lead agent_organization_id must reference an agent organization';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_agent_clients_validate_types on public.offerpsp_agent_clients;
create trigger offerpsp_agent_clients_validate_types
before insert or update of agent_organization_id, merchant_organization_id
on public.offerpsp_agent_clients
for each row execute function private.validate_offerpsp_agent_client_types();

drop trigger if exists offerpsp_leads_validate_organization_types on public.offerpsp_leads;
create trigger offerpsp_leads_validate_organization_types
before insert or update of merchant_organization_id, agent_organization_id
on public.offerpsp_leads
for each row execute function private.validate_offerpsp_lead_organization_types();

drop trigger if exists offerpsp_organizations_set_updated_at on public.offerpsp_organizations;
create trigger offerpsp_organizations_set_updated_at
before update on public.offerpsp_organizations
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_organization_members_set_updated_at on public.offerpsp_organization_members;
create trigger offerpsp_organization_members_set_updated_at
before update on public.offerpsp_organization_members
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_agent_clients_set_updated_at on public.offerpsp_agent_clients;
create trigger offerpsp_agent_clients_set_updated_at
before update on public.offerpsp_agent_clients
for each row execute function public.set_offerpsp_updated_at();

create or replace function public.is_offerpsp_organization_member(
  p_organization_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.offerpsp_organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.active
      and (p_roles is null or om.role = any(p_roles))
  );
$$;

create or replace function public.can_access_offerpsp_client_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.offerpsp_leads l
    where l.lead_id = p_lead_id
      and l.status not in ('closed', 'spam')
      and (
        l.client_user_id = auth.uid()
        or (
          l.agent_organization_id is not null
          and l.merchant_organization_id is not null
          and public.is_offerpsp_organization_member(
            l.agent_organization_id,
            array['owner', 'admin', 'manager']
          )
          and exists (
            select 1
            from public.offerpsp_agent_clients ac
            where ac.agent_organization_id = l.agent_organization_id
              and ac.merchant_organization_id = l.merchant_organization_id
              and ac.status = 'active'
          )
        )
      )
  );
$$;

alter table public.offerpsp_organizations enable row level security;
alter table public.offerpsp_organization_members enable row level security;
alter table public.offerpsp_agent_clients enable row level security;

drop policy if exists offerpsp_organizations_staff_all on public.offerpsp_organizations;
create policy offerpsp_organizations_staff_all
on public.offerpsp_organizations for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_organizations_member_read on public.offerpsp_organizations;
create policy offerpsp_organizations_member_read
on public.offerpsp_organizations for select to authenticated
using (public.is_offerpsp_organization_member(id));

drop policy if exists offerpsp_organization_members_staff_all on public.offerpsp_organization_members;
create policy offerpsp_organization_members_staff_all
on public.offerpsp_organization_members for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_organization_members_member_read on public.offerpsp_organization_members;
create policy offerpsp_organization_members_member_read
on public.offerpsp_organization_members for select to authenticated
using (user_id = auth.uid() or public.is_offerpsp_organization_member(organization_id));

drop policy if exists offerpsp_agent_clients_staff_all on public.offerpsp_agent_clients;
create policy offerpsp_agent_clients_staff_all
on public.offerpsp_agent_clients for all to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());

drop policy if exists offerpsp_agent_clients_agent_read on public.offerpsp_agent_clients;
create policy offerpsp_agent_clients_agent_read
on public.offerpsp_agent_clients for select to authenticated
using (public.is_offerpsp_organization_member(agent_organization_id));

drop policy if exists offerpsp_activities_client_read on public.offerpsp_lead_activities;
create policy offerpsp_activities_client_read
on public.offerpsp_lead_activities for select to authenticated
using (client_visible and public.can_access_offerpsp_client_lead(lead_id));

drop policy if exists offerpsp_shortlists_client_read on public.offerpsp_shortlists;
create policy offerpsp_shortlists_client_read
on public.offerpsp_shortlists for select to authenticated
using (status = 'shared' and public.can_access_offerpsp_client_lead(lead_id));

drop policy if exists offerpsp_shortlist_items_client_read on public.offerpsp_shortlist_items;

drop policy if exists offerpsp_conversations_client_read on public.offerpsp_conversations;
create policy offerpsp_conversations_client_read
on public.offerpsp_conversations for select to authenticated
using (client_visible and public.can_access_offerpsp_client_lead(lead_id));

drop policy if exists offerpsp_messages_client_read on public.offerpsp_messages;
create policy offerpsp_messages_client_read
on public.offerpsp_messages for select to authenticated
using (
  exists (
    select 1
    from public.offerpsp_conversations c
    where c.id = offerpsp_messages.conversation_id
      and c.client_visible
      and public.can_access_offerpsp_client_lead(c.lead_id)
  )
);

drop policy if exists offerpsp_messages_client_insert on public.offerpsp_messages;
create policy offerpsp_messages_client_insert
on public.offerpsp_messages for insert to authenticated
with check (
  sender_type = 'client'
  and sender_user_id = auth.uid()
  and direction = 'inbound'
  and exists (
    select 1
    from public.offerpsp_conversations c
    where c.id = offerpsp_messages.conversation_id
      and c.client_visible
      and public.can_access_offerpsp_client_lead(c.lead_id)
  )
);

create table if not exists private.offerpsp_agent_margin_policies (
  id uuid primary key default gen_random_uuid(),
  agent_organization_id uuid not null references public.offerpsp_organizations(id) on delete cascade,
  merchant_organization_id uuid references public.offerpsp_organizations(id) on delete cascade,
  merchant_lead_id uuid references public.offerpsp_leads(lead_id) on delete cascade,
  route_id uuid references private.offerpsp_offer_routes(id) on delete cascade,
  flow text not null default 'all'
    check (flow in ('all', 'payin', 'payout', 'settlement', 'refund', 'chargeback')),
  mode text not null
    check (mode in ('percentage_points', 'relative_percent', 'fixed', 'hybrid', 'override')),
  percent_value numeric,
  fixed_value numeric,
  fixed_currency text,
  override_percent numeric,
  override_fixed numeric,
  rounding_scale smallint not null default 2 check (rounding_scale between 0 and 6),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (
    mode = 'override'
    or percent_value is not null
    or fixed_value is not null
  ),
  check (fixed_value is null or fixed_currency is not null),
  check (override_fixed is null or fixed_currency is not null)
);

create table if not exists private.offerpsp_agent_commissions (
  id uuid primary key default gen_random_uuid(),
  agent_organization_id uuid not null references public.offerpsp_organizations(id) on delete restrict,
  merchant_organization_id uuid references public.offerpsp_organizations(id) on delete set null,
  lead_id uuid references public.offerpsp_leads(lead_id) on delete set null,
  introduction_id uuid references private.offerpsp_introductions(id) on delete set null,
  basis text not null default 'processing_volume'
    check (basis in ('processing_volume', 'revenue_share', 'fixed_referral', 'manual')),
  basis_amount numeric,
  commission_percent numeric,
  commission_fixed numeric,
  currency text,
  amount numeric,
  status text not null default 'projected'
    check (status in ('projected', 'approved', 'earned', 'paid', 'void')),
  period_start date,
  period_end date,
  earned_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (amount is null or amount >= 0)
);

create index if not exists offerpsp_agent_margin_policy_lookup_idx
  on private.offerpsp_agent_margin_policies (
    agent_organization_id, merchant_organization_id, merchant_lead_id, route_id, flow, active
  );
create index if not exists offerpsp_agent_commissions_agent_status_idx
  on private.offerpsp_agent_commissions (agent_organization_id, status, created_at desc);

drop trigger if exists offerpsp_agent_margin_policies_set_updated_at on private.offerpsp_agent_margin_policies;
create trigger offerpsp_agent_margin_policies_set_updated_at
before update on private.offerpsp_agent_margin_policies
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_agent_commissions_set_updated_at on private.offerpsp_agent_commissions;
create trigger offerpsp_agent_commissions_set_updated_at
before update on private.offerpsp_agent_commissions
for each row execute function public.set_offerpsp_updated_at();

create or replace function private.offerpsp_calculate_resale_fee(
  p_fee_id uuid,
  p_lead_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_result jsonb;
  v_lead public.offerpsp_leads;
  v_fee private.offerpsp_offer_fee_components;
  v_policy private.offerpsp_agent_margin_policies;
  v_client_percent numeric;
  v_client_fixed numeric;
  v_client_currency text;
begin
  v_result := private.offerpsp_calculate_client_fee(p_fee_id, p_lead_id);
  if v_result ->> 'status' is distinct from 'calculated' then
    return v_result;
  end if;

  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;
  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  if v_lead.agent_organization_id is null then
    return v_result || jsonb_build_object('agent_margin_mode', 'none');
  end if;

  select * into v_fee
  from private.offerpsp_offer_fee_components
  where id = p_fee_id;

  select * into v_policy
  from private.offerpsp_agent_margin_policies amp
  where amp.agent_organization_id = v_lead.agent_organization_id
    and amp.active
    and amp.effective_from <= now()
    and (amp.effective_to is null or amp.effective_to > now())
    and (amp.merchant_organization_id is null or amp.merchant_organization_id = v_lead.merchant_organization_id)
    and (amp.merchant_lead_id is null or amp.merchant_lead_id = p_lead_id)
    and (amp.route_id is null or amp.route_id = v_fee.route_id)
    and (amp.flow = 'all' or amp.flow = v_fee.flow)
  order by
    case when amp.merchant_lead_id = p_lead_id then 8 else 0 end
      + case when amp.merchant_organization_id = v_lead.merchant_organization_id then 4 else 0 end
      + case when amp.route_id = v_fee.route_id then 2 else 0 end
      + case when amp.flow = v_fee.flow then 1 else 0 end desc,
    amp.effective_from desc
  limit 1;

  if v_policy.id is null then
    return (v_result - 'status') || jsonb_build_object(
      'status', 'agent_margin_required',
      'agent_margin_mode', 'missing'
    );
  end if;

  v_client_percent := (v_result ->> 'client_percent')::numeric;
  v_client_fixed := (v_result ->> 'client_fixed')::numeric;
  v_client_currency := coalesce(v_result ->> 'client_fixed_currency', v_policy.fixed_currency);

  if v_policy.mode in ('fixed', 'hybrid')
    and v_client_fixed is not null
    and v_client_currency is not null
    and v_policy.fixed_currency is not null
    and upper(v_client_currency) <> upper(v_policy.fixed_currency)
  then
    return (v_result - 'status') || jsonb_build_object(
      'status', 'agent_fixed_currency_mismatch',
      'agent_margin_mode', v_policy.mode
    );
  end if;

  if v_policy.mode = 'percentage_points' then
    v_client_percent := coalesce(v_client_percent, 0) + coalesce(v_policy.percent_value, 0);
  elsif v_policy.mode = 'relative_percent' then
    v_client_percent := case when v_client_percent is null then null
      else v_client_percent * (1 + coalesce(v_policy.percent_value, 0) / 100) end;
    v_client_fixed := case when v_client_fixed is null then null
      else v_client_fixed * (1 + coalesce(v_policy.percent_value, 0) / 100) end;
  elsif v_policy.mode = 'fixed' then
    v_client_fixed := coalesce(v_client_fixed, 0) + coalesce(v_policy.fixed_value, 0);
    v_client_currency := coalesce(v_policy.fixed_currency, v_client_currency);
  elsif v_policy.mode = 'hybrid' then
    v_client_percent := coalesce(v_client_percent, 0) + coalesce(v_policy.percent_value, 0);
    v_client_fixed := coalesce(v_client_fixed, 0) + coalesce(v_policy.fixed_value, 0);
    v_client_currency := coalesce(v_policy.fixed_currency, v_client_currency);
  elsif v_policy.mode = 'override' then
    v_client_percent := v_policy.override_percent;
    v_client_fixed := v_policy.override_fixed;
    v_client_currency := coalesce(v_policy.fixed_currency, v_client_currency);
  end if;

  v_client_percent := round(v_client_percent, v_policy.rounding_scale);
  v_client_fixed := round(v_client_fixed, v_policy.rounding_scale);

  return jsonb_strip_nulls(
    (v_result - 'client_percent' - 'client_fixed' - 'client_fixed_currency' - 'status')
    || jsonb_build_object(
      'client_percent', v_client_percent,
      'client_fixed', v_client_fixed,
      'client_fixed_currency', v_client_currency,
      'agent_margin_mode', v_policy.mode,
      'status', 'calculated'
    )
  );
end;
$$;

create or replace function private.offerpsp_build_client_route_snapshot(
  p_route_id uuid,
  p_lead_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_route private.offerpsp_offer_routes;
  v_fee_calculations jsonb;
  v_fees jsonb;
  v_limits jsonb;
  v_settlement jsonb;
begin
  select * into v_route
  from private.offerpsp_offer_routes
  where id = p_route_id;
  if not found then
    raise exception 'OfferPSP route not found';
  end if;

  select coalesce(jsonb_agg(
    private.offerpsp_calculate_resale_fee(f.id, p_lead_id)
    order by f.flow, f.traffic_tier nulls first, f.created_at
  ), '[]'::jsonb)
  into v_fee_calculations
  from private.offerpsp_offer_fee_components f
  where f.route_id = v_route.id;

  if exists (
    select 1 from jsonb_array_elements(v_fee_calculations) fee
    where fee ->> 'status' is distinct from 'calculated'
  ) then
    raise exception 'Client pricing cannot be calculated for this route: OfferPSP or agent margin is missing';
  end if;

  select coalesce(jsonb_agg(
    fee - 'fee_id' - 'margin_mode' - 'agent_margin_mode' - 'status'
    order by ordinal
  ), '[]'::jsonb)
  into v_fees
  from jsonb_array_elements(v_fee_calculations) with ordinality as calculations(fee, ordinal);

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'flow', l.flow,
    'scope', l.scope,
    'currency', l.currency,
    'minimum_amount', l.minimum_amount,
    'maximum_amount', l.maximum_amount,
    'maximum_count', l.maximum_count,
    'traffic_tier', l.traffic_tier
  )) order by l.flow, l.scope), '[]'::jsonb)
  into v_limits
  from private.offerpsp_offer_limits l
  where l.route_id = v_route.id;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'currency', s.currency,
    'period', s.period,
    'fee_percent', s.fee_percent,
    'fixed_fee', s.fixed_fee,
    'fixed_fee_currency', s.fixed_fee_currency,
    'minimum_amount', s.minimum_amount,
    'netting_percent', s.netting_percent
  )) order by s.created_at), '[]'::jsonb)
  into v_settlement
  from private.offerpsp_settlement_terms s
  where s.route_id = v_route.id;

  return jsonb_strip_nulls(jsonb_build_object(
    'title', v_route.client_title,
    'coverage_scope', v_route.coverage_scope,
    'geos', v_route.geos,
    'currencies', v_route.currencies,
    'flow', v_route.flow,
    'methods', v_route.methods,
    'card_brands', v_route.card_brands,
    'traffic_types', v_route.traffic_types,
    'integrations', v_route.integrations,
    'client_fees', v_fees,
    'limits', v_limits,
    'settlement', v_settlement,
    'valid_through', v_route.expires_at,
    'snapshot_created_at', now()
  ));
end;
$$;

create or replace function public.share_offerpsp_shortlist(p_shortlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead_id uuid;
  v_invalid_count integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select s.lead_id
  into v_lead_id
  from public.offerpsp_shortlists s
  where s.id = p_shortlist_id;
  if v_lead_id is null then
    raise exception 'Shortlist not found';
  end if;

  select count(*)::integer
  into v_invalid_count
  from public.offerpsp_shortlist_items si
  where si.shortlist_id = p_shortlist_id
    and (
      si.private_provider_id is null
      or si.offer_route_id is null
      or si.client_snapshot is null
      or nullif(trim(si.client_snapshot ->> 'title'), '') is null
      or jsonb_array_length(case
        when jsonb_typeof(si.client_snapshot -> 'currencies') = 'array' then si.client_snapshot -> 'currencies'
        else '[]'::jsonb end) = 0
      or jsonb_array_length(case
        when jsonb_typeof(si.client_snapshot -> 'methods') = 'array' then si.client_snapshot -> 'methods'
        else '[]'::jsonb end) = 0
      or jsonb_array_length(case
        when jsonb_typeof(si.client_snapshot -> 'client_fees') = 'array' then si.client_snapshot -> 'client_fees'
        else '[]'::jsonb end) = 0
      or (
        si.client_snapshot ->> 'coverage_scope' = 'specific'
        and (
          jsonb_array_length(case
            when jsonb_typeof(si.client_snapshot -> 'geos') = 'array' then si.client_snapshot -> 'geos'
            else '[]'::jsonb end) = 0
        )
      )
    );

  if not exists (
    select 1 from public.offerpsp_shortlist_items si where si.shortlist_id = p_shortlist_id
  ) then
    raise exception 'Shortlist has no options';
  end if;
  if v_invalid_count > 0 then
    raise exception 'Shortlist contains legacy or incomplete options. Rebuild it from current published route matches before sharing';
  end if;

  update public.offerpsp_shortlists
  set status = 'archived'
  where lead_id = v_lead_id
    and id <> p_shortlist_id
    and status = 'shared';

  update public.offerpsp_shortlists
  set status = 'shared',
      shared_at = coalesce(shared_at, now())
  where id = p_shortlist_id;

  update public.offerpsp_leads
  set status = 'shared'
  where lead_id = v_lead_id
    and status not in ('provider_reviewing', 'provider_needs_info', 'provider_accepted', 'telegram_created', 'zoom_scheduled', 'won', 'lost');

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'staff',
    'shortlist_shared',
    'Payment route shortlist shared',
    'Comparable route terms are now available in the client workspace.',
    true
  );

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'shortlist_id', p_shortlist_id,
    'status', 'shared'
  );
end;
$$;

drop view if exists public.offerpsp_client_shortlist;
create view public.offerpsp_client_shortlist
with (security_barrier = true)
as
select
  s.id as shortlist_id,
  s.lead_id,
  s.version,
  s.title,
  s.introduction,
  s.status,
  s.shared_at,
  si.rank,
  si.public_code as option_code,
  coalesce(nullif(si.client_note, ''), 'Matched to your structured payment requirements.') as client_note,
  si.client_response,
  si.client_responded_at,
  si.client_snapshot ->> 'title' as route_title,
  si.client_snapshot ->> 'coverage_scope' as coverage_scope,
  si.client_snapshot -> 'geos' as geos,
  si.client_snapshot -> 'currencies' as currencies,
  si.client_snapshot ->> 'flow' as flow,
  si.client_snapshot -> 'methods' as methods,
  si.client_snapshot -> 'traffic_types' as traffic_types,
  si.client_snapshot -> 'integrations' as integrations,
  si.client_snapshot -> 'client_fees' as client_fees,
  si.client_snapshot -> 'limits' as limits,
  si.client_snapshot -> 'settlement' as settlement,
  si.client_snapshot ->> 'valid_through' as valid_through
from public.offerpsp_shortlists s
join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
where s.status = 'shared'
  and si.private_provider_id is not null
  and si.offer_route_id is not null
  and si.client_snapshot is not null
  and nullif(trim(si.client_snapshot ->> 'title'), '') is not null
  and public.can_access_offerpsp_client_lead(s.lead_id);

create or replace function public.list_offerpsp_workspace_requests()
returns table (
  lead_id uuid,
  company text,
  vertical text,
  status text,
  submitted_at timestamptz,
  updated_at timestamptz,
  target_geos text[],
  requested_currencies text[],
  requested_flows text[],
  requested_methods text[],
  traffic_types text[],
  expected_monthly_volume numeric,
  volume_currency text,
  min_transaction_amount numeric,
  max_transaction_amount numeric,
  transaction_currency text,
  access_mode text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    l.lead_id,
    l.company::text,
    l.vertical::text,
    l.status::text,
    l.submitted_at,
    l.updated_at,
    l.target_geos,
    l.requested_currencies,
    l.requested_flows,
    l.requested_methods,
    l.traffic_types,
    l.expected_monthly_volume,
    l.volume_currency,
    l.min_transaction_amount,
    l.max_transaction_amount,
    l.transaction_currency,
    case when l.client_user_id = auth.uid() then 'merchant' else 'agent' end::text
  from public.offerpsp_leads l
  where public.can_access_offerpsp_client_lead(l.lead_id)
  order by l.submitted_at desc;
$$;

create or replace function public.list_offerpsp_my_organizations()
returns table (
  organization_id uuid,
  internal_code text,
  organization_type text,
  name text,
  role text,
  managed_merchants bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    o.id,
    o.internal_code,
    o.organization_type,
    o.name,
    om.role,
    case when o.organization_type = 'agent' then (
      select count(*)
      from public.offerpsp_agent_clients ac
      where ac.agent_organization_id = o.id and ac.status = 'active'
    ) else 0 end
  from public.offerpsp_organization_members om
  join public.offerpsp_organizations o on o.id = om.organization_id
  where om.user_id = auth.uid()
    and om.active
    and o.status = 'active'
  order by o.name;
$$;

create or replace function public.list_offerpsp_client_deals(p_lead_id uuid default null)
returns table (
  lead_id uuid,
  option_code text,
  status text,
  telegram_group_title text,
  telegram_group_url text,
  telegram_created_at timestamptz,
  zoom_url text,
  zoom_scheduled_at timestamptz,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select
    i.lead_id,
    si.public_code,
    i.status,
    i.telegram_group_title,
    i.telegram_group_url,
    i.telegram_created_at,
    i.zoom_url,
    i.zoom_scheduled_at,
    i.closed_at
  from private.offerpsp_introductions i
  join private.offerpsp_provider_reviews pr on pr.id = i.provider_review_id
  join public.offerpsp_shortlist_items si on si.id = pr.shortlist_item_id
  where (p_lead_id is null or i.lead_id = p_lead_id)
    and public.can_access_offerpsp_client_lead(i.lead_id)
  order by i.created_at desc;
$$;

create or replace function public.ensure_offerpsp_portal_conversation(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_conversation_id uuid;
begin
  if not (
    public.is_offerpsp_staff()
    or public.can_access_offerpsp_client_lead(p_lead_id)
  ) then
    raise exception 'Access denied';
  end if;

  select id into v_conversation_id
  from public.offerpsp_conversations
  where lead_id = p_lead_id and channel = 'portal'
  order by created_at
  limit 1;

  if v_conversation_id is null then
    insert into public.offerpsp_conversations (lead_id, channel, subject, client_visible)
    values (p_lead_id, 'portal', 'OfferPSP support', true)
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.respond_offerpsp_option(
  p_option_code text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_response not in ('interested', 'need_details', 'not_suitable') then
    raise exception 'Unsupported option response';
  end if;

  select si.*
  into v_item
  from public.offerpsp_shortlist_items si
  join public.offerpsp_shortlists s on s.id = si.shortlist_id
  where si.public_code = p_option_code
    and s.status = 'shared'
    and public.can_access_offerpsp_client_lead(s.lead_id);

  if not found then
    raise exception 'OfferPSP option not found';
  end if;

  select lead_id into v_lead_id
  from public.offerpsp_shortlists
  where id = v_item.shortlist_id;

  update public.offerpsp_shortlist_items
  set client_response = p_response,
      client_responded_at = now(),
      selected_at = case when p_response = 'interested' then now() else selected_at end
  where id = v_item.id;

  if p_response = 'interested' then
    update public.offerpsp_leads
    set status = 'option_selected'
    where lead_id = v_lead_id
      and status not in ('provider_reviewing', 'provider_needs_info', 'provider_accepted', 'telegram_created', 'zoom_scheduled', 'won', 'lost');
  end if;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'client',
    'option_response',
    'Workspace user responded to an anonymous option',
    jsonb_build_object('option_code', p_option_code, 'response', p_response),
    true
  );

  return jsonb_build_object('option_code', p_option_code, 'response', p_response);
end;
$$;

create or replace function public.request_offerpsp_introduction(p_option_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
  v_dossier private.offerpsp_merchant_dossiers;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select si.*
  into v_item
  from public.offerpsp_shortlist_items si
  join public.offerpsp_shortlists s on s.id = si.shortlist_id
  where si.public_code = p_option_code
    and s.status = 'shared'
    and public.can_access_offerpsp_client_lead(s.lead_id);

  if not found then
    raise exception 'OfferPSP option not found';
  end if;

  select lead_id into v_lead_id
  from public.offerpsp_shortlists
  where id = v_item.shortlist_id;
  if v_item.offer_route_id is null or v_item.private_provider_id is null then
    raise exception 'This legacy option must be reissued from the private offer database before introduction';
  end if;

  update public.offerpsp_shortlist_items
  set client_response = 'interested',
      client_responded_at = coalesce(client_responded_at, now()),
      selected_at = coalesce(selected_at, now()),
      introduction_requested_at = now()
  where id = v_item.id;

  v_dossier := private.refresh_offerpsp_merchant_dossier(v_lead_id);

  update public.offerpsp_leads
  set status = case when v_dossier.status = 'ready' then 'dossier_ready' else 'needs_clarification' end
  where lead_id = v_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'client',
    'introduction_requested',
    'Workspace user requested an introduction',
    case when v_dossier.status = 'ready'
      then 'The merchant dossier is ready for staff verification.'
      else 'Additional merchant information is required before PSP review.'
    end,
    jsonb_build_object(
      'option_code', p_option_code,
      'dossier_status', v_dossier.status,
      'missing_fields', v_dossier.missing_fields
    ),
    true
  );

  return jsonb_build_object(
    'option_code', p_option_code,
    'status', v_dossier.status,
    'missing_fields', v_dossier.missing_fields
  );
end;
$$;

revoke all on public.offerpsp_organizations from public, anon;
revoke all on public.offerpsp_organization_members from public, anon;
revoke all on public.offerpsp_agent_clients from public, anon;
grant select, insert, update, delete on public.offerpsp_organizations to authenticated;
grant select, insert, update, delete on public.offerpsp_organization_members to authenticated;
grant select, insert, update, delete on public.offerpsp_agent_clients to authenticated;

revoke all on public.offerpsp_client_shortlist from public, anon;
grant select on public.offerpsp_client_shortlist to authenticated;

revoke all on function public.is_offerpsp_organization_member(uuid, text[]) from public;
revoke execute on function public.is_offerpsp_organization_member(uuid, text[]) from anon;
grant execute on function public.is_offerpsp_organization_member(uuid, text[]) to authenticated;

revoke all on function public.can_access_offerpsp_client_lead(uuid) from public;
revoke execute on function public.can_access_offerpsp_client_lead(uuid) from anon;
grant execute on function public.can_access_offerpsp_client_lead(uuid) to authenticated;

revoke all on function public.share_offerpsp_shortlist(uuid) from public;
revoke execute on function public.share_offerpsp_shortlist(uuid) from anon;
grant execute on function public.share_offerpsp_shortlist(uuid) to authenticated;

revoke all on function public.list_offerpsp_workspace_requests() from public;
revoke execute on function public.list_offerpsp_workspace_requests() from anon;
grant execute on function public.list_offerpsp_workspace_requests() to authenticated;

revoke all on function public.list_offerpsp_my_organizations() from public;
revoke execute on function public.list_offerpsp_my_organizations() from anon;
grant execute on function public.list_offerpsp_my_organizations() to authenticated;

revoke all on function public.list_offerpsp_client_deals(uuid) from public;
revoke execute on function public.list_offerpsp_client_deals(uuid) from anon;
grant execute on function public.list_offerpsp_client_deals(uuid) to authenticated;

revoke all on function public.ensure_offerpsp_portal_conversation(uuid) from public;
revoke execute on function public.ensure_offerpsp_portal_conversation(uuid) from anon;
grant execute on function public.ensure_offerpsp_portal_conversation(uuid) to authenticated;

revoke all on function public.respond_offerpsp_option(text, text) from public;
revoke execute on function public.respond_offerpsp_option(text, text) from anon;
grant execute on function public.respond_offerpsp_option(text, text) to authenticated;

revoke all on function public.request_offerpsp_introduction(text) from public;
revoke execute on function public.request_offerpsp_introduction(text) from anon;
grant execute on function public.request_offerpsp_introduction(text) to authenticated;

revoke all on function private.offerpsp_calculate_resale_fee(uuid, uuid) from public;
revoke all on function private.offerpsp_build_client_route_snapshot(uuid, uuid) from public;
revoke all on function private.validate_offerpsp_agent_client_types() from public;
revoke all on function private.validate_offerpsp_lead_organization_types() from public;

grant all on private.offerpsp_agent_margin_policies to service_role;
grant all on private.offerpsp_agent_commissions to service_role;

comment on table public.offerpsp_organizations is
  'Merchant and agent workspaces. Provider identity and private pricing never belong in this schema.';
comment on table private.offerpsp_agent_margin_policies is
  'Private reseller markup applied after the OfferPSP client rate. Client snapshots contain only the final merchant rate.';
comment on table private.offerpsp_agent_commissions is
  'Private projected-to-paid commission ledger for OfferPSP subagents.';
comment on view public.offerpsp_client_shortlist is
  'Client-safe normalized route snapshots only. Legacy options and all provider/base-margin identifiers are excluded.';
