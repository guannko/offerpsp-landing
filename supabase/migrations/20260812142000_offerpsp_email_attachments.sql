-- Private inbound email attachments: immutable source file, extracted text and
-- an explicit review/queue state. Nothing is published automatically.

create table if not exists public.offerpsp_email_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.offerpsp_email_messages(id) on delete cascade,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'offerpsp-private-sources'
    check (storage_bucket = 'offerpsp-private-sources'),
  storage_path text not null unique,
  extracted_text text,
  extraction_method text,
  extraction_error text,
  provider_id uuid references private.offerpsp_providers(id) on delete set null,
  ingestion_job_id uuid references private.offerpsp_ingestion_jobs(id) on delete set null,
  status text not null default 'stored'
    check (status in ('stored', 'extracted', 'needs_ocr', 'needs_review', 'queued', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, sha256)
);

create index if not exists offerpsp_email_attachments_message_idx
  on public.offerpsp_email_attachments(message_id, created_at);
create index if not exists offerpsp_email_attachments_review_idx
  on public.offerpsp_email_attachments(status, created_at desc)
  where status in ('extracted', 'needs_ocr', 'needs_review');

drop trigger if exists offerpsp_email_attachments_set_updated_at on public.offerpsp_email_attachments;
create trigger offerpsp_email_attachments_set_updated_at
before update on public.offerpsp_email_attachments
for each row execute function public.set_offerpsp_updated_at();

alter table public.offerpsp_email_attachments enable row level security;
revoke all on table public.offerpsp_email_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.offerpsp_email_attachments to service_role;

drop policy if exists offerpsp_staff_read_email_attachments on public.offerpsp_email_attachments;
create policy offerpsp_staff_read_email_attachments
on public.offerpsp_email_attachments for select to authenticated
using (public.is_offerpsp_staff());

create or replace function private.offerpsp_normalize_provider_hint(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9а-яё]+', ' ', 'g'));
$$;

create or replace function private.offerpsp_resolve_email_attachment_provider(
  p_sender_email text,
  p_subject text,
  p_filename text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_email text := private.offerpsp_mail_extract_email(p_sender_email);
  v_haystack text := ' ' || private.offerpsp_normalize_provider_hint(coalesce(p_subject, '') || ' ' || coalesce(p_filename, '')) || ' ';
  v_provider_id uuid;
begin
  select c.provider_id into v_provider_id
  from private.offerpsp_provider_contacts c
  where c.active and lower(c.email) = v_email
  order by c.updated_at desc
  limit 1;
  if v_provider_id is not null then return v_provider_id; end if;

  select p.id into v_provider_id
  from private.offerpsp_providers p
  join public.psp_providers legacy on legacy.id = p.legacy_psp_id
  where lower(legacy.email) = v_email
  order by p.created_at
  limit 1;
  if v_provider_id is not null then return v_provider_id; end if;

  select p.id into v_provider_id
  from private.offerpsp_providers p
  where length(private.offerpsp_normalize_provider_hint(p.brand_name)) >= 3
    and position(' ' || private.offerpsp_normalize_provider_hint(p.brand_name) || ' ' in v_haystack) > 0
  order by length(p.brand_name) desc, p.created_at
  limit 1;

  return v_provider_id;
end;
$$;

create or replace function public.aibot_n8n_record_email_attachment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_message public.offerpsp_email_messages;
  v_attachment public.offerpsp_email_attachments;
  v_provider private.offerpsp_providers;
  v_job jsonb;
  v_status text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP service access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Attachment payload must be an object'; end if;

  select * into v_message
  from public.offerpsp_email_messages
  where id = nullif(p_payload ->> 'message_id', '')::uuid;
  if not found then raise exception 'Email message not found'; end if;

  select * into v_provider
  from private.offerpsp_providers
  where id = private.offerpsp_resolve_email_attachment_provider(
    v_message.sender_email,
    v_message.subject,
    p_payload ->> 'filename'
  );

  v_status := case
    when nullif(trim(p_payload ->> 'extracted_text'), '') is null
      then case when p_payload ->> 'status' = 'needs_ocr' then 'needs_ocr' else 'needs_review' end
    when v_provider.id is null then 'extracted'
    else 'queued'
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
    v_provider.id,
    v_status,
    coalesce(p_payload -> 'metadata', '{}'::jsonb)
  )
  on conflict (message_id, sha256) do update set
    storage_path = excluded.storage_path,
    extraction_error = excluded.extraction_error,
    updated_at = now()
  returning * into v_attachment;

  if v_status = 'queued' and v_attachment.ingestion_job_id is null then
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
        'subject', v_message.subject
      )
    );
    update public.offerpsp_email_attachments
    set ingestion_job_id = nullif(v_job ->> 'job_id', '')::uuid,
        status = 'queued'
    where id = v_attachment.id
    returning * into v_attachment;
  end if;

  return jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment.id,
    'status', v_attachment.status,
    'provider_id', v_attachment.provider_id,
    'ingestion_job_id', v_attachment.ingestion_job_id
  );
end;
$$;

create or replace function public.queue_offerpsp_email_attachment(
  p_attachment_id uuid,
  p_provider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_attachment public.offerpsp_email_attachments;
  v_message public.offerpsp_email_messages;
  v_provider private.offerpsp_providers;
  v_job jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_attachment from public.offerpsp_email_attachments where id = p_attachment_id for update;
  if not found then raise exception 'Email attachment not found'; end if;
  if nullif(trim(v_attachment.extracted_text), '') is null then
    raise exception 'Attachment has no extracted text; OCR or manual extraction is required';
  end if;
  select * into v_provider from private.offerpsp_providers where id = p_provider_id;
  if not found then raise exception 'PSP provider not found'; end if;
  select * into v_message from public.offerpsp_email_messages where id = v_attachment.message_id;

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
      'queued_manually', true
    )
  );

  update public.offerpsp_email_attachments
  set provider_id = v_provider.id,
      ingestion_job_id = nullif(v_job ->> 'job_id', '')::uuid,
      status = 'queued'
  where id = v_attachment.id
  returning * into v_attachment;

  return jsonb_build_object(
    'success', true,
    'attachment_id', v_attachment.id,
    'status', v_attachment.status,
    'provider_id', v_attachment.provider_id,
    'ingestion_job_id', v_attachment.ingestion_job_id
  );
end;
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
      'attachments_to_review', (select count(*) from public.offerpsp_email_attachments where status in ('extracted', 'needs_ocr', 'needs_review'))
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
        'ingestion_job_id', a.ingestion_job_id,
        'status', a.status,
        'created_at', a.created_at
      ) order by a.created_at)
      from public.offerpsp_email_attachments a
      left join private.offerpsp_providers p on p.id = a.provider_id
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
revoke all on function public.queue_offerpsp_email_attachment(uuid, uuid) from public, anon;
revoke all on function public.get_offerpsp_mail_center(integer) from public, anon;
grant execute on function public.aibot_n8n_record_email_attachment(jsonb) to service_role;
grant execute on function public.queue_offerpsp_email_attachment(uuid, uuid) to authenticated;
grant execute on function public.get_offerpsp_mail_center(integer) to authenticated;

comment on table public.offerpsp_email_attachments is
  'Private inbound Mail Center attachments. Files remain in the private source bucket and require review before publication.';
