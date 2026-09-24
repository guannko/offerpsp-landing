-- Explicit inbound file classification for Mail Center and AIBot intake.
-- A file is never treated as an offer or a contract until staff classifies it.

alter table public.offerpsp_email_attachments
  drop constraint if exists offerpsp_email_attachments_status_check;

alter table public.offerpsp_email_attachments
  add constraint offerpsp_email_attachments_status_check
  check (status in (
    'stored', 'extracted', 'needs_ocr', 'needs_review',
    'queued', 'saved_document', 'failed'
  ));

alter table public.offerpsp_email_attachments
  add column if not exists document_type text
    check (document_type in ('offer', 'contract')),
  add column if not exists document_id uuid
    references private.offerpsp_entity_documents(id) on delete set null,
  add column if not exists target_entity_type text
    check (target_entity_type in ('provider', 'merchant')),
  add column if not exists target_entity_id uuid;

create index if not exists offerpsp_email_attachments_target_idx
  on public.offerpsp_email_attachments(target_entity_type, target_entity_id, created_at desc)
  where target_entity_id is not null;

create index if not exists offerpsp_email_attachments_document_idx
  on public.offerpsp_email_attachments(document_id)
  where document_id is not null;

create or replace function public.aibot_n8n_record_email_attachment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_message public.offerpsp_email_messages;
  v_attachment public.offerpsp_email_attachments;
  v_provider_id uuid;
  v_status text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP service access required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Attachment payload must be an object';
  end if;

  select * into v_message
  from public.offerpsp_email_messages
  where id = nullif(p_payload ->> 'message_id', '')::uuid;
  if not found then raise exception 'Email message not found'; end if;

  v_provider_id := private.offerpsp_resolve_email_attachment_provider(
    v_message.sender_email,
    v_message.subject,
    p_payload ->> 'filename'
  );

  v_status := case
    when nullif(trim(p_payload ->> 'extracted_text'), '') is not null then 'extracted'
    when p_payload ->> 'status' = 'needs_ocr' then 'needs_ocr'
    else 'needs_review'
  end;

  insert into public.offerpsp_email_attachments(
    message_id, filename, content_type, size_bytes, sha256, storage_path,
    extracted_text, extraction_method, extraction_error, provider_id, status, metadata
  ) values (
    v_message.id,
    left(coalesce(nullif(trim(p_payload ->> 'filename'), ''), 'attachment'), 255),
    coalesce(nullif(trim(p_payload ->> 'content_type'), ''), 'application/octet-stream'),
    (p_payload ->> 'size_bytes')::bigint,
    lower(p_payload ->> 'sha256'),
    p_payload ->> 'storage_path',
    nullif(p_payload ->> 'extracted_text', ''),
    nullif(p_payload ->> 'extraction_method', ''),
    nullif(p_payload ->> 'extraction_error', ''),
    v_provider_id,
    v_status,
    coalesce(p_payload -> 'metadata', '{}'::jsonb)
  )
  on conflict (message_id, sha256) do update set
    storage_path = excluded.storage_path,
    extracted_text = case
      when offerpsp_email_attachments.document_type is null
        then coalesce(excluded.extracted_text, offerpsp_email_attachments.extracted_text)
      else offerpsp_email_attachments.extracted_text
    end,
    extraction_method = case
      when offerpsp_email_attachments.document_type is null
        then coalesce(excluded.extraction_method, offerpsp_email_attachments.extraction_method)
      else offerpsp_email_attachments.extraction_method
    end,
    extraction_error = case
      when offerpsp_email_attachments.document_type is null then excluded.extraction_error
      else offerpsp_email_attachments.extraction_error
    end,
    provider_id = coalesce(offerpsp_email_attachments.provider_id, excluded.provider_id),
    status = case
      when offerpsp_email_attachments.document_type is null then excluded.status
      else offerpsp_email_attachments.status
    end,
    metadata = offerpsp_email_attachments.metadata || excluded.metadata,
    updated_at = now()
  returning * into v_attachment;

  return jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment.id,
    'status', v_attachment.status,
    'provider_hint_id', v_attachment.provider_id,
    'classification_required', v_attachment.document_type is null
  );
end;
$$;

create or replace function public.classify_offerpsp_email_attachment(
  p_attachment_id uuid,
  p_document_type text,
  p_provider_id uuid default null,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_attachment public.offerpsp_email_attachments;
  v_message public.offerpsp_email_messages;
  v_thread public.offerpsp_email_threads;
  v_provider private.offerpsp_providers;
  v_job jsonb;
  v_document jsonb;
  v_target_type text;
  v_target_id uuid;
  v_target_name text;
  v_explicit_provider boolean := p_provider_id is not null;
  v_explicit_lead boolean := p_lead_id is not null;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_document_type not in ('offer', 'contract') then
    raise exception 'Choose file type: offer or contract' using errcode = 'P0001';
  end if;

  select * into v_attachment
  from public.offerpsp_email_attachments
  where id = p_attachment_id
  for update;
  if not found then raise exception 'Email attachment not found'; end if;

  if v_attachment.document_type is not null then
    if v_attachment.document_type <> p_document_type then
      raise exception 'Attachment is already saved as %', v_attachment.document_type using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'success', true,
      'already_classified', true,
      'attachment_id', v_attachment.id,
      'document_type', v_attachment.document_type,
      'status', v_attachment.status,
      'ingestion_job_id', v_attachment.ingestion_job_id,
      'document_id', v_attachment.document_id
    );
  end if;

  select * into v_message
  from public.offerpsp_email_messages
  where id = v_attachment.message_id;

  select * into v_thread
  from public.offerpsp_email_threads
  where id = v_message.thread_id;

  -- Replies inherit the company already attached to their email thread.
  -- Manual selection is required only for a new or ambiguous conversation.
  if p_document_type = 'offer' and p_provider_id is null then
    if v_attachment.provider_id is not null then
      p_provider_id := v_attachment.provider_id;
    elsif v_thread.counterparty_type = 'provider'
      and coalesce(v_thread.counterparty_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      p_provider_id := v_thread.counterparty_id::uuid;
    end if;
  end if;

  if p_document_type = 'contract' and not v_explicit_provider and not v_explicit_lead then
    if v_thread.lead_id is not null then
      p_lead_id := v_thread.lead_id;
    elsif v_thread.counterparty_type = 'merchant'
      and coalesce(v_thread.counterparty_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      p_lead_id := v_thread.counterparty_id::uuid;
    elsif v_thread.counterparty_type = 'provider'
      and coalesce(v_thread.counterparty_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      p_provider_id := v_thread.counterparty_id::uuid;
    elsif v_attachment.provider_id is not null then
      p_provider_id := v_attachment.provider_id;
    end if;
  end if;

  if p_document_type = 'offer' then
    if p_provider_id is null then
      raise exception 'Choose the PSP that owns this offer' using errcode = 'P0001';
    end if;
    if nullif(trim(v_attachment.extracted_text), '') is null then
      raise exception 'Offer has no extracted text; OCR or manual extraction is required' using errcode = 'P0001';
    end if;
    select * into v_provider from private.offerpsp_providers where id = p_provider_id;
    if not found then raise exception 'PSP provider not found'; end if;

    v_job := public.enqueue_offerpsp_source(
      v_provider.brand_name,
      'email',
      v_attachment.extracted_text,
      'email-attachment:' || v_attachment.id::text,
      jsonb_build_object(
        'message_id', v_message.id,
        'attachment_id', v_attachment.id,
        'filename', v_attachment.filename,
        'storage_bucket', v_attachment.storage_bucket,
        'storage_path', v_attachment.storage_path,
        'sender_email', v_message.sender_email,
        'subject', v_message.subject,
        'document_type', 'offer',
        'publication_allowed', false,
        'classified_by', auth.uid()
      )
    );

    update public.offerpsp_email_attachments
    set document_type = 'offer',
        provider_id = v_provider.id,
        target_entity_type = 'provider',
        target_entity_id = v_provider.id,
        ingestion_job_id = nullif(v_job ->> 'job_id', '')::uuid,
        status = 'queued'
    where id = v_attachment.id
    returning * into v_attachment;
    v_target_type := 'provider';
    v_target_id := v_provider.id;
    v_target_name := v_provider.brand_name;
  else
    if (p_provider_id is null) = (p_lead_id is null) then
      raise exception 'Choose exactly one company for this contract' using errcode = 'P0001';
    end if;
    if p_provider_id is not null then
      select brand_name into v_target_name
      from private.offerpsp_providers where id = p_provider_id;
      if not found then raise exception 'PSP provider not found'; end if;
      v_target_type := 'provider';
      v_target_id := p_provider_id;
    else
      select coalesce(company, name, work_email, 'Merchant') into v_target_name
      from public.offerpsp_leads where lead_id = p_lead_id;
      if not found then raise exception 'OfferPSP merchant not found'; end if;
      v_target_type := 'merchant';
      v_target_id := p_lead_id;
    end if;

    v_document := public.save_offerpsp_entity_document(
      v_target_type,
      v_target_id,
      null,
      jsonb_build_object(
        'category', 'contract',
        'title', v_attachment.filename,
        'file_name', v_attachment.filename,
        'storage_path', v_attachment.storage_path,
        'mime_type', v_attachment.content_type,
        'size_bytes', v_attachment.size_bytes,
        'status', 'active',
        'notes', 'Saved from inbound email: ' || coalesce(v_message.subject, 'no subject')
      )
    );

    update public.offerpsp_email_attachments
    set document_type = 'contract',
        target_entity_type = v_target_type,
        target_entity_id = v_target_id,
        provider_id = case when v_target_type = 'provider' then v_target_id else provider_id end,
        document_id = (v_document ->> 'id')::uuid,
        status = 'saved_document'
    where id = v_attachment.id
    returning * into v_attachment;
  end if;

  insert into private.aibot_execution_journal(
    action_type, description, status, entity_type, entity_id,
    completed_at, result_summary, source_channel, idempotency_key, metadata
  ) values (
    case p_document_type when 'offer' then 'offer_source_received' else 'contract_saved' end,
    case p_document_type
      when 'offer' then 'Inbound offer received from ' || v_target_name
      else 'Inbound contract saved to ' || v_target_name
    end,
    'completed', v_target_type, v_target_id::text, now(),
    case p_document_type
      when 'offer' then 'Queued for parsing and mandatory manual review; publication is disabled.'
      else 'Original file saved in the company document card.'
    end,
    'email', 'email-attachment-classified:' || v_attachment.id::text,
    jsonb_build_object(
      'attachment_id', v_attachment.id,
      'filename', v_attachment.filename,
      'document_type', p_document_type,
      'message_id', v_message.id,
      'ingestion_job_id', v_attachment.ingestion_job_id,
      'document_id', v_attachment.document_id
    )
  ) on conflict (profile_key, idempotency_key) where idempotency_key is not null
  do nothing;

  return jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment.id,
    'document_type', v_attachment.document_type,
    'status', v_attachment.status,
    'target_entity_type', v_target_type,
    'target_entity_id', v_target_id,
    'target_entity_name', v_target_name,
    'inherited_from_thread', (
      (v_target_type = 'merchant' and v_thread.lead_id = v_target_id)
      or (v_target_type = 'provider' and v_thread.counterparty_type = 'provider'
        and v_thread.counterparty_id = v_target_id::text)
    ),
    'ingestion_job_id', v_attachment.ingestion_job_id,
    'document_id', v_attachment.document_id
  );
end;
$$;

create or replace function public.queue_offerpsp_email_attachment(
  p_attachment_id uuid,
  p_provider_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select public.classify_offerpsp_email_attachment(
    p_attachment_id, 'offer', p_provider_id, null
  );
$$;

create or replace function public.get_offerpsp_mail_center(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'threads', (select count(*) from public.offerpsp_email_threads where status <> 'archived'),
      'unread', (select coalesce(sum(unread_count), 0) from public.offerpsp_email_threads where status <> 'archived'),
      'awaiting_reply', (select count(*) from public.offerpsp_email_threads where status = 'awaiting_reply'),
      'follow_up', (select count(*) from public.offerpsp_email_threads where status = 'follow_up'),
      'attachments_to_review', (select count(*) from public.offerpsp_email_attachments where document_type is null)
    ),
    'threads', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.last_message_at desc)
      from (
        select id, subject, participant_email, counterparty_type, counterparty_id,
          lead_id, status, unread_count, assigned_to, last_message_at, tags,
          metadata, created_at, updated_at
        from public.offerpsp_email_threads
        order by last_message_at desc
        limit greatest(1, least(coalesce(p_limit, 200), 500))
      ) t
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at asc)
      from (
        select id, thread_id, direction, sender_email, recipient_emails, cc_emails,
          subject, text_body, html_body, external_message_id, in_reply_to,
          message_references, provider, delivery_status, is_read, source_draft_id,
          sent_at, received_at, created_at
        from public.offerpsp_email_messages
        where thread_id in (
          select id from public.offerpsp_email_threads
          order by last_message_at desc
          limit greatest(1, least(coalesce(p_limit, 200), 500))
        )
        order by created_at asc
      ) m
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'message_id', a.message_id,
        'filename', a.filename,
        'content_type', a.content_type,
        'size_bytes', a.size_bytes,
        'storage_bucket', a.storage_bucket,
        'storage_path', a.storage_path,
        'extraction_method', a.extraction_method,
        'extraction_error', a.extraction_error,
        'has_extracted_text', nullif(trim(a.extracted_text), '') is not null,
        'provider_id', a.provider_id,
        'provider_name', p.brand_name,
        'document_type', a.document_type,
        'document_id', a.document_id,
        'target_entity_type', a.target_entity_type,
        'target_entity_id', a.target_entity_id,
        'target_entity_name', case
          when a.target_entity_type = 'provider' then target_provider.brand_name
          when a.target_entity_type = 'merchant' then coalesce(target_lead.company, target_lead.name, target_lead.work_email)
        end,
        'ingestion_job_id', a.ingestion_job_id,
        'status', a.status,
        'created_at', a.created_at
      ) order by a.created_at)
      from public.offerpsp_email_attachments a
      left join private.offerpsp_providers p on p.id = a.provider_id
      left join private.offerpsp_providers target_provider
        on a.target_entity_type = 'provider' and target_provider.id = a.target_entity_id
      left join public.offerpsp_leads target_lead
        on a.target_entity_type = 'merchant' and target_lead.lead_id = a.target_entity_id
      where a.message_id in (
        select m.id
        from public.offerpsp_email_messages m
        where m.thread_id in (
          select id from public.offerpsp_email_threads
          order by last_message_at desc
          limit greatest(1, least(coalesce(p_limit, 200), 500))
        )
      )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.aibot_n8n_record_email_attachment(jsonb) from public, anon, authenticated;
revoke all on function public.classify_offerpsp_email_attachment(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.queue_offerpsp_email_attachment(uuid, uuid) from public, anon;
revoke all on function public.get_offerpsp_mail_center(integer) from public, anon;
grant execute on function public.aibot_n8n_record_email_attachment(jsonb) to service_role;
grant execute on function public.classify_offerpsp_email_attachment(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.queue_offerpsp_email_attachment(uuid, uuid) to authenticated;
grant execute on function public.get_offerpsp_mail_center(integer) to authenticated;

comment on function public.classify_offerpsp_email_attachment(uuid, text, uuid, uuid) is
  'Staff-only explicit classification: offer enters draft parser queue; contract is saved to one company document card.';
