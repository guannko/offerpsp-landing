-- Staff-only read projection. Source journals remain authoritative; no new history table.
create or replace function private.offerpsp_calendar_fixture(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select lower(coalesce(p_text, '')) ~ '\.invalid|paysiski|winpiski|payok e2e test 20260826|autopilot e2e|autopilot test|screening canary|bix instant intake e2e|workspace-role-e2e|portal regression|offerpsp intake e2e|no action required';
$$;
revoke all on function private.offerpsp_calendar_fixture(text) from public, anon, authenticated, service_role;

create index if not exists offerpsp_calendar_mail_time_idx on public.offerpsp_email_messages
  ((case when direction = 'outbound' then sent_at else received_at end), id)
  where delivery_status in ('sent', 'delivered', 'received');
create index if not exists offerpsp_calendar_task_completed_idx on public.offerpsp_tasks (completed_at, id)
  where status = 'done' and completed_at is not null;
create index if not exists offerpsp_calendar_shortlist_shared_idx on public.offerpsp_shortlists (shared_at, id)
  where shared_at is not null;
create index if not exists offerpsp_calendar_contact_time_idx on private.offerpsp_contact_events (occurred_at, id);

create or replace function public.get_offerpsp_calendar_events(
  p_start timestamptz, p_end timestamptz, p_offset integer default 0, p_limit integer default 200
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_end <= p_start or p_end - p_start > interval '62 days'
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid calendar range or offset' using errcode = '22023';
  end if;
  with qa_leads as materialized (
    select l.lead_id from public.offerpsp_leads l
    where private.offerpsp_is_qa_lead(l)
      or private.offerpsp_calendar_fixture(concat_ws(' ', l.company, l.name, l.work_email, l.company_url))
  ), qa_providers as materialized (
    select p.id, p.legacy_psp_id from private.offerpsp_providers p
    where private.offerpsp_calendar_fixture(concat_ws(' ', p.brand_name, p.legal_name, p.internal_code, p.website))
  ), business_threads as materialized (
    select t.* from public.offerpsp_email_threads t
    where t.status <> 'trashed'
      and coalesce(t.metadata->>'operational_visibility', '') <> 'excluded'
      and private.offerpsp_mail_non_operational_reason(t.subject, t.participant_email) is null
      and not ('system:spam' = any(coalesce(t.tags, '{}'::text[])))
      and not private.offerpsp_calendar_fixture(concat_ws(' ', t.subject, t.participant_email))
      and not exists(select 1 from qa_leads q where q.lead_id = t.lead_id
        or (t.counterparty_type = 'merchant' and q.lead_id::text = t.counterparty_id))
      and not exists(select 1 from qa_providers q where t.counterparty_type in ('provider', 'research_psp', 'psp')
        and t.counterparty_id in (q.id::text, q.legacy_psp_id::text))
  ), business_tasks as materialized (
    select t.*, coalesce(l.company, l.name, l.work_email, 'Общая задача') as person
    from public.offerpsp_tasks t left join public.offerpsp_leads l on l.lead_id = t.lead_id
    where not exists(select 1 from qa_leads q where q.lead_id = t.lead_id
      or (t.entity_type = 'merchant' and q.lead_id = t.entity_id))
      and not exists(select 1 from qa_providers q where t.entity_type in ('provider', 'psp') and q.id = t.entity_id)
      and coalesce(t.metadata->>'qa_fixture_suppressed', '') <> 'true'
      and not private.offerpsp_calendar_fixture(concat_ws(' ', t.title, t.details, t.automation_ref))
  ), events as (
    select 'mail:' || m.id::text as id, 'fact'::text as nature,
      case when m.direction = 'outbound' then 'email_sent' else 'email_received' end as kind,
      case when m.direction = 'outbound' then m.sent_at else m.received_at end as occurred_at,
      coalesce(nullif(t.participant_email, ''), m.sender_email, 'Переписка') as person,
      coalesce(m.subject, t.subject, 'Без темы') as title,
      case when m.direction = 'outbound' then 'Отправка подтверждена; прочтение получателем не подтверждено.'
        else 'Получено входящее письмо.' end as detail,
      '/communications?thread=' || t.id::text as href, null::text as task_id,
      t.lead_id::text as lead_id, null::text as status,
      jsonb_build_object('sender', m.sender_email, 'recipients', m.recipient_emails,
        'reply_confirmed', exists(select 1 from public.offerpsp_email_messages parent
          where parent.thread_id = m.thread_id and parent.direction <> m.direction
            and parent.external_message_id is not null
            and (parent.external_message_id = m.in_reply_to or parent.external_message_id = any(m.message_references))),
        'delivery_status', m.delivery_status) as evidence
    from public.offerpsp_email_messages m join business_threads t on t.id = m.thread_id
    where ((m.direction = 'outbound' and m.delivery_status in ('sent', 'delivered') and m.sent_at is not null)
      or (m.direction = 'inbound' and m.delivery_status = 'received' and m.received_at is not null))
      and (case when m.direction = 'outbound' then m.sent_at else m.received_at end) >= p_start
      and (case when m.direction = 'outbound' then m.sent_at else m.received_at end) < least(p_end, now())
    union all
    select 'task-done:' || t.id::text, 'fact', 'task_done', t.completed_at, t.person, t.title,
      left(coalesce(t.details, ''), 1200), '/operations?task=' || t.id::text, t.id::text,
      t.lead_id::text, t.status, '{}'::jsonb
    from business_tasks t where t.status = 'done' and t.completed_at >= p_start
      and t.completed_at < least(p_end, now())
    union all
    select 'task-plan:' || t.id::text, 'plan', 'task_due', t.due_at, t.person, t.title,
      left(coalesce(t.details, ''), 1200), '/operations?task=' || t.id::text, t.id::text,
      t.lead_id::text, t.status, '{}'::jsonb
    from business_tasks t where t.status in ('pending', 'in_progress') and t.due_at >= p_start and t.due_at < p_end
    union all
    select 'follow-up:' || t.id::text, 'plan', 'follow_up', t.follow_up_at,
      coalesce(t.participant_email, 'Переписка'), coalesce(t.subject, 'Follow-up'),
      'План связаться; отправка ещё не подтверждена.', '/communications?thread=' || t.id::text,
      null::text, t.lead_id::text, t.status, '{}'::jsonb
    from business_threads t where t.status not in ('closed', 'archived')
      and t.follow_up_at >= p_start and t.follow_up_at < p_end
    union all
    select 'shortlist:' || s.id::text, 'fact', 'shortlist_shared', s.shared_at,
      coalesce(l.company, l.name, l.work_email, 'Мерч'), coalesce(s.title, 'Подборка предложений'),
      'Опубликовано в кабинете клиента. Это не подтверждение отправки или доставки письма.',
      '/merchants/' || s.lead_id::text || '?tab=preview', null::text, s.lead_id::text, s.status,
      jsonb_build_object('version', s.version, 'shortlist_id', s.id, 'options', coalesce((
        select jsonb_agg(jsonb_build_object('code', i.public_code, 'title', i.client_snapshot->>'title') order by i.rank, i.id)
        from public.offerpsp_shortlist_items i where i.shortlist_id = s.id
      ), '[]'::jsonb))
    from public.offerpsp_shortlists s join public.offerpsp_leads l on l.lead_id = s.lead_id
    where s.shared_at >= p_start and s.shared_at < least(p_end, now())
      and not exists(select 1 from qa_leads q where q.lead_id = s.lead_id)
    union all
    select 'activity:' || e.id::text, 'fact', 'activity', e.occurred_at,
      coalesce(l.company, l.name, l.work_email, 'Мерч'), e.title, left(coalesce(e.summary, ''), 1200),
      '/merchants/' || l.lead_id::text, null::text, l.lead_id::text, e.result_status,
      jsonb_build_object('event_type', e.event_type)
    from private.offerpsp_contact_events e join public.offerpsp_leads l on l.lead_id::text = e.entity_id
    where e.entity_type = 'merchant' and e.event_type in ('lead_submitted', 'pre_compliance_decision', 'provider_review_decision')
      and e.occurred_at >= p_start and e.occurred_at < least(p_end, now())
      and not exists(select 1 from qa_leads q where q.lead_id = l.lead_id)
  ), page as materialized (
    select * from events order by occurred_at, id offset p_offset limit v_limit + 1
  ) select jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(p) order by p.occurred_at, p.id)
      from (select * from page order by occurred_at, id limit v_limit) p), '[]'::jsonb),
    'has_more', (select count(*) > v_limit from page), 'next_offset', p_offset + v_limit,
    'generated_at', now(), 'range_start', p_start, 'range_end', p_end,
    'coverage', 'Recorded email, shortlist publication, completed tasks, scheduled tasks/follow-ups and selected merchant decisions. External unrecorded actions are not inferred.'
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_offerpsp_calendar_events(timestamptz, timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_offerpsp_calendar_events(timestamptz, timestamptz, integer, integer) to authenticated;
comment on function public.get_offerpsp_calendar_events(timestamptz, timestamptz, integer, integer) is
  'Staff-only bounded factual calendar projection. Plans are not delivery receipts. No source data mutations.';
