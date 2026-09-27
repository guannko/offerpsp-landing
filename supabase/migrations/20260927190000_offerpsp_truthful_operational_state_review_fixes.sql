-- Follow-up for the already-applied truthful operational state migration.
-- Preserve migration history while tightening mail-state transitions and QA isolation.

create or replace function private.offerpsp_sync_email_draft()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_email text := private.offerpsp_mail_extract_email(new.to_email);
  v_subject text := coalesce(nullif(trim(new.subject), ''), '(no subject)');
  v_thread_key text := md5(v_email || '|' || private.offerpsp_mail_normalize_subject(v_subject));
  v_thread_id uuid;
  v_previous_thread_id uuid;
  v_counterparty jsonb;
  v_lead_id uuid;
  v_waiting boolean := new.status = 'sent' and coalesce(new.response_expected, false);
begin
  if v_email is null or v_email = '' then return new; end if;

  select thread_id into v_previous_thread_id
  from public.offerpsp_email_messages
  where source_draft_id = new.id;

  v_counterparty := private.offerpsp_mail_resolve_counterparty(v_email);
  begin
    v_lead_id := nullif(trim(new.lead_internal_id), '')::uuid;
  exception when invalid_text_representation then
    v_lead_id := null;
  end;
  v_lead_id := coalesce(v_lead_id, nullif(v_counterparty ->> 'lead_id', '')::uuid);

  insert into public.offerpsp_email_threads(
    thread_key, subject, participant_email, counterparty_type, counterparty_id,
    lead_id, status, unread_count, last_message_at, follow_up_at
  ) values (
    v_thread_key, v_subject, v_email, v_counterparty ->> 'type',
    v_counterparty ->> 'id', v_lead_id,
    case when v_waiting then 'awaiting_reply' else 'open' end,
    0, coalesce(new.created_at, now()),
    case when v_waiting then now() + interval '3 days' else null end
  )
  on conflict (thread_key) do update set
    subject = excluded.subject,
    counterparty_type = case when offerpsp_email_threads.counterparty_type = 'general'
      then excluded.counterparty_type else offerpsp_email_threads.counterparty_type end,
    counterparty_id = coalesce(offerpsp_email_threads.counterparty_id, excluded.counterparty_id),
    lead_id = coalesce(offerpsp_email_threads.lead_id, excluded.lead_id),
    status = case
      when v_waiting and offerpsp_email_threads.status not in ('closed', 'archived', 'trashed')
        then 'awaiting_reply'
      when new.status = 'sent' and not v_waiting
        and offerpsp_email_threads.status = 'awaiting_reply'
        then 'open'
      else offerpsp_email_threads.status
    end,
    follow_up_at = case
      when v_waiting and offerpsp_email_threads.status not in ('closed', 'archived', 'trashed')
        then now() + interval '3 days'
      when new.status = 'sent' and not v_waiting
        and offerpsp_email_threads.status = 'awaiting_reply'
        then null
      else offerpsp_email_threads.follow_up_at
    end,
    last_message_at = greatest(offerpsp_email_threads.last_message_at, excluded.last_message_at),
    updated_at = now()
  returning id into v_thread_id;

  insert into public.offerpsp_email_messages(
    thread_id, direction, sender_email, recipient_emails, subject, text_body,
    provider, delivery_status, is_read, source_draft_id, sent_at, metadata, created_at
  ) values (
    v_thread_id, 'outbound', 'bizdev@offerpsp.com', array[v_email], v_subject, new.body,
    case when new.status = 'sent' then 'brevo' else 'control_bridge' end,
    coalesce(new.status, 'draft'), true, new.id,
    case when new.status = 'sent' then now() else null end,
    jsonb_build_object('response_expected', coalesce(new.response_expected, false)),
    coalesce(new.created_at, now())
  )
  on conflict (source_draft_id) do update set
    thread_id = excluded.thread_id,
    sender_email = excluded.sender_email,
    recipient_emails = excluded.recipient_emails,
    delivery_status = excluded.delivery_status,
    provider = excluded.provider,
    sent_at = coalesce(offerpsp_email_messages.sent_at, excluded.sent_at),
    metadata = coalesce(offerpsp_email_messages.metadata, '{}'::jsonb) || excluded.metadata,
    text_body = excluded.text_body,
    subject = excluded.subject;

  if v_previous_thread_id is not null and v_previous_thread_id <> v_thread_id
      and not exists (
        select 1 from public.offerpsp_email_messages where thread_id = v_previous_thread_id
      ) then
    delete from public.offerpsp_email_threads
    where id = v_previous_thread_id
      and status = 'open'
      and unread_count = 0;
  end if;

  return new;
end;
$$;

create or replace function private.offerpsp_is_qa_lead(p_lead public.offerpsp_leads)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select (p_lead).lead_id in (
      'ad724d57-e894-4d16-b7b0-948165aef4bf'::uuid,
      '60e61542-7070-43ef-937b-7f919e9abdb0'::uuid
    )
    or lower(concat_ws(' ',
      (p_lead).company,
      (p_lead).name,
      (p_lead).work_email,
      (p_lead).company_url,
      (p_lead).source_category,
      (p_lead).source_platform,
      (p_lead).source_referrer,
      (p_lead).utm_source,
      (p_lead).utm_campaign,
      (p_lead).details
    )) like '%.invalid%'
    or lower(concat_ws(' ',
      (p_lead).company,
      (p_lead).name,
      (p_lead).work_email,
      (p_lead).company_url,
      (p_lead).source_category,
      (p_lead).source_platform,
      (p_lead).source_referrer,
      (p_lead).utm_source,
      (p_lead).utm_campaign,
      (p_lead).details
    )) similar to '%(paysiski|winpiski|payok e2e test 20260826|autopilot e2e|autopilot test|screening canary|bix instant intake e2e|workspace-role-e2e|portal regression)%';
$$;

revoke all on function private.offerpsp_is_qa_lead(public.offerpsp_leads)
  from public, anon, authenticated;
grant execute on function private.offerpsp_is_qa_lead(public.offerpsp_leads)
  to service_role;
