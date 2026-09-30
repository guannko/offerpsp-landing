create or replace function public.update_offerpsp_email_draft(
  p_draft_id bigint,
  p_to_email text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.email_drafts;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_draft
  from public.email_drafts
  where id = p_draft_id
  for update;

  if not found then raise exception 'Email draft not found'; end if;
  if coalesce(v_draft.status, 'draft') not in ('draft', 'failed') then
    raise exception 'Only draft or failed email can be edited';
  end if;
  if nullif(lower(trim(p_to_email)), '') is null
      or lower(trim(p_to_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid recipient email is required';
  end if;
  if nullif(trim(p_subject), '') is null then raise exception 'Email subject is required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Email body is required'; end if;
  if char_length(trim(p_subject)) > 240 then raise exception 'Email subject is too large'; end if;
  if char_length(p_body) > 50000 then raise exception 'Email body is too large'; end if;

  update public.email_drafts
  set
    to_email = lower(trim(p_to_email)),
    subject = trim(p_subject),
    body = p_body,
    status = 'draft'
  where id = p_draft_id
  returning * into v_draft;

  return to_jsonb(v_draft);
end;
$$;
revoke all on function public.update_offerpsp_email_draft(bigint, text, text, text)
  from public, anon;
grant execute on function public.update_offerpsp_email_draft(bigint, text, text, text)
  to authenticated;

comment on function public.update_offerpsp_email_draft(bigint, text, text, text) is
  'Staff-only edit of one unsent OfferPSP email draft before the existing delivery path is invoked.';

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
    lead_id, status, unread_count, last_message_at
  ) values (
    v_thread_key, v_subject, v_email, v_counterparty ->> 'type',
    v_counterparty ->> 'id', v_lead_id,
    case when new.status = 'sent' then 'awaiting_reply' else 'open' end,
    0, coalesce(new.created_at, now())
  )
  on conflict (thread_key) do update set
    subject = excluded.subject,
    counterparty_type = case when offerpsp_email_threads.counterparty_type = 'general'
      then excluded.counterparty_type else offerpsp_email_threads.counterparty_type end,
    counterparty_id = coalesce(offerpsp_email_threads.counterparty_id, excluded.counterparty_id),
    lead_id = coalesce(offerpsp_email_threads.lead_id, excluded.lead_id),
    status = case when new.status = 'sent' and offerpsp_email_threads.status not in ('closed', 'archived')
      then 'awaiting_reply' else offerpsp_email_threads.status end,
    last_message_at = greatest(offerpsp_email_threads.last_message_at, excluded.last_message_at),
    updated_at = now()
  returning id into v_thread_id;

  insert into public.offerpsp_email_messages(
    thread_id, direction, sender_email, recipient_emails, subject, text_body,
    provider, delivery_status, is_read, source_draft_id, sent_at, created_at
  ) values (
    v_thread_id, 'outbound', 'bizdev@offerpsp.com', array[v_email], v_subject, new.body,
    case when new.status = 'sent' then 'brevo' else 'control_bridge' end,
    coalesce(new.status, 'draft'), true, new.id,
    case when new.status = 'sent' then now() else null end,
    coalesce(new.created_at, now())
  )
  on conflict (source_draft_id) do update set
    thread_id = excluded.thread_id,
    sender_email = excluded.sender_email,
    recipient_emails = excluded.recipient_emails,
    delivery_status = excluded.delivery_status,
    provider = excluded.provider,
    sent_at = coalesce(offerpsp_email_messages.sent_at, excluded.sent_at),
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
