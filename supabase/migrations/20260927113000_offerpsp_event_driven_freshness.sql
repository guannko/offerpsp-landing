-- Replace calendar-driven PSP freshness reminders with merchant-specific
-- reconfirmation. Offer dates remain visible as evidence, but no task is
-- created until a route is actually prepared for a merchant shortlist.

create or replace function private.offerpsp_route_requires_reconfirmation(
  p_route_id uuid
)
returns boolean
language sql
stable
set search_path = public, private, pg_catalog
as $$
  select coalesce((
    select
      r.status = 'published'
      and (
        (r.expires_at is not null and r.expires_at < current_date)
        or p.last_verified_at is null
        or p.last_verified_at + make_interval(days => greatest(1, r.freshness_days)) < now()
      )
    from private.offerpsp_offer_routes r
    join private.offerpsp_providers p on p.id = r.provider_id
    where r.id = p_route_id
  ), false);
$$;

revoke all on function private.offerpsp_route_requires_reconfirmation(uuid)
  from public, anon, authenticated;

create or replace function private.queue_offerpsp_shortlist_reconfirmation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead_id uuid;
  v_provider_id uuid;
  v_provider_name text;
  v_route_title text;
begin
  if new.offer_route_id is null
     or not private.offerpsp_route_requires_reconfirmation(new.offer_route_id) then
    return new;
  end if;

  select
    shortlist.lead_id,
    route.provider_id,
    provider.brand_name,
    route.client_title
  into
    v_lead_id,
    v_provider_id,
    v_provider_name,
    v_route_title
  from public.offerpsp_shortlists shortlist
  join private.offerpsp_offer_routes route on route.id = new.offer_route_id
  join private.offerpsp_providers provider on provider.id = route.provider_id
  where shortlist.id = new.shortlist_id;

  insert into public.offerpsp_tasks(
    lead_id,
    source,
    title,
    details,
    status,
    priority,
    due_at,
    automation_ref,
    metadata
  )
  select
    v_lead_id,
    'system',
    format('Подтвердить оффер %s для мерчанта', v_provider_name),
    format(
      'Перед отправкой shortlist подтвердить у партнёра актуальность маршрута «%s». Условия хранятся как indicative и подтверждаются по запросу.',
      v_route_title
    ),
    'pending',
    'high',
    now(),
    'offerpsp:event-driven-reconfirmation',
    jsonb_build_object(
      'automation', 'offer_reconfirmation',
      'provider_id', v_provider_id,
      'route_id', new.offer_route_id,
      'shortlist_id', new.shortlist_id,
      'policy', 'event_driven'
    )
  where not exists (
    select 1
    from public.offerpsp_tasks task
    where task.lead_id = v_lead_id
      and task.metadata ->> 'automation' = 'offer_reconfirmation'
      and task.metadata ->> 'route_id' = new.offer_route_id::text
      and task.status in ('pending', 'in_progress')
  );

  return new;
end;
$$;

revoke all on function private.queue_offerpsp_shortlist_reconfirmation()
  from public, anon, authenticated;

drop trigger if exists offerpsp_shortlist_item_queue_reconfirmation
  on public.offerpsp_shortlist_items;
create trigger offerpsp_shortlist_item_queue_reconfirmation
after insert on public.offerpsp_shortlist_items
for each row execute function private.queue_offerpsp_shortlist_reconfirmation();

create or replace function private.guard_offerpsp_shortlist_share_reconfirmation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if new.status = 'shared'
     and old.status is distinct from 'shared'
     and exists (
       select 1
       from public.offerpsp_shortlist_items item
       where item.shortlist_id = new.id
         and item.offer_route_id is not null
         and private.offerpsp_route_requires_reconfirmation(item.offer_route_id)
     ) then
    raise exception 'Confirm current PSP terms before sharing this shortlist';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_offerpsp_shortlist_share_reconfirmation()
  from public, anon, authenticated;

drop trigger if exists offerpsp_shortlist_share_reconfirmation_guard
  on public.offerpsp_shortlists;
create trigger offerpsp_shortlist_share_reconfirmation_guard
before update of status on public.offerpsp_shortlists
for each row execute function private.guard_offerpsp_shortlist_share_reconfirmation();

create or replace function private.resolve_offerpsp_freshness_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if new.last_verified_at is distinct from old.last_verified_at
     and new.last_verified_at is not null then
    update private.offerpsp_freshness_reminders
    set status = 'resolved', snoozed_until = null
    where provider_id = new.id and status <> 'resolved';

    update public.offerpsp_tasks task
    set status = 'done',
        completed_at = coalesce(task.completed_at, now()),
        metadata = task.metadata || jsonb_build_object(
          'resolved_by', 'provider_confirmation',
          'resolved_at', now()
        )
    where task.source = 'system'
      and task.status in ('pending', 'in_progress')
      and task.metadata ->> 'provider_id' = new.id::text
      and (
        task.metadata ->> 'automation' = 'provider_freshness'
        or (
          task.metadata ->> 'automation' = 'offer_reconfirmation'
          and not private.offerpsp_route_requires_reconfirmation(
            nullif(task.metadata ->> 'route_id', '')::uuid
          )
        )
      );
  end if;
  return new;
end;
$$;

create or replace function private.resolve_offerpsp_reconfirmation_after_route_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  update public.offerpsp_tasks task
  set status = 'done',
      completed_at = coalesce(task.completed_at, now()),
      metadata = task.metadata || jsonb_build_object(
        'resolved_by', 'route_change',
        'resolved_at', now()
      )
  where task.source = 'system'
    and task.status in ('pending', 'in_progress')
    and task.metadata ->> 'automation' = 'offer_reconfirmation'
    and task.metadata ->> 'route_id' = new.id::text
    and (
      new.status <> 'published'
      or not private.offerpsp_route_requires_reconfirmation(new.id)
    );
  return new;
end;
$$;

revoke all on function private.resolve_offerpsp_reconfirmation_after_route_change()
  from public, anon, authenticated;

drop trigger if exists offerpsp_route_resolves_reconfirmation
  on private.offerpsp_offer_routes;
create trigger offerpsp_route_resolves_reconfirmation
after update of status, expires_at, freshness_days on private.offerpsp_offer_routes
for each row execute function private.resolve_offerpsp_reconfirmation_after_route_change();

create or replace function public.list_offerpsp_freshness_reminders()
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
  return '[]'::jsonb;
end;
$$;

create or replace function public.sync_offerpsp_freshness_reminders(
  p_notify_before_days integer default 7,
  p_repeat_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_retired_tasks integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff or service access required';
  end if;

  update private.offerpsp_freshness_reminders
  set status = 'resolved', snoozed_until = null
  where status <> 'resolved';

  update public.offerpsp_tasks task
  set status = 'done',
      completed_at = coalesce(task.completed_at, now()),
      metadata = task.metadata || jsonb_build_object(
        'resolved_by', 'event_driven_policy',
        'resolved_at', now()
      )
  where task.source = 'system'
    and task.metadata ->> 'automation' = 'provider_freshness'
    and task.status in ('pending', 'in_progress');

  get diagnostics v_retired_tasks = row_count;

  return jsonb_build_object(
    'queue', '[]'::jsonb,
    'notifications', '[]'::jsonb,
    'policy', 'event_driven_reconfirmation',
    'retired_tasks', v_retired_tasks
  );
end;
$$;

-- One-time operational cleanup. Preserve every row and its history while
-- removing the obsolete calendar work from active queues.
update private.offerpsp_freshness_reminders
set status = 'resolved', snoozed_until = null
where status <> 'resolved';

update public.offerpsp_tasks task
set status = 'done',
    completed_at = coalesce(task.completed_at, now()),
    metadata = task.metadata || jsonb_build_object(
      'resolved_by', 'event_driven_policy_migration',
      'resolved_at', now()
    )
where task.source = 'system'
  and task.metadata ->> 'automation' = 'provider_freshness'
  and task.status in ('pending', 'in_progress');

update public.offerpsp_tasks task
set status = 'done',
    completed_at = coalesce(task.completed_at, now()),
    metadata = task.metadata || jsonb_build_object(
      'resolved_by', 'completed_outreach_wave',
      'resolved_at', now()
    )
where task.id = '0d0c8961-1a67-4c34-9f76-2d5b6c9cdf27'::uuid
  and task.status in ('pending', 'in_progress');

drop index if exists public.offerpsp_open_freshness_task_provider_idx;

comment on table private.offerpsp_freshness_reminders is
  'Retired calendar reminder history. Active reconfirmation is created only for a specific merchant shortlist.';
comment on function public.sync_offerpsp_freshness_reminders(integer, integer) is
  'Compatibility no-op for the retired calendar schedule. Resolves legacy tasks and returns an empty queue.';
comment on function public.list_offerpsp_freshness_reminders() is
  'Returns an empty queue because reconfirmation is merchant-specific and represented by OfferPSP tasks.';
comment on function private.offerpsp_route_requires_reconfirmation(uuid) is
  'True only when a published route needs partner confirmation before it is shared with a specific merchant.';
