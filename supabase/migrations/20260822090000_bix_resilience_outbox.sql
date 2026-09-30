create schema if not exists bix_resilience;

revoke all on schema bix_resilience from public, anon, authenticated;
grant usage on schema bix_resilience to service_role;

create table if not exists bix_resilience.outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  source_system text not null default 'supabase-primary',
  schema_name text not null,
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  aggregate_key jsonb not null default '{}'::jsonb,
  old_record jsonb,
  new_record jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  transaction_id bigint not null default txid_current(),
  schema_version integer not null default 1 check (schema_version > 0),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  claimed_by text,
  delivered_at timestamptz,
  last_error text
);

create index if not exists bix_resilience_outbox_pending_idx
  on bix_resilience.outbox_events (available_at, occurred_at)
  where status in ('pending', 'failed');

create index if not exists bix_resilience_outbox_aggregate_idx
  on bix_resilience.outbox_events (schema_name, table_name, occurred_at);

create table if not exists bix_resilience.applied_events (
  event_id uuid primary key,
  source_system text not null,
  payload_hash text not null,
  applied_at timestamptz not null default clock_timestamp()
);

create table if not exists bix_resilience.writer_leases (
  resource_key text primary key,
  holder text not null,
  fencing_token bigint not null check (fencing_token > 0),
  lease_until timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists bix_resilience.identity_links (
  internal_actor_id uuid not null,
  provider text not null,
  provider_subject text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (provider, provider_subject),
  unique (internal_actor_id, provider)
);

create table if not exists bix_resilience.delivery_ledger (
  delivery_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  channel text not null check (channel in ('email', 'telegram', 'webhook', 'other')),
  destination_fingerprint text not null,
  status text not null default 'prepared' check (status in ('prepared', 'sending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  last_error text
);

create table if not exists bix_resilience.reconciliation_runs (
  run_id uuid primary key default gen_random_uuid(),
  source_system text not null,
  target_system text not null,
  status text not null default 'running' check (status in ('running', 'passed', 'drift', 'failed')),
  source_count bigint,
  target_count bigint,
  source_checksum text,
  target_checksum text,
  differences jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  last_error text
);

revoke all on all tables in schema bix_resilience from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema bix_resilience to service_role;

create or replace function bix_resilience.capture_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, bix_resilience
as $$
declare
  primary_key_column text := tg_argv[0];
  before_record jsonb;
  after_record jsonb;
  aggregate_value jsonb;
begin
  if current_setting('bix_resilience.suppress_outbox', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  before_record := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_record := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  aggregate_value := coalesce(after_record -> primary_key_column, before_record -> primary_key_column, 'null'::jsonb);

  insert into bix_resilience.outbox_events (
    schema_name,
    table_name,
    operation,
    aggregate_key,
    old_record,
    new_record
  ) values (
    tg_table_schema,
    tg_table_name,
    tg_op,
    jsonb_build_object(primary_key_column, aggregate_value),
    before_record,
    after_record
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function bix_resilience.capture_change() from public, anon, authenticated;

do $$
declare
  target record;
  relation_name text;
begin
  for target in
    select *
    from (values
      ('private', 'offerpsp_contact_events', 'id'),
      ('private', 'offerpsp_entity_audit', 'id'),
      ('private', 'offerpsp_offer_routes', 'id'),
      ('private', 'offerpsp_providers', 'id'),
      ('private', 'offerpsp_research_notes', 'id'),
      ('private', 'offerpsp_route_matches', 'id'),
      ('public', 'offerpsp_conversations', 'id'),
      ('public', 'offerpsp_email_messages', 'id'),
      ('public', 'offerpsp_email_threads', 'id'),
      ('public', 'offerpsp_lead_activities', 'id'),
      ('public', 'offerpsp_leads', 'lead_id'),
      ('public', 'offerpsp_matches', 'id'),
      ('public', 'offerpsp_messages', 'id'),
      ('public', 'offerpsp_organization_members', 'id'),
      ('public', 'offerpsp_organizations', 'id'),
      ('public', 'offerpsp_seo_audit_runs', 'id'),
      ('public', 'offerpsp_shortlist_items', 'id'),
      ('public', 'offerpsp_shortlists', 'id'),
      ('public', 'offerpsp_tasks', 'id'),
      ('public', 'offerpsp_technical_audits', 'id')
    ) as tracked(schema_name, table_name, primary_key_column)
  loop
    relation_name := format('%I.%I', target.schema_name, target.table_name);
    if to_regclass(relation_name) is not null then
      execute format('drop trigger if exists bix_resilience_outbox on %s', relation_name);
      execute format(
        'create trigger bix_resilience_outbox after insert or update or delete on %s for each row execute function bix_resilience.capture_change(%L)',
        relation_name,
        target.primary_key_column
      );
    end if;
  end loop;
end;
$$;

create or replace function public.bix_reserve_claim_outbox(
  p_worker text,
  p_limit integer default 100,
  p_claim_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, bix_resilience
as $$
declare
  claimed_events jsonb;
begin
  if nullif(btrim(p_worker), '') is null then
    raise exception 'worker is required';
  end if;

  with candidates as (
    select event_id
    from bix_resilience.outbox_events
    where (
      status in ('pending', 'failed')
      or (status = 'claimed' and claimed_at < clock_timestamp() - make_interval(secs => greatest(p_claim_seconds, 30)))
    )
      and available_at <= clock_timestamp()
    order by occurred_at, event_id
    for update skip locked
    limit least(greatest(p_limit, 1), 500)
  ), claimed as (
    update bix_resilience.outbox_events as event
    set status = 'claimed',
        attempt_count = event.attempt_count + 1,
        claimed_at = clock_timestamp(),
        claimed_by = p_worker,
        last_error = null
    from candidates
    where event.event_id = candidates.event_id
    returning event.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.occurred_at, claimed.event_id), '[]'::jsonb)
  into claimed_events
  from claimed;

  return claimed_events;
end;
$$;

create or replace function public.bix_reserve_mark_outbox_delivered(
  p_worker text,
  p_event_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, bix_resilience
as $$
declare
  affected integer;
begin
  update bix_resilience.outbox_events
  set status = 'delivered',
      delivered_at = clock_timestamp(),
      claimed_at = null,
      claimed_by = null,
      last_error = null
  where event_id = any(p_event_ids)
    and status = 'claimed'
    and claimed_by = p_worker;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.bix_reserve_mark_outbox_failed(
  p_worker text,
  p_event_id uuid,
  p_error text,
  p_retry_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, bix_resilience
as $$
declare
  affected integer;
begin
  update bix_resilience.outbox_events
  set status = 'failed',
      available_at = clock_timestamp() + make_interval(secs => least(greatest(p_retry_seconds, 1), 3600)),
      claimed_at = null,
      claimed_by = null,
      last_error = left(coalesce(p_error, 'unknown error'), 2000)
  where event_id = p_event_id
    and status = 'claimed'
    and claimed_by = p_worker;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.bix_reserve_acquire_writer_lease(
  p_resource_key text,
  p_holder text,
  p_lease_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, bix_resilience
as $$
declare
  acquired bix_resilience.writer_leases%rowtype;
begin
  if nullif(btrim(p_resource_key), '') is null or nullif(btrim(p_holder), '') is null then
    raise exception 'resource_key and holder are required';
  end if;

  insert into bix_resilience.writer_leases as lease (
    resource_key,
    holder,
    fencing_token,
    lease_until,
    updated_at
  ) values (
    p_resource_key,
    p_holder,
    1,
    clock_timestamp() + make_interval(secs => least(greatest(p_lease_seconds, 5), 300)),
    clock_timestamp()
  )
  on conflict (resource_key) do update
  set holder = excluded.holder,
      fencing_token = lease.fencing_token + case
        when lease.holder <> excluded.holder or lease.lease_until <= clock_timestamp() then 1
        else 0
      end,
      lease_until = excluded.lease_until,
      updated_at = clock_timestamp()
  where lease.holder = excluded.holder or lease.lease_until <= clock_timestamp()
  returning * into acquired;

  if acquired.resource_key is null then
    return jsonb_build_object('acquired', false);
  end if;

  return jsonb_build_object(
    'acquired', true,
    'resource_key', acquired.resource_key,
    'holder', acquired.holder,
    'fencing_token', acquired.fencing_token,
    'lease_until', acquired.lease_until
  );
end;
$$;

create or replace function public.bix_reserve_assert_writer_lease(
  p_resource_key text,
  p_holder text,
  p_fencing_token bigint
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, bix_resilience
as $$
  select exists (
    select 1
    from bix_resilience.writer_leases
    where resource_key = p_resource_key
      and holder = p_holder
      and fencing_token = p_fencing_token
      and lease_until > now()
  );
$$;

revoke all on function public.bix_reserve_claim_outbox(text, integer, integer) from public, anon, authenticated;
revoke all on function public.bix_reserve_mark_outbox_delivered(text, uuid[]) from public, anon, authenticated;
revoke all on function public.bix_reserve_mark_outbox_failed(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.bix_reserve_acquire_writer_lease(text, text, integer) from public, anon, authenticated;
revoke all on function public.bix_reserve_assert_writer_lease(text, text, bigint) from public, anon, authenticated;

grant execute on function public.bix_reserve_claim_outbox(text, integer, integer) to service_role;
grant execute on function public.bix_reserve_mark_outbox_delivered(text, uuid[]) to service_role;
grant execute on function public.bix_reserve_mark_outbox_failed(text, uuid, text, integer) to service_role;
grant execute on function public.bix_reserve_acquire_writer_lease(text, text, integer) to service_role;
grant execute on function public.bix_reserve_assert_writer_lease(text, text, bigint) to service_role;
