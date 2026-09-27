-- Retire operational work that no longer has an active object behind it while
-- preserving every source row and its audit trail. Nothing in this migration
-- deletes mail, leads, routes, anomalies or execution history.

create or replace function private.offerpsp_cancel_inactive_intake_auto_reply(
  p_lead_id uuid,
  p_reason text,
  p_task_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  update private.offerpsp_intake_auto_replies
  set status = 'cancelled',
      reason_code = coalesce(nullif(trim(p_reason), ''), 'workflow_closed'),
      updated_at = now(),
      metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
        'cancelled_reason', coalesce(nullif(trim(p_reason), ''), 'workflow_closed'),
        'cancelled_task_id', p_task_id,
        'cancelled_at', now()
      ))
  where lead_id = p_lead_id
    and status in ('queued', 'review_required');

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    insert into public.offerpsp_lead_activities(
      lead_id, actor_type, activity_type, title, metadata
    ) values (
      p_lead_id,
      'system',
      'intake_auto_reply_cancelled',
      'Automatic first response removed from active attention',
      jsonb_strip_nulls(jsonb_build_object(
        'reason_code', coalesce(nullif(trim(p_reason), ''), 'workflow_closed'),
        'task_id', p_task_id
      ))
    );

    update private.offerpsp_stuck_intake_alerts
    set status = 'resolved',
        claim_token = null,
        reserved_at = null,
        updated_at = now()
    where lead_id = p_lead_id
      and status <> 'resolved';
  end if;

  return v_updated;
end;
$$;

revoke all on function private.offerpsp_cancel_inactive_intake_auto_reply(uuid, text, uuid)
  from public, anon, authenticated, service_role;

comment on function private.offerpsp_cancel_inactive_intake_auto_reply(uuid, text, uuid) is
  'Trigger-only lifecycle helper. Retains the auto-reply row but removes closed work from active attention.';

create or replace function private.offerpsp_close_auto_reply_with_intake_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.automation_ref = 'intake_response_v1'
     and new.status in ('done', 'cancelled')
     and old.status is distinct from new.status then
    perform private.offerpsp_cancel_inactive_intake_auto_reply(
      new.lead_id,
      case new.status
        when 'done' then 'intake_task_completed'
        else 'intake_task_cancelled'
      end,
      new.id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.offerpsp_close_auto_reply_with_intake_task()
  from public, anon, authenticated, service_role;

drop trigger if exists offerpsp_close_auto_reply_with_intake_task on public.offerpsp_tasks;
create trigger offerpsp_close_auto_reply_with_intake_task
after update of status on public.offerpsp_tasks
for each row
when (
  new.automation_ref = 'intake_response_v1'
  and new.status in ('done', 'cancelled')
  and old.status is distinct from new.status
)
execute function private.offerpsp_close_auto_reply_with_intake_task();

-- Keep the established inactive-lead cleanup and include the two later intake
-- tables that did not exist when the original trigger was introduced.
create or replace function private.offerpsp_cancel_tasks_for_inactive_lead()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.record_state = 'archived' or new.status in ('closed', 'spam') then
    update public.offerpsp_tasks
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'auto_cancelled_reason', 'merchant_lifecycle',
          'auto_cancelled_at', now()
        )
    where lead_id = new.lead_id
      and status in ('pending', 'in_progress');

    update private.offerpsp_offer_update_queue
    set status = 'dismissed',
        updated_at = now(),
        notes = concat_ws(
          E'\n',
          nullif(trim(notes), ''),
          '[system] Dismissed because the merchant workspace is inactive.'
        )
    where lead_id = new.lead_id
      and status in ('pending', 'in_progress');

    perform private.offerpsp_cancel_inactive_intake_auto_reply(
      new.lead_id,
      'merchant_lifecycle',
      null
    );
  end if;

  return new;
end;
$$;

revoke all on function private.offerpsp_cancel_tasks_for_inactive_lead()
  from public, anon, authenticated, service_role;

comment on function private.offerpsp_cancel_tasks_for_inactive_lead() is
  'Cancels active merchant work, intake replies and alerts when the merchant workspace becomes inactive.';

create or replace function private.offerpsp_ignore_archived_route_anomalies(
  p_route_id uuid,
  p_actor_user_id uuid,
  p_note text default 'Route archived; anomaly retained as history and removed from active attention.'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  with candidates as (
    select anomaly.*
    from private.offerpsp_route_anomalies anomaly
    where anomaly.route_id = p_route_id
      and anomaly.status = 'open'
    for update
  ), audit_rows as (
    insert into private.offerpsp_supply_activities(
      provider_id, route_id, batch_id, actor_user_id,
      action_type, summary, before_state, after_state
    )
    select
      route.provider_id,
      candidate.route_id,
      candidate.batch_id,
      p_actor_user_id,
      'anomaly_ignored',
      'Archived route anomaly removed from active attention',
      to_jsonb(candidate),
      to_jsonb(candidate) || jsonb_build_object(
        'status', 'ignored',
        'resolution_note', p_note,
        'resolved_by', p_actor_user_id,
        'resolved_at', now()
      )
    from candidates candidate
    join private.offerpsp_offer_routes route on route.id = candidate.route_id
    returning id
  ), updated as (
    update private.offerpsp_route_anomalies anomaly
    set status = 'ignored',
        resolution_note = p_note,
        resolved_by = p_actor_user_id,
        resolved_at = now()
    from candidates candidate
    where anomaly.id = candidate.id
    returning anomaly.id
  )
  select count(*)::integer into v_updated from updated;

  return v_updated;
end;
$$;

revoke all on function private.offerpsp_ignore_archived_route_anomalies(uuid, uuid, text)
  from public, anon, authenticated, service_role;

comment on function private.offerpsp_ignore_archived_route_anomalies(uuid, uuid, text) is
  'Trigger-only helper. Preserves anomalies and records an audit row when their route is archived.';

create or replace function private.offerpsp_archive_route_anomaly_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status is distinct from new.status then
    perform private.offerpsp_ignore_archived_route_anomalies(
      new.id,
      auth.uid(),
      'Route archived; anomaly retained as history and removed from active attention.'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.offerpsp_archive_route_anomaly_cleanup()
  from public, anon, authenticated, service_role;

drop trigger if exists offerpsp_archive_route_anomaly_cleanup on private.offerpsp_offer_routes;
create trigger offerpsp_archive_route_anomaly_cleanup
after update of status on private.offerpsp_offer_routes
for each row
when (new.status = 'archived' and old.status is distinct from new.status)
execute function private.offerpsp_archive_route_anomaly_cleanup();

-- One-time backfill: the verified August journal contains abandoned draft/send
-- intentions, not scheduled work. Keep the rows and mark them cancelled.
update private.aibot_execution_journal
set status = 'cancelled',
    completed_at = coalesce(completed_at, now()),
    result_summary = coalesce(
      result_summary,
      'Superseded operational tail cancelled during the 2026-09-27 hygiene pass.'
    ),
    metadata = metadata || jsonb_build_object(
      'cancelled_reason', 'superseded_operational_tail',
      'cancelled_at', now()
    ),
    updated_at = now()
where profile_key = 'BIXOFFPSP'
  and status in ('planned', 'in_progress')
  and entity_type = 'psp'
  and entity_id is null
  and scheduled_for is null
  and created_at < timestamptz '2026-09-01 00:00:00+00'
  and action_type in ('draft', 'create_email_draft', 'send_email');

-- One-time backfill for historic first-response rows whose lead or response
-- task is no longer active. The helper also resolves their Telegram alerts.
do $$
declare
  v_lead record;
begin
  for v_lead in
    select reply.lead_id,
      case
        when lead.record_state <> 'active' or lead.status in ('closed', 'spam', 'won', 'lost')
          then 'merchant_lifecycle'
        else 'response_task_inactive'
      end as reason_code
    from private.offerpsp_intake_auto_replies reply
    join public.offerpsp_leads lead on lead.lead_id = reply.lead_id
    where reply.status in ('queued', 'review_required')
      and (
        lead.record_state <> 'active'
        or lead.status in ('closed', 'spam', 'won', 'lost')
        or (
          reply.reason_code = 'response_task_inactive'
          and not exists (
            select 1
            from public.offerpsp_tasks task
            where task.lead_id = reply.lead_id
              and task.automation_ref = 'intake_response_v1'
              and task.status in ('pending', 'in_progress')
          )
        )
      )
  loop
    perform private.offerpsp_cancel_inactive_intake_auto_reply(
      v_lead.lead_id,
      v_lead.reason_code,
      null
    );
  end loop;
end;
$$;

-- One-time backfill for anomalies attached to routes that are already
-- archived. Published and draft routes remain untouched.
do $$
declare
  v_route record;
begin
  for v_route in
    select distinct route.id
    from private.offerpsp_offer_routes route
    join private.offerpsp_route_anomalies anomaly on anomaly.route_id = route.id
    where route.status = 'archived'
      and anomaly.status = 'open'
  loop
    perform private.offerpsp_ignore_archived_route_anomalies(
      v_route.id,
      null,
      'Historical archived route; anomaly retained as history and removed from active attention.'
    );
  end loop;
end;
$$;
