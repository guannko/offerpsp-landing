-- Make inbound email ingestion idempotent before mutating thread counters.
-- The advisory lock closes the race between concurrent mailbox pollers.
create or replace function public.aibot_n8n_ingest_email(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_sender text := private.offerpsp_mail_extract_email(coalesce(p_payload ->> 'from_email', p_payload ->> 'from'));
  v_subject text := coalesce(nullif(trim(p_payload ->> 'subject'), ''), '(no subject)');
  v_external_message_id text := nullif(trim(p_payload ->> 'message_id'), '');
  v_thread_key text;
  v_thread_id uuid;
  v_message_id uuid;
  v_counterparty jsonb;
  v_received_at timestamptz;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Email payload must be an object';
  end if;
  if v_sender is null or v_sender = '' or position('@' in v_sender) = 0 then
    raise exception 'Sender email is required';
  end if;

  if v_external_message_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_external_message_id, 0));

    select id, thread_id
      into v_message_id, v_thread_id
    from public.offerpsp_email_messages
    where external_message_id = v_external_message_id;

    if v_message_id is not null then
      return jsonb_build_object(
        'success', true,
        'duplicate', true,
        'thread_id', v_thread_id,
        'message_id', v_message_id
      );
    end if;
  end if;

  v_thread_key := md5(v_sender || '|' || private.offerpsp_mail_normalize_subject(v_subject));
  v_counterparty := private.offerpsp_mail_resolve_counterparty(v_sender);
  begin
    v_received_at := nullif(p_payload ->> 'received_at', '')::timestamptz;
  exception when others then
    v_received_at := null;
  end;
  v_received_at := coalesce(v_received_at, now());

  insert into public.offerpsp_email_threads(
    thread_key, subject, participant_email, counterparty_type, counterparty_id,
    lead_id, status, unread_count, last_message_at, metadata
  ) values (
    v_thread_key, v_subject, v_sender, v_counterparty ->> 'type', v_counterparty ->> 'id',
    nullif(v_counterparty ->> 'lead_id', '')::uuid, 'open', 1, v_received_at,
    jsonb_build_object('last_ingest_provider', 'imap_poller')
  )
  on conflict (thread_key) do update set
    subject = excluded.subject,
    counterparty_type = case when offerpsp_email_threads.counterparty_type = 'general'
      then excluded.counterparty_type else offerpsp_email_threads.counterparty_type end,
    counterparty_id = coalesce(offerpsp_email_threads.counterparty_id, excluded.counterparty_id),
    lead_id = coalesce(offerpsp_email_threads.lead_id, excluded.lead_id),
    status = case when offerpsp_email_threads.status = 'archived' then 'archived' else 'open' end,
    unread_count = offerpsp_email_threads.unread_count + 1,
    last_message_at = greatest(offerpsp_email_threads.last_message_at, excluded.last_message_at),
    metadata = offerpsp_email_threads.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_thread_id;

  insert into public.offerpsp_email_messages(
    thread_id, direction, sender_email, recipient_emails, cc_emails, subject,
    text_body, html_body, external_message_id, in_reply_to, message_references,
    provider, delivery_status, is_read, received_at, raw_headers, metadata, created_at
  ) values (
    v_thread_id, 'inbound', v_sender,
    private.offerpsp_jsonb_text_array(p_payload -> 'to'),
    private.offerpsp_jsonb_text_array(p_payload -> 'cc'), v_subject,
    nullif(p_payload ->> 'text', ''), nullif(p_payload ->> 'html', ''),
    v_external_message_id, nullif(trim(p_payload ->> 'in_reply_to'), ''),
    private.offerpsp_jsonb_text_array(p_payload -> 'references'),
    'imap', 'received', false, v_received_at,
    coalesce(p_payload -> 'headers', '{}'::jsonb),
    (p_payload - array['text','html','headers']) || jsonb_build_object('ingest_source', 'vercel_imap_poller'),
    v_received_at
  )
  returning id into v_message_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'counterparty_type', v_counterparty ->> 'type',
    'counterparty_id', v_counterparty ->> 'id'
  );
end;
$$;

revoke all on function public.aibot_n8n_ingest_email(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_ingest_email(jsonb) to service_role;

comment on function public.aibot_n8n_ingest_email(jsonb) is
  'Service-role-only idempotent inbound email ingestion for OfferPSP Mail Center.';
