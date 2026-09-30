create or replace function public.begin_offerpsp_email_delivery(
  p_draft_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.email_drafts;
  v_message public.offerpsp_email_messages;
  v_attempt_id uuid;
  v_attempt_state text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_draft
  from public.email_drafts
  where id = p_draft_id
  for update;

  if not found then raise exception 'Email draft not found'; end if;

  select * into v_message
  from public.offerpsp_email_messages
  where source_draft_id = p_draft_id
  for update;

  if not found then raise exception 'Outbound email journal row not found'; end if;

  if v_draft.status = 'sent' or v_message.delivery_status = 'sent' then
    return jsonb_build_object(
      'success', true,
      'send_allowed', false,
      'state', 'sent',
      'already_sent', true,
      'draft_id', v_draft.id,
      'external_message_id', v_message.external_message_id
    );
  end if;

  if coalesce(v_draft.status, 'draft') <> 'sending'
      or coalesce(v_message.delivery_status, 'draft') <> 'sending' then
    raise exception 'Email draft is not ready for delivery';
  end if;

  v_attempt_state := nullif(v_message.metadata ->> 'delivery_attempt_state', '');
  if v_attempt_state in ('claimed', 'accepted', 'uncertain') then
    return jsonb_build_object(
      'success', true,
      'send_allowed', false,
      'state', v_attempt_state,
      'already_sent', false,
      'draft_id', v_draft.id,
      'attempt_id', v_message.metadata ->> 'delivery_attempt_id'
    );
  end if;

  v_attempt_id := gen_random_uuid();
  update public.offerpsp_email_messages
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'delivery_attempt_id', v_attempt_id,
    'delivery_attempt_state', 'claimed',
    'delivery_attempt_started_at', now()
  )
  where id = v_message.id;

  return jsonb_build_object(
    'success', true,
    'send_allowed', true,
    'state', 'claimed',
    'already_sent', false,
    'draft_id', v_draft.id,
    'attempt_id', v_attempt_id,
    'to_email', v_draft.to_email,
    'subject', v_draft.subject,
    'body', v_draft.body,
    'lead_internal_id', v_draft.lead_internal_id
  );
end;
$$;

create or replace function public.complete_offerpsp_email_delivery(
  p_draft_id bigint,
  p_attempt_id uuid,
  p_external_message_id text default null,
  p_provider text default 'smtp',
  p_archive_status text default 'skipped',
  p_archive_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_draft public.email_drafts;
  v_message public.offerpsp_email_messages;
  v_external_message_id text := nullif(trim(p_external_message_id), '');
  v_provider text := lower(coalesce(nullif(trim(p_provider), ''), 'smtp'));
  v_archive_status text := lower(coalesce(nullif(trim(p_archive_status), ''), 'skipped'));
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if v_provider not in ('smtp', 'brevo') then
    raise exception 'Unsupported email provider';
  end if;
  if v_archive_status not in ('archived', 'duplicate', 'failed', 'skipped') then
    raise exception 'Unsupported Sent archive status';
  end if;
  if v_external_message_id is not null
      and (char_length(v_external_message_id) > 320
        or v_external_message_id !~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$') then
    raise exception 'Invalid external Message-ID';
  end if;

  select * into v_draft
  from public.email_drafts
  where id = p_draft_id
  for update;

  if not found then raise exception 'Email draft not found'; end if;
  if coalesce(v_draft.status, 'draft') not in ('sending', 'sent') then
    raise exception 'Email draft is not in a deliverable state';
  end if;

  select * into v_message
  from public.offerpsp_email_messages
  where source_draft_id = p_draft_id
  for update;

  if not found then raise exception 'Outbound email journal row not found'; end if;
  if nullif(v_message.metadata ->> 'delivery_attempt_id', '') is distinct from p_attempt_id::text then
    raise exception 'Email delivery attempt does not match';
  end if;

  update public.email_drafts
  set status = 'sent'
  where id = p_draft_id
  returning * into v_draft;

  update public.offerpsp_email_messages
  set
    external_message_id = coalesce(v_external_message_id, external_message_id),
    provider = v_provider,
    delivery_status = 'sent',
    sent_at = coalesce(sent_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'sent_archive_status', v_archive_status,
      'sent_archive_error', left(nullif(trim(p_archive_error), ''), 2000),
      'delivery_attempt_state', 'accepted',
      'delivery_receipt_recorded_at', now()
    ))
  where id = v_message.id
  returning * into v_message;

  return jsonb_build_object(
    'success', true,
    'draft_id', v_draft.id,
    'message_id', v_message.id,
    'thread_id', v_message.thread_id,
    'external_message_id', v_message.external_message_id,
    'provider', v_message.provider,
    'delivery_status', v_message.delivery_status,
    'sent_archive_status', v_archive_status
  );
end;
$$;

create or replace function public.mark_offerpsp_email_delivery_uncertain(
  p_draft_id bigint,
  p_attempt_id uuid,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_message public.offerpsp_email_messages;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_message
  from public.offerpsp_email_messages
  where source_draft_id = p_draft_id
  for update;

  if not found then raise exception 'Outbound email journal row not found'; end if;
  if v_message.delivery_status = 'sent' then
    return jsonb_build_object('success', true, 'state', 'sent', 'draft_id', p_draft_id);
  end if;
  if nullif(v_message.metadata ->> 'delivery_attempt_id', '') is distinct from p_attempt_id::text then
    raise exception 'Email delivery attempt does not match';
  end if;

  update public.offerpsp_email_messages
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'delivery_attempt_state', 'uncertain',
    'delivery_attempt_error', left(nullif(trim(p_error), ''), 2000),
    'delivery_attempt_updated_at', now()
  ))
  where id = v_message.id;

  return jsonb_build_object('success', true, 'state', 'uncertain', 'draft_id', p_draft_id);
end;
$$;

revoke all on function public.begin_offerpsp_email_delivery(bigint)
  from public, anon;
grant execute on function public.begin_offerpsp_email_delivery(bigint)
  to authenticated;

revoke all on function public.complete_offerpsp_email_delivery(bigint, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.complete_offerpsp_email_delivery(bigint, uuid, text, text, text, text)
  to authenticated;

revoke all on function public.mark_offerpsp_email_delivery_uncertain(bigint, uuid, text)
  from public, anon;
grant execute on function public.mark_offerpsp_email_delivery_uncertain(bigint, uuid, text)
  to authenticated;

comment on function public.begin_offerpsp_email_delivery(bigint) is
  'Claims one OfferPSP email draft exactly once and returns its canonical stored payload for delivery.';

comment on function public.complete_offerpsp_email_delivery(bigint, uuid, text, text, text, text) is
  'Finalizes one already-sent OfferPSP draft without permitting resend, preserving provider Message-ID and IMAP Sent archive outcome.';

comment on function public.mark_offerpsp_email_delivery_uncertain(bigint, uuid, text) is
  'Keeps an ambiguous OfferPSP delivery attempt locked against automatic resend until operator reconciliation.';
