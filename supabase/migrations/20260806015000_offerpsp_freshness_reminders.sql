create table if not exists private.offerpsp_freshness_reminders (
  provider_id uuid primary key references private.offerpsp_providers(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'snoozed', 'resolved')),
  snoozed_until timestamptz,
  last_notified_at timestamptz,
  notification_count integer not null default 0 check (notification_count >= 0),
  last_channel text,
  last_recipient text,
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists offerpsp_freshness_reminders_set_updated_at
  on private.offerpsp_freshness_reminders;
create trigger offerpsp_freshness_reminders_set_updated_at
before update on private.offerpsp_freshness_reminders
for each row execute function public.set_offerpsp_updated_at();

create unique index if not exists offerpsp_open_freshness_task_provider_idx
  on public.offerpsp_tasks ((metadata ->> 'provider_id'))
  where source = 'system'
    and metadata ->> 'automation' = 'provider_freshness'
    and status in ('pending', 'in_progress');

create or replace function private.offerpsp_freshness_candidates(p_notify_before_days integer)
returns table (
  provider_id uuid,
  provider_code text,
  provider_name text,
  due_at timestamptz,
  active_route_count integer,
  stale_route_count integer,
  nearest_expiry date,
  contact_name text,
  contact_channel text,
  contact_value text
)
language sql
stable
set search_path = public, private, pg_catalog
as $$
  with route_state as (
    select
      p.id as provider_id,
      p.internal_code as provider_code,
      p.brand_name as provider_name,
      p.last_verified_at,
      count(r.id)::integer as active_route_count,
      count(r.id) filter (
        where (r.expires_at is not null and r.expires_at < current_date)
          or (
            p.last_verified_at is not null
            and p.last_verified_at + make_interval(days => r.freshness_days) < now()
          )
      )::integer as stale_route_count,
      min(r.expires_at) as nearest_expiry,
      min(r.freshness_days) as freshness_days,
      max(coalesce(b.source_effective_date::timestamptz, b.received_at)) as latest_source_at
    from private.offerpsp_providers p
    join private.offerpsp_offer_routes r on r.provider_id = p.id
    join private.offerpsp_rate_card_batches b on b.id = r.batch_id
    where p.relationship_status in ('onboarding', 'active')
      and r.status in ('draft', 'review', 'published', 'paused')
    group by p.id
  ), candidates as (
    select
      rs.*,
      least(
        coalesce(rs.nearest_expiry::timestamptz, 'infinity'::timestamptz),
        coalesce(rs.last_verified_at, rs.latest_source_at, now())
          + make_interval(days => greatest(1, rs.freshness_days))
      ) as calculated_due_at
    from route_state rs
  )
  select
    c.provider_id,
    c.provider_code,
    c.provider_name,
    c.calculated_due_at,
    c.active_route_count,
    c.stale_route_count,
    c.nearest_expiry,
    contact.full_name,
    contact.channel,
    contact.value
  from candidates c
  left join lateral (
    select
      pc.full_name,
      case
        when pc.preferred_channel = 'telegram' and pc.telegram is not null then 'telegram'
        when pc.preferred_channel = 'email' and pc.email is not null then 'email'
        when pc.telegram is not null then 'telegram'
        when pc.email is not null then 'email'
        when pc.phone is not null then 'phone'
        else null
      end as channel,
      case
        when pc.preferred_channel = 'telegram' and pc.telegram is not null then pc.telegram
        when pc.preferred_channel = 'email' and pc.email is not null then pc.email
        when pc.telegram is not null then pc.telegram
        when pc.email is not null then pc.email
        else pc.phone
      end as value
    from private.offerpsp_provider_contacts pc
    where pc.provider_id = c.provider_id and pc.active
    order by
      (pc.preferred_channel = 'telegram' and pc.telegram is not null) desc,
      (pc.preferred_channel = 'email' and pc.email is not null) desc,
      pc.created_at
    limit 1
  ) contact on true
  where c.calculated_due_at <= now() + make_interval(days => greatest(0, p_notify_before_days));
$$;

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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'provider_id', c.provider_id,
        'provider_code', c.provider_code,
        'provider_name', c.provider_name,
        'due_at', r.due_at,
        'days_overdue', greatest(0, floor(extract(epoch from (now() - r.due_at)) / 86400))::integer,
        'active_route_count', c.active_route_count,
        'stale_route_count', c.stale_route_count,
        'nearest_expiry', c.nearest_expiry,
        'status', r.status,
        'snoozed_until', r.snoozed_until,
        'last_notified_at', r.last_notified_at,
        'notification_count', r.notification_count,
        'contact_name', c.contact_name,
        'contact_channel', c.contact_channel,
        'contact_value', c.contact_value,
        'message_ru', format(
          E'Привет! Подтвердите, пожалуйста, актуальны ли текущие платёжные условия %s. Если появились новые GEO, методы, лимиты или ставки, пришлите обновлённый оффер одним сообщением или файлом.',
          c.provider_name
        ),
        'message_en', format(
          E'Hi! Could you please confirm whether the current %s payment terms are still valid? If GEOs, methods, limits or rates have changed, please send the updated offer as a message or file.',
          c.provider_name
        )
      ) order by r.due_at, c.provider_name
    )
    from private.offerpsp_freshness_reminders r
    join private.offerpsp_freshness_candidates(3650) c on c.provider_id = r.provider_id
    where r.status in ('pending', 'snoozed')
      and (r.status <> 'snoozed' or r.snoozed_until <= now())
  ), '[]'::jsonb);
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
  v_candidate record;
  v_task_id uuid;
  v_queue jsonb;
  v_notifications jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff or service access required';
  end if;

  update private.offerpsp_freshness_reminders reminder
  set status = 'resolved', snoozed_until = null
  where reminder.status <> 'resolved'
    and not exists (
      select 1
      from private.offerpsp_freshness_candidates(p_notify_before_days) candidate
      where candidate.provider_id = reminder.provider_id
    );

  for v_candidate in
    select * from private.offerpsp_freshness_candidates(p_notify_before_days)
  loop
    insert into private.offerpsp_freshness_reminders(provider_id, due_at, status)
    values (v_candidate.provider_id, v_candidate.due_at, 'pending')
    on conflict (provider_id) do update
      set due_at = excluded.due_at,
          status = case
            when private.offerpsp_freshness_reminders.status = 'snoozed'
              and private.offerpsp_freshness_reminders.snoozed_until > now()
              then 'snoozed'
            else 'pending'
          end,
          last_notified_at = case
            when private.offerpsp_freshness_reminders.status = 'resolved'
              or private.offerpsp_freshness_reminders.due_at is distinct from excluded.due_at
              then null
            else private.offerpsp_freshness_reminders.last_notified_at
          end,
          notification_count = case
            when private.offerpsp_freshness_reminders.status = 'resolved'
              or private.offerpsp_freshness_reminders.due_at is distinct from excluded.due_at
              then 0
            else private.offerpsp_freshness_reminders.notification_count
          end;

    select id into v_task_id
    from public.offerpsp_tasks
    where source = 'system'
      and metadata ->> 'automation' = 'provider_freshness'
      and metadata ->> 'provider_id' = v_candidate.provider_id::text
      and status in ('pending', 'in_progress')
    order by created_at desc
    limit 1;

    if v_task_id is null then
      insert into public.offerpsp_tasks(
        source, title, details, status, priority, due_at, automation_ref, metadata
      ) values (
        'system',
        format('Подтвердить условия %s', v_candidate.provider_name),
        format(
          'Проверить ставки, GEO, методы и лимиты. Контакт: %s.',
          coalesce(v_candidate.contact_value, 'не указан — добавить в карточке PSP')
        ),
        'pending',
        case when v_candidate.due_at < now() then 'high' else 'normal' end,
        v_candidate.due_at,
        'n8n:offerpsp-provider-freshness',
        jsonb_build_object(
          'automation', 'provider_freshness',
          'provider_id', v_candidate.provider_id,
          'provider_code', v_candidate.provider_code
        )
      );
    else
      update public.offerpsp_tasks
      set due_at = v_candidate.due_at,
          priority = case when v_candidate.due_at < now() then 'high' else 'normal' end,
          details = format(
            'Проверить ставки, GEO, методы и лимиты. Контакт: %s.',
            coalesce(v_candidate.contact_value, 'не указан — добавить в карточке PSP')
          )
      where id = v_task_id;
    end if;
  end loop;

  update public.offerpsp_tasks task
  set status = 'done', completed_at = coalesce(completed_at, now())
  where task.source = 'system'
    and task.metadata ->> 'automation' = 'provider_freshness'
    and task.status in ('pending', 'in_progress')
    and not exists (
      select 1
      from private.offerpsp_freshness_reminders reminder
      where reminder.provider_id::text = task.metadata ->> 'provider_id'
        and reminder.status in ('pending', 'snoozed')
    );

  v_queue := public.list_offerpsp_freshness_reminders();
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_notifications
  from jsonb_array_elements(v_queue) item
  where nullif(item ->> 'last_notified_at', '') is null
    or (item ->> 'last_notified_at')::timestamptz <= now() - make_interval(days => greatest(1, p_repeat_days));

  return jsonb_build_object('queue', v_queue, 'notifications', v_notifications);
end;
$$;

create or replace function public.mark_offerpsp_freshness_notified(
  p_provider_id uuid,
  p_channel text,
  p_recipient text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_reminder private.offerpsp_freshness_reminders;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff or service access required';
  end if;
  if p_channel not in ('telegram', 'email', 'cockpit') then
    raise exception 'Unsupported reminder channel';
  end if;

  update private.offerpsp_freshness_reminders
  set last_notified_at = now(),
      notification_count = notification_count + 1,
      last_channel = p_channel,
      last_recipient = nullif(trim(p_recipient), ''),
      last_message = nullif(trim(p_message), '')
  where provider_id = p_provider_id and status in ('pending', 'snoozed')
  returning * into v_reminder;

  if not found then raise exception 'Active freshness reminder not found'; end if;
  return to_jsonb(v_reminder);
end;
$$;

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

    update public.offerpsp_tasks
    set status = 'done', completed_at = coalesce(completed_at, now())
    where source = 'system'
      and metadata ->> 'automation' = 'provider_freshness'
      and metadata ->> 'provider_id' = new.id::text
      and status in ('pending', 'in_progress');
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_provider_freshness_resolves_reminder
  on private.offerpsp_providers;
create trigger offerpsp_provider_freshness_resolves_reminder
after update of last_verified_at on private.offerpsp_providers
for each row execute function private.resolve_offerpsp_freshness_after_confirmation();

revoke all on private.offerpsp_freshness_reminders from public, anon, authenticated;
grant all on private.offerpsp_freshness_reminders to service_role;

revoke all on function private.offerpsp_freshness_candidates(integer) from public, anon, authenticated;
revoke all on function private.resolve_offerpsp_freshness_after_confirmation() from public, anon, authenticated;
revoke all on function public.list_offerpsp_freshness_reminders() from public, anon;
revoke all on function public.sync_offerpsp_freshness_reminders(integer,integer) from public, anon;
revoke all on function public.mark_offerpsp_freshness_notified(uuid,text,text,text) from public, anon;

grant execute on function public.list_offerpsp_freshness_reminders() to authenticated, service_role;
grant execute on function public.sync_offerpsp_freshness_reminders(integer,integer) to authenticated, service_role;
grant execute on function public.mark_offerpsp_freshness_notified(uuid,text,text,text) to authenticated, service_role;

comment on table private.offerpsp_freshness_reminders is
  'Private partner freshness queue. n8n creates one operational task per PSP and notifies Boris without exposing provider data to clients.';
