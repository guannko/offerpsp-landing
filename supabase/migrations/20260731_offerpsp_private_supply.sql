create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create sequence if not exists private.offerpsp_provider_code_seq;
create sequence if not exists private.offerpsp_route_code_seq;

create or replace function private.next_offerpsp_provider_code()
returns text
language sql
volatile
set search_path = pg_catalog, private
as $$
  select 'PSP-' || lpad(nextval('private.offerpsp_provider_code_seq')::text, 6, '0');
$$;

create or replace function private.next_offerpsp_route_code()
returns text
language sql
volatile
set search_path = pg_catalog, private
as $$
  select 'OFF-' || lpad(nextval('private.offerpsp_route_code_seq')::text, 6, '0');
$$;

create or replace function private.offerpsp_jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'array' then '{}'::text[]
    else coalesce(
      (
        select array_agg(upper(trim(item)) order by ordinal)
        from jsonb_array_elements_text(p_value) with ordinality as valueset(item, ordinal)
        where nullif(trim(item), '') is not null
      ),
      '{}'::text[]
    )
  end;
$$;

create or replace function private.offerpsp_jsonb_numeric(
  p_value jsonb,
  p_key text
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_text text;
begin
  v_text := nullif(trim(p_value ->> p_key), '');
  if v_text is null or v_text !~ '^-?[0-9]+([.][0-9]+)?$' then
    return null;
  end if;
  return v_text::numeric;
end;
$$;

create table if not exists private.offerpsp_providers (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null default private.next_offerpsp_provider_code(),
  legacy_psp_id integer unique references public.psp_providers(id) on delete set null,
  legal_name text,
  brand_name text not null,
  website text,
  relationship_status text not null default 'prospect'
    check (relationship_status in ('prospect', 'onboarding', 'active', 'paused', 'archived')),
  strategic_priority smallint not null default 50
    check (strategic_priority between 0 and 100),
  margin_included_default boolean not null default false,
  owner_user_id uuid references auth.users(id) on delete set null,
  relationship_notes text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_code)
);

create table if not exists private.offerpsp_provider_contacts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  full_name text not null,
  role_title text,
  region text,
  telegram text,
  email text,
  phone text,
  timezone text,
  preferred_channel text
    check (preferred_channel is null or preferred_channel in ('telegram', 'email', 'phone', 'other')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (telegram is not null or email is not null or phone is not null)
);

create table if not exists private.offerpsp_margin_policies (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  route_id uuid,
  merchant_lead_id uuid references public.offerpsp_leads(lead_id) on delete cascade,
  scope text not null default 'provider'
    check (scope in ('provider', 'route', 'flow', 'merchant')),
  flow text not null default 'all'
    check (flow in ('all', 'payin', 'payout', 'settlement', 'refund', 'chargeback')),
  mode text not null
    check (mode in ('included', 'percentage_points', 'relative_percent', 'fixed', 'hybrid', 'override')),
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
    mode = 'included'
    or mode = 'override'
    or percent_value is not null
    or fixed_value is not null
  ),
  check (fixed_value is null or fixed_currency is not null),
  check (override_fixed is null or fixed_currency is not null)
);

create table if not exists private.offerpsp_rate_card_batches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete restrict,
  batch_version integer not null check (batch_version > 0),
  source_type text not null
    check (source_type in ('telegram', 'email', 'file', 'csv', 'api', 'manual')),
  source_reference text,
  source_text text not null,
  source_hash text generated always as (md5(source_text)) stored,
  source_effective_date date,
  received_at timestamptz not null default now(),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'superseded', 'rejected')),
  parser_version text not null default 'manual-v1',
  parser_metadata jsonb not null default '{}'::jsonb,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  superseded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, batch_version),
  unique (provider_id, source_hash, parser_version),
  check (length(source_text) > 0)
);

create table if not exists private.offerpsp_offer_routes (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references private.offerpsp_providers(id) on delete restrict,
  batch_id uuid not null references private.offerpsp_rate_card_batches(id) on delete cascade,
  internal_code text not null default private.next_offerpsp_route_code(),
  client_title text not null,
  coverage_scope text not null default 'specific'
    check (coverage_scope in ('specific', 'regional', 'global')),
  geos text[] not null default '{}',
  blocked_geos text[] not null default '{}',
  currencies text[] not null default '{}',
  flow text not null check (flow in ('payin', 'payout', 'both')),
  methods text[] not null default '{}',
  card_brands text[] not null default '{}',
  traffic_types text[] not null default '{}',
  verticals text[] not null default '{}',
  prohibited_verticals text[] not null default '{}',
  integrations text[] not null default '{}',
  niche_key text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'paused', 'expired', 'archived')),
  effective_from date,
  expires_at date,
  freshness_days integer not null default 30 check (freshness_days > 0),
  min_monthly_volume numeric,
  max_monthly_volume numeric,
  volume_currency text,
  risk_terms jsonb not null default '{}'::jsonb,
  operational_notes text,
  raw_block text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_code),
  check (max_monthly_volume is null or min_monthly_volume is null or max_monthly_volume >= min_monthly_volume),
  check (expires_at is null or effective_from is null or expires_at >= effective_from)
);

alter table private.offerpsp_offer_routes
  drop constraint if exists offerpsp_offer_routes_publishable_dimensions_check;
alter table private.offerpsp_offer_routes
  add constraint offerpsp_offer_routes_publishable_dimensions_check
  check (
    status in ('draft', 'review', 'archived', 'expired')
    or (
      (coverage_scope <> 'specific' or cardinality(geos) > 0)
      and cardinality(currencies) > 0
      and cardinality(methods) > 0
    )
  );

alter table private.offerpsp_margin_policies
  drop constraint if exists offerpsp_margin_policies_route_id_fkey;
alter table private.offerpsp_margin_policies
  add constraint offerpsp_margin_policies_route_id_fkey
  foreign key (route_id) references private.offerpsp_offer_routes(id) on delete cascade;

create table if not exists private.offerpsp_offer_fee_components (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete cascade,
  flow text not null
    check (flow in ('payin', 'payout', 'settlement', 'refund', 'chargeback', 'decline')),
  traffic_tier text,
  method_scope text[] not null default '{}',
  region_scope text[] not null default '{}',
  fee_type text not null
    check (fee_type in ('percent', 'fixed', 'percent_plus_fixed')),
  base_percent numeric,
  base_fixed numeric,
  base_fixed_currency text,
  applies_on text not null default 'success'
    check (applies_on in ('success', 'decline', 'both', 'event')),
  minimum_fee numeric,
  maximum_fee numeric,
  source_text text,
  created_at timestamptz not null default now(),
  check (base_percent is not null or base_fixed is not null),
  check (base_fixed is null or base_fixed_currency is not null),
  check (maximum_fee is null or minimum_fee is null or maximum_fee >= minimum_fee)
);

create table if not exists private.offerpsp_offer_limits (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete cascade,
  flow text not null check (flow in ('payin', 'payout', 'both')),
  scope text not null default 'transaction'
    check (scope in ('transaction', 'card', 'account', 'day', 'month')),
  method_scope text[] not null default '{}',
  traffic_tier text,
  currency text not null,
  minimum_amount numeric,
  maximum_amount numeric,
  maximum_count integer,
  original_note text,
  created_at timestamptz not null default now(),
  check (maximum_count is null or maximum_count > 0)
);

create table if not exists private.offerpsp_settlement_terms (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete cascade,
  currency text,
  fee_percent numeric,
  fixed_fee numeric,
  fixed_fee_currency text,
  period text,
  minimum_amount numeric,
  exchange_source text,
  exchange_rule text,
  weekdays text[] not null default '{}',
  netting_percent numeric,
  liquidity_requirement text,
  original_note text,
  created_at timestamptz not null default now(),
  check (fixed_fee is null or fixed_fee_currency is not null),
  check (netting_percent is null or netting_percent between 0 and 100)
);

create table if not exists private.offerpsp_route_anomalies (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.offerpsp_rate_card_batches(id) on delete cascade,
  route_id uuid references private.offerpsp_offer_routes(id) on delete cascade,
  anomaly_code text not null,
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'error')),
  field_name text,
  message text not null,
  source_excerpt text,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'resolved', 'ignored')),
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists offerpsp_providers_status_idx
  on private.offerpsp_providers (relationship_status, strategic_priority desc);
create unique index if not exists offerpsp_providers_brand_name_key
  on private.offerpsp_providers (lower(brand_name));
create index if not exists offerpsp_batches_provider_idx
  on private.offerpsp_rate_card_batches (provider_id, batch_version desc);
create index if not exists offerpsp_batches_status_idx
  on private.offerpsp_rate_card_batches (status, received_at desc);
create index if not exists offerpsp_routes_provider_idx
  on private.offerpsp_offer_routes (provider_id, status);
create index if not exists offerpsp_routes_batch_idx
  on private.offerpsp_offer_routes (batch_id);
create index if not exists offerpsp_routes_geos_gin
  on private.offerpsp_offer_routes using gin (geos);
create index if not exists offerpsp_routes_currencies_gin
  on private.offerpsp_offer_routes using gin (currencies);
create index if not exists offerpsp_routes_methods_gin
  on private.offerpsp_offer_routes using gin (methods);
create index if not exists offerpsp_routes_verticals_gin
  on private.offerpsp_offer_routes using gin (verticals);
create index if not exists offerpsp_anomalies_batch_idx
  on private.offerpsp_route_anomalies (batch_id, status, severity);
create index if not exists offerpsp_margin_lookup_idx
  on private.offerpsp_margin_policies (provider_id, route_id, merchant_lead_id, flow, active);

create or replace function private.prevent_offerpsp_rate_card_source_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if new.provider_id is distinct from old.provider_id
    or new.source_text is distinct from old.source_text
    or new.source_reference is distinct from old.source_reference
    or new.source_effective_date is distinct from old.source_effective_date
    or new.received_at is distinct from old.received_at
  then
    raise exception 'Rate-card source fields are immutable; create a new batch version';
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_rate_card_source_immutable
  on private.offerpsp_rate_card_batches;
create trigger offerpsp_rate_card_source_immutable
before update on private.offerpsp_rate_card_batches
for each row execute function private.prevent_offerpsp_rate_card_source_mutation();

drop trigger if exists offerpsp_providers_set_updated_at
  on private.offerpsp_providers;
create trigger offerpsp_providers_set_updated_at
before update on private.offerpsp_providers
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_provider_contacts_set_updated_at
  on private.offerpsp_provider_contacts;
create trigger offerpsp_provider_contacts_set_updated_at
before update on private.offerpsp_provider_contacts
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_margin_policies_set_updated_at
  on private.offerpsp_margin_policies;
create trigger offerpsp_margin_policies_set_updated_at
before update on private.offerpsp_margin_policies
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_batches_set_updated_at
  on private.offerpsp_rate_card_batches;
create trigger offerpsp_batches_set_updated_at
before update on private.offerpsp_rate_card_batches
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_routes_set_updated_at
  on private.offerpsp_offer_routes;
create trigger offerpsp_routes_set_updated_at
before update on private.offerpsp_offer_routes
for each row execute function public.set_offerpsp_updated_at();

create or replace function public.upsert_offerpsp_provider(
  p_brand_name text,
  p_internal_code text default null,
  p_legal_name text default null,
  p_website text default null,
  p_relationship_status text default 'prospect',
  p_strategic_priority integer default 50,
  p_margin_included_default boolean default false,
  p_relationship_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_provider private.offerpsp_providers;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if nullif(trim(p_brand_name), '') is null then
    raise exception 'Provider brand name is required';
  end if;

  if p_internal_code is null then
    insert into private.offerpsp_providers (
      brand_name,
      legal_name,
      website,
      relationship_status,
      strategic_priority,
      margin_included_default,
      relationship_notes,
      owner_user_id
    )
    values (
      trim(p_brand_name),
      nullif(trim(p_legal_name), ''),
      nullif(trim(p_website), ''),
      p_relationship_status,
      p_strategic_priority,
      p_margin_included_default,
      nullif(trim(p_relationship_notes), ''),
      auth.uid()
    )
    returning * into v_provider;
  else
    update private.offerpsp_providers
    set brand_name = trim(p_brand_name),
        legal_name = nullif(trim(p_legal_name), ''),
        website = nullif(trim(p_website), ''),
        relationship_status = p_relationship_status,
        strategic_priority = p_strategic_priority,
        margin_included_default = p_margin_included_default,
        relationship_notes = nullif(trim(p_relationship_notes), '')
    where internal_code = p_internal_code
    returning * into v_provider;

    if not found then
      raise exception 'OfferPSP provider not found';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_provider.id,
    'internal_code', v_provider.internal_code,
    'brand_name', v_provider.brand_name,
    'relationship_status', v_provider.relationship_status,
    'strategic_priority', v_provider.strategic_priority,
    'margin_included_default', v_provider.margin_included_default
  );
end;
$$;

create or replace function public.import_offerpsp_rate_card(
  p_provider_code text,
  p_source_type text,
  p_source_text text,
  p_source_reference text default null,
  p_source_effective_date date default null,
  p_parser_version text default 'manual-v1',
  p_parser_metadata jsonb default '{}'::jsonb,
  p_routes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_provider private.offerpsp_providers;
  v_batch private.offerpsp_rate_card_batches;
  v_existing_batch_id uuid;
  v_batch_version integer;
  v_route_input jsonb;
  v_route private.offerpsp_offer_routes;
  v_component jsonb;
  v_anomaly jsonb;
  v_route_count integer := 0;
  v_anomaly_count integer := 0;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if nullif(trim(p_source_text), '') is null then
    raise exception 'Rate-card source text is required';
  end if;

  if jsonb_typeof(coalesce(p_routes, '[]'::jsonb)) <> 'array' then
    raise exception 'Routes payload must be a JSON array';
  end if;

  select *
  into v_provider
  from private.offerpsp_providers
  where internal_code = p_provider_code
  for update;

  if not found then
    raise exception 'OfferPSP provider not found';
  end if;

  select id
  into v_existing_batch_id
  from private.offerpsp_rate_card_batches
  where provider_id = v_provider.id
    and source_hash = md5(p_source_text)
    and parser_version = coalesce(nullif(trim(p_parser_version), ''), 'manual-v1');

  if v_existing_batch_id is not null then
    return jsonb_build_object(
      'batch_id', v_existing_batch_id,
      'duplicate', true,
      'provider_code', v_provider.internal_code
    );
  end if;

  select coalesce(max(batch_version), 0) + 1
  into v_batch_version
  from private.offerpsp_rate_card_batches
  where provider_id = v_provider.id;

  insert into private.offerpsp_rate_card_batches (
    provider_id,
    batch_version,
    source_type,
    source_reference,
    source_text,
    source_effective_date,
    parser_version,
    parser_metadata,
    created_by
  )
  values (
    v_provider.id,
    v_batch_version,
    p_source_type,
    nullif(trim(p_source_reference), ''),
    p_source_text,
    p_source_effective_date,
    coalesce(nullif(trim(p_parser_version), ''), 'manual-v1'),
    coalesce(p_parser_metadata, '{}'::jsonb),
    auth.uid()
  )
  returning * into v_batch;

  update private.offerpsp_rate_card_batches
  set status = 'superseded',
      superseded_at = now()
  where provider_id = v_provider.id
    and id <> v_batch.id
    and status in ('draft', 'review');

  update private.offerpsp_offer_routes r
  set status = 'archived',
      updated_at = now()
  from private.offerpsp_rate_card_batches b
  where r.batch_id = b.id
    and b.provider_id = v_provider.id
    and b.status = 'superseded'
    and r.status in ('draft', 'review');

  for v_route_input in
    select value from jsonb_array_elements(coalesce(p_routes, '[]'::jsonb))
  loop
    insert into private.offerpsp_offer_routes (
      provider_id,
      batch_id,
      client_title,
      coverage_scope,
      geos,
      blocked_geos,
      currencies,
      flow,
      methods,
      card_brands,
      traffic_types,
      verticals,
      prohibited_verticals,
      integrations,
      niche_key,
      effective_from,
      expires_at,
      freshness_days,
      min_monthly_volume,
      max_monthly_volume,
      volume_currency,
      risk_terms,
      operational_notes,
      raw_block
    )
    values (
      v_provider.id,
      v_batch.id,
      coalesce(nullif(trim(v_route_input ->> 'client_title'), ''), 'Payment route'),
      coalesce(nullif(lower(trim(v_route_input ->> 'coverage_scope')), ''), 'specific'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'geos'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'blocked_geos'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'currencies'),
      coalesce(nullif(lower(trim(v_route_input ->> 'flow')), ''), 'both'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'methods'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'card_brands'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'traffic_types'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'verticals'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'prohibited_verticals'),
      private.offerpsp_jsonb_text_array(v_route_input -> 'integrations'),
      nullif(upper(trim(v_route_input ->> 'niche_key')), ''),
      nullif(v_route_input ->> 'effective_from', '')::date,
      nullif(v_route_input ->> 'expires_at', '')::date,
      coalesce(private.offerpsp_jsonb_numeric(v_route_input, 'freshness_days')::integer, 30),
      private.offerpsp_jsonb_numeric(v_route_input, 'min_monthly_volume'),
      private.offerpsp_jsonb_numeric(v_route_input, 'max_monthly_volume'),
      nullif(upper(trim(v_route_input ->> 'volume_currency')), ''),
      coalesce(v_route_input -> 'risk_terms', '{}'::jsonb),
      nullif(trim(v_route_input ->> 'operational_notes'), ''),
      nullif(v_route_input ->> 'raw_block', '')
    )
    returning * into v_route;

    v_route_count := v_route_count + 1;

    for v_component in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'fees', '[]'::jsonb))
    loop
      insert into private.offerpsp_offer_fee_components (
        route_id,
        flow,
        traffic_tier,
        method_scope,
        region_scope,
        fee_type,
        base_percent,
        base_fixed,
        base_fixed_currency,
        applies_on,
        minimum_fee,
        maximum_fee,
        source_text
      )
      values (
        v_route.id,
        lower(v_component ->> 'flow'),
        nullif(upper(trim(v_component ->> 'traffic_tier')), ''),
        private.offerpsp_jsonb_text_array(v_component -> 'method_scope'),
        private.offerpsp_jsonb_text_array(v_component -> 'region_scope'),
        coalesce(nullif(lower(trim(v_component ->> 'fee_type')), ''), 'percent'),
        private.offerpsp_jsonb_numeric(v_component, 'base_percent'),
        private.offerpsp_jsonb_numeric(v_component, 'base_fixed'),
        nullif(upper(trim(v_component ->> 'base_fixed_currency')), ''),
        coalesce(nullif(lower(trim(v_component ->> 'applies_on')), ''), 'success'),
        private.offerpsp_jsonb_numeric(v_component, 'minimum_fee'),
        private.offerpsp_jsonb_numeric(v_component, 'maximum_fee'),
        nullif(v_component ->> 'source_text', '')
      );
    end loop;

    for v_component in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'limits', '[]'::jsonb))
    loop
      insert into private.offerpsp_offer_limits (
        route_id,
        flow,
        scope,
        method_scope,
        traffic_tier,
        currency,
        minimum_amount,
        maximum_amount,
        maximum_count,
        original_note
      )
      values (
        v_route.id,
        coalesce(nullif(lower(trim(v_component ->> 'flow')), ''), v_route.flow),
        coalesce(nullif(lower(trim(v_component ->> 'scope')), ''), 'transaction'),
        private.offerpsp_jsonb_text_array(v_component -> 'method_scope'),
        nullif(upper(trim(v_component ->> 'traffic_tier')), ''),
        upper(v_component ->> 'currency'),
        private.offerpsp_jsonb_numeric(v_component, 'minimum_amount'),
        private.offerpsp_jsonb_numeric(v_component, 'maximum_amount'),
        private.offerpsp_jsonb_numeric(v_component, 'maximum_count')::integer,
        nullif(v_component ->> 'original_note', '')
      );
    end loop;

    for v_component in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'settlement', '[]'::jsonb))
    loop
      insert into private.offerpsp_settlement_terms (
        route_id,
        currency,
        fee_percent,
        fixed_fee,
        fixed_fee_currency,
        period,
        minimum_amount,
        exchange_source,
        exchange_rule,
        weekdays,
        netting_percent,
        liquidity_requirement,
        original_note
      )
      values (
        v_route.id,
        nullif(upper(trim(v_component ->> 'currency')), ''),
        private.offerpsp_jsonb_numeric(v_component, 'fee_percent'),
        private.offerpsp_jsonb_numeric(v_component, 'fixed_fee'),
        nullif(upper(trim(v_component ->> 'fixed_fee_currency')), ''),
        nullif(upper(trim(v_component ->> 'period')), ''),
        private.offerpsp_jsonb_numeric(v_component, 'minimum_amount'),
        nullif(trim(v_component ->> 'exchange_source'), ''),
        nullif(trim(v_component ->> 'exchange_rule'), ''),
        private.offerpsp_jsonb_text_array(v_component -> 'weekdays'),
        private.offerpsp_jsonb_numeric(v_component, 'netting_percent'),
        nullif(trim(v_component ->> 'liquidity_requirement'), ''),
        nullif(v_component ->> 'original_note', '')
      );
    end loop;

    for v_anomaly in
      select value from jsonb_array_elements(coalesce(v_route_input -> 'anomalies', '[]'::jsonb))
    loop
      insert into private.offerpsp_route_anomalies (
        batch_id,
        route_id,
        anomaly_code,
        severity,
        field_name,
        message,
        source_excerpt
      )
      values (
        v_batch.id,
        v_route.id,
        coalesce(nullif(trim(v_anomaly ->> 'code'), ''), 'parser_warning'),
        coalesce(nullif(lower(trim(v_anomaly ->> 'severity')), ''), 'warning'),
        nullif(trim(v_anomaly ->> 'field'), ''),
        coalesce(nullif(trim(v_anomaly ->> 'message'), ''), 'Review this route'),
        nullif(v_anomaly ->> 'source_excerpt', '')
      );
      v_anomaly_count := v_anomaly_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'batch_version', v_batch.batch_version,
    'provider_code', v_provider.internal_code,
    'route_count', v_route_count,
    'anomaly_count', v_anomaly_count,
    'status', v_batch.status,
    'duplicate', false
  );
end;
$$;

create or replace function public.list_offerpsp_supply()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'internal_code', p.internal_code,
        'brand_name', p.brand_name,
        'legal_name', p.legal_name,
        'website', p.website,
        'relationship_status', p.relationship_status,
        'strategic_priority', p.strategic_priority,
        'margin_included_default', p.margin_included_default,
        'last_verified_at', p.last_verified_at,
        'batch_count', (select count(*) from private.offerpsp_rate_card_batches b where b.provider_id = p.id),
        'published_route_count', (select count(*) from private.offerpsp_offer_routes r where r.provider_id = p.id and r.status = 'published')
      ) order by p.strategic_priority desc, p.brand_name)
      from private.offerpsp_providers p
      where p.relationship_status <> 'archived'
    ), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'provider_id', b.provider_id,
        'provider_code', p.internal_code,
        'provider_name', p.brand_name,
        'batch_version', b.batch_version,
        'source_type', b.source_type,
        'source_reference', b.source_reference,
        'source_effective_date', b.source_effective_date,
        'received_at', b.received_at,
        'status', b.status,
        'parser_version', b.parser_version,
        'route_count', (select count(*) from private.offerpsp_offer_routes r where r.batch_id = b.id),
        'open_anomaly_count', (select count(*) from private.offerpsp_route_anomalies a where a.batch_id = b.id and a.status = 'open')
      ) order by b.received_at desc)
      from private.offerpsp_rate_card_batches b
      join private.offerpsp_providers p on p.id = b.provider_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.publish_offerpsp_rate_card(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_batch private.offerpsp_rate_card_batches;
  v_provider private.offerpsp_providers;
  v_route_count integer;
  v_blocking_anomalies integer;
  v_missing_pricing integer;
  v_missing_dimensions integer;
  v_invalid_limits integer;
  v_margin_ready boolean;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_batch
  from private.offerpsp_rate_card_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Rate-card batch not found';
  end if;

  if v_batch.status not in ('draft', 'review') then
    raise exception 'Only draft or review batches can be published';
  end if;

  select * into v_provider
  from private.offerpsp_providers
  where id = v_batch.provider_id;

  select count(*) into v_route_count
  from private.offerpsp_offer_routes
  where batch_id = v_batch.id
    and status in ('draft', 'review');

  select count(*) into v_blocking_anomalies
  from private.offerpsp_route_anomalies a
  join private.offerpsp_offer_routes r on r.id = a.route_id
  where a.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and a.status = 'open'
    and a.severity = 'error';

  select count(*) into v_missing_pricing
  from private.offerpsp_offer_routes r
  where r.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and not exists (
      select 1
      from private.offerpsp_offer_fee_components f
      where f.route_id = r.id
    );

  select count(*) into v_missing_dimensions
  from private.offerpsp_offer_routes r
  where r.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and (
      (r.coverage_scope = 'specific' and cardinality(r.geos) = 0)
      or cardinality(r.currencies) = 0
      or cardinality(r.methods) = 0
    );

  select count(*) into v_invalid_limits
  from private.offerpsp_offer_limits l
  join private.offerpsp_offer_routes r on r.id = l.route_id
  where r.batch_id = v_batch.id
    and r.status in ('draft', 'review')
    and l.minimum_amount is not null
    and l.maximum_amount is not null
    and l.maximum_amount < l.minimum_amount;

  v_margin_ready := v_provider.margin_included_default or exists (
    select 1
    from private.offerpsp_margin_policies mp
    where mp.provider_id = v_provider.id
      and mp.active
      and mp.effective_from <= now()
      and (mp.effective_to is null or mp.effective_to > now())
  );

  if v_route_count = 0 then
    raise exception 'A rate-card must contain at least one route';
  end if;
  if v_blocking_anomalies > 0 then
    raise exception 'Resolve all error-level anomalies before publication';
  end if;
  if v_missing_pricing > 0 then
    raise exception 'Every route requires at least one fee component';
  end if;
  if v_missing_dimensions > 0 then
    raise exception 'Every published route requires GEO coverage, currency and payment method';
  end if;
  if v_invalid_limits > 0 then
    raise exception 'Resolve transaction limits where maximum is below minimum';
  end if;
  if not v_margin_ready then
    raise exception 'A provider margin policy is required before publication';
  end if;

  update private.offerpsp_rate_card_batches
  set status = 'superseded',
      superseded_at = now()
  where provider_id = v_batch.provider_id
    and status = 'published'
    and id <> v_batch.id;

  update private.offerpsp_offer_routes r
  set status = 'archived'
  from private.offerpsp_rate_card_batches b
  where r.batch_id = b.id
    and b.provider_id = v_batch.provider_id
    and b.status = 'superseded'
    and r.status = 'published';

  update private.offerpsp_offer_routes
  set status = 'published'
  where batch_id = v_batch.id
    and status in ('draft', 'review');

  update private.offerpsp_rate_card_batches
  set status = 'published',
      published_by = auth.uid(),
      published_at = now()
  where id = v_batch.id;

  update private.offerpsp_providers
  set relationship_status = case
        when relationship_status in ('prospect', 'onboarding') then 'active'
        else relationship_status
      end,
      last_verified_at = now()
  where id = v_batch.provider_id;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'provider_code', v_provider.internal_code,
    'status', 'published',
    'route_count', v_route_count
  );
end;
$$;

revoke all on function private.next_offerpsp_provider_code() from public;
revoke all on function private.next_offerpsp_route_code() from public;
revoke all on function private.offerpsp_jsonb_text_array(jsonb) from public;
revoke all on function private.offerpsp_jsonb_numeric(jsonb, text) from public;
revoke all on function private.prevent_offerpsp_rate_card_source_mutation() from public;

revoke all on function public.upsert_offerpsp_provider(text, text, text, text, text, integer, boolean, text) from public;
revoke execute on function public.upsert_offerpsp_provider(text, text, text, text, text, integer, boolean, text) from anon;
grant execute on function public.upsert_offerpsp_provider(text, text, text, text, text, integer, boolean, text) to authenticated;

revoke all on function public.import_offerpsp_rate_card(text, text, text, text, date, text, jsonb, jsonb) from public;
revoke execute on function public.import_offerpsp_rate_card(text, text, text, text, date, text, jsonb, jsonb) from anon;
grant execute on function public.import_offerpsp_rate_card(text, text, text, text, date, text, jsonb, jsonb) to authenticated;

revoke all on function public.list_offerpsp_supply() from public;
revoke execute on function public.list_offerpsp_supply() from anon;
grant execute on function public.list_offerpsp_supply() to authenticated;

revoke all on function public.publish_offerpsp_rate_card(uuid) from public;
revoke execute on function public.publish_offerpsp_rate_card(uuid) from anon;
grant execute on function public.publish_offerpsp_rate_card(uuid) to authenticated;

grant all on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;

alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private grant all on tables to service_role;
alter default privileges in schema private grant usage, select on sequences to service_role;

comment on schema private is
  'OfferPSP internal data. Provider identity, source pricing, margins and route mappings must never be exposed directly to clients.';
comment on table private.offerpsp_rate_card_batches is
  'Immutable partner source snapshots. Updates create a new batch version instead of replacing source data.';
comment on function public.import_offerpsp_rate_card(text, text, text, text, date, text, jsonb, jsonb) is
  'Staff-only draft importer. It never publishes parsed routes automatically.';
