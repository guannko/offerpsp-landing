-- Notify the private operator chat only when an active intake is genuinely stuck.
-- The 12-hour n8n recovery schedule claims these durable alerts. A 24-hour
-- notification interval prevents repeated noise while preserving escalation.

create table if not exists private.offerpsp_stuck_intake_alerts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.offerpsp_leads(lead_id) on delete cascade,
  state_hash text not null,
  alert_kind text not null check (alert_kind in (
    'auto_reply_queued', 'auto_reply_claimed', 'operator_review', 'task_overdue'
  )),
  reason_code text,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'sent', 'resolved')),
  claim_token uuid,
  reserved_at timestamptz,
  last_notified_at timestamptz,
  notification_count integer not null default 0 check (notification_count >= 0),
  telegram_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.offerpsp_stuck_intake_alerts enable row level security;
revoke all on private.offerpsp_stuck_intake_alerts from public, anon, authenticated, service_role;

create index if not exists offerpsp_stuck_intake_alerts_status_idx
  on private.offerpsp_stuck_intake_alerts(status, last_notified_at, updated_at);

create or replace view private.offerpsp_stuck_intake_candidates as
with classified as (
  select
    l.lead_id,
    coalesce(nullif(l.company, ''), nullif(l.name, ''), l.work_email, 'Merchant') as company,
    l.status as lead_status,
    case
      when ar.status = 'queued' and ar.updated_at <= now() - interval '20 minutes'
        then 'auto_reply_queued'
      when ar.status = 'claimed' and coalesce(ar.claimed_at, ar.updated_at) <= now() - interval '15 minutes'
        then 'auto_reply_claimed'
      when ar.status in ('review_required', 'uncertain') and ar.updated_at <= now() - interval '30 minutes'
        then 'operator_review'
      when t.status in ('pending', 'in_progress') and t.due_at < now()
        then 'task_overdue'
      else null
    end as alert_kind,
    case
      when ar.status in ('queued', 'claimed', 'review_required', 'uncertain') then coalesce(ar.reason_code, ar.status)
      when t.status in ('pending', 'in_progress') and t.due_at < now() then 'intake_response_overdue'
      else null
    end as reason_code,
    case
      when ar.status = 'queued' then ar.updated_at
      when ar.status = 'claimed' then coalesce(ar.claimed_at, ar.updated_at)
      when ar.status in ('review_required', 'uncertain') then ar.updated_at
      else t.due_at
    end as detected_at,
    case
      when ar.status in ('queued', 'claimed') then 1
      when ar.status in ('review_required', 'uncertain') then 2
      else 3
    end as priority_rank,
    ar.status as auto_reply_status,
    t.status as task_status,
    t.due_at
  from public.offerpsp_leads l
  left join private.offerpsp_intake_auto_replies ar on ar.lead_id = l.lead_id
  left join public.offerpsp_tasks t
    on t.lead_id = l.lead_id and t.automation_ref = 'intake_response_v1'
  where l.record_state = 'active'
    and l.status not in ('closed', 'spam', 'won', 'lost')
    and coalesce(l.source, '') <> 'internal_release_canary'
), candidates as (
  select *, md5(concat_ws('|', lead_id::text, alert_kind, reason_code,
    coalesce(auto_reply_status, ''), coalesce(task_status, ''), coalesce(due_at::text, ''))) as state_hash
  from classified
  where alert_kind is not null
)
select * from candidates;

revoke all on private.offerpsp_stuck_intake_candidates from public, anon, authenticated, service_role;

create or replace function public.claim_offerpsp_stuck_intake_alert()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_alert private.offerpsp_stuck_intake_alerts%rowtype;
  v_chat_id text;
  v_enabled boolean;
  v_token uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('offerpsp_stuck_intake_alert', 0));

  select i.enabled, i.configuration ->> 'default_chat_id'
  into v_enabled, v_chat_id
  from private.offerpsp_integration_settings i
  where i.integration_key = 'telegram';

  if not coalesce(v_enabled, false)
     or not coalesce((select (configuration ->> 'lead_notifications')::boolean
                      from private.offerpsp_integration_settings
                      where integration_key = 'telegram'), false)
     or coalesce(v_chat_id, '') !~ '^[1-9][0-9]*$' then
    return jsonb_build_object('outcome', 'disabled');
  end if;

  update private.offerpsp_stuck_intake_alerts a
  set status = 'resolved', claim_token = null, reserved_at = null, updated_at = now()
  where a.status <> 'resolved'
    and not exists (
      select 1 from private.offerpsp_stuck_intake_candidates c
      where c.lead_id = a.lead_id and c.state_hash = a.state_hash
    );

  select c.* into v_candidate
  from private.offerpsp_stuck_intake_candidates c
  left join private.offerpsp_stuck_intake_alerts a on a.lead_id = c.lead_id
  where a.lead_id is null
     or a.state_hash <> c.state_hash
     or a.status = 'pending'
     or (a.status = 'claimed' and a.reserved_at <= now() - interval '15 minutes')
     or (a.status in ('sent', 'resolved') and coalesce(a.last_notified_at, '-infinity'::timestamptz) <= now() - interval '24 hours')
  order by c.priority_rank, c.detected_at, c.lead_id
  limit 1;

  if v_candidate.lead_id is null then
    return jsonb_build_object('outcome', 'empty');
  end if;

  insert into private.offerpsp_stuck_intake_alerts(
    lead_id, state_hash, alert_kind, reason_code, status, claim_token, reserved_at, updated_at
  ) values (
    v_candidate.lead_id, v_candidate.state_hash, v_candidate.alert_kind,
    v_candidate.reason_code, 'claimed', v_token, now(), now()
  )
  on conflict (lead_id) do update set
    state_hash = excluded.state_hash,
    alert_kind = excluded.alert_kind,
    reason_code = excluded.reason_code,
    status = 'claimed',
    claim_token = excluded.claim_token,
    reserved_at = excluded.reserved_at,
    updated_at = excluded.updated_at
  returning * into v_alert;

  return jsonb_strip_nulls(jsonb_build_object(
    'outcome', 'ready',
    'alert_id', v_alert.id,
    'claim_token', v_token,
    'lead_id', v_candidate.lead_id,
    'chat_id', v_chat_id,
    'company', v_candidate.company,
    'lead_status', v_candidate.lead_status,
    'alert_kind', v_candidate.alert_kind,
    'reason_code', v_candidate.reason_code,
    'detected_at', v_candidate.detected_at,
    'due_at', v_candidate.due_at,
    'notification_count', v_alert.notification_count,
    'merchant_url', 'https://ops-7q4m2x9k8v3n.vercel.app/merchants/' || v_candidate.lead_id::text
  ));
end;
$$;

create or replace function public.complete_offerpsp_stuck_intake_alert(
  p_lead_id uuid,
  p_claim_token uuid,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert private.offerpsp_stuck_intake_alerts%rowtype;
begin
  update private.offerpsp_stuck_intake_alerts
  set status = 'sent',
      claim_token = null,
      reserved_at = null,
      last_notified_at = now(),
      notification_count = notification_count + 1,
      telegram_message_id = nullif(trim(p_message_id), ''),
      updated_at = now()
  where lead_id = p_lead_id
    and status = 'claimed'
    and claim_token = p_claim_token
  returning * into v_alert;

  if v_alert.id is null then
    return jsonb_build_object('outcome', 'stale');
  end if;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_type, activity_type, title, metadata
  ) values (
    p_lead_id, 'system', 'stuck_intake_alert_sent',
    'Operator notified about a stuck intake',
    jsonb_build_object(
      'alert_kind', v_alert.alert_kind,
      'reason_code', v_alert.reason_code,
      'notification_count', v_alert.notification_count,
      'message_id', v_alert.telegram_message_id
    )
  );

  return jsonb_build_object(
    'outcome', 'recorded',
    'lead_id', p_lead_id,
    'notification_count', v_alert.notification_count
  );
end;
$$;

revoke all on function public.claim_offerpsp_stuck_intake_alert() from public, anon, authenticated;
revoke all on function public.complete_offerpsp_stuck_intake_alert(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_offerpsp_stuck_intake_alert() to service_role;
grant execute on function public.complete_offerpsp_stuck_intake_alert(uuid, uuid, text) to service_role;

comment on function public.claim_offerpsp_stuck_intake_alert() is
  'Claims one genuinely stuck active intake for the private operator chat. Re-alerts at most once per 24 hours while the same state persists.';
