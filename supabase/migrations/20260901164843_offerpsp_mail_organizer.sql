-- Turn the existing threaded mailbox into a staff organizer without creating a
-- second source of truth. Threads keep owning status and message history; the
-- organizer adds prioritisation, follow-up planning, notes, summaries and
-- reusable staff-only templates.

alter table public.offerpsp_email_threads
  add column if not exists priority text not null default 'normal',
  add column if not exists is_flagged boolean not null default false,
  add column if not exists follow_up_at timestamptz,
  add column if not exists organizer_notes text,
  add column if not exists ai_summary text,
  add column if not exists ai_summary_generated_at timestamptz,
  add column if not exists last_organized_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'offerpsp_email_threads_priority_check'
      and conrelid = 'public.offerpsp_email_threads'::regclass
  ) then
    alter table public.offerpsp_email_threads
      add constraint offerpsp_email_threads_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end $$;

create index if not exists offerpsp_email_threads_follow_up_idx
  on public.offerpsp_email_threads (follow_up_at, priority, last_message_at desc)
  where follow_up_at is not null and status not in ('closed', 'archived');

create index if not exists offerpsp_email_threads_flagged_idx
  on public.offerpsp_email_threads (priority desc, last_message_at desc)
  where is_flagged and status not in ('closed', 'archived');

create table if not exists public.offerpsp_email_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique check (template_code ~ '^[a-z0-9_]{3,80}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  category text not null check (category in ('partnership', 'follow_up', 'offer_matrix', 'merchant', 'general')),
  language text not null default 'en' check (language in ('en', 'ru')),
  subject_template text not null check (char_length(subject_template) between 1 and 240),
  body_template text not null check (char_length(body_template) between 1 and 20000),
  active boolean not null default true,
  sort_order smallint not null default 100,
  created_by uuid references public.offerpsp_staff_members(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offerpsp_email_templates_active_idx
  on public.offerpsp_email_templates (language, category, sort_order, name)
  where active;

drop trigger if exists offerpsp_email_templates_set_updated_at on public.offerpsp_email_templates;
create trigger offerpsp_email_templates_set_updated_at
before update on public.offerpsp_email_templates
for each row execute function public.set_offerpsp_updated_at();

alter table public.offerpsp_email_templates enable row level security;
revoke all on table public.offerpsp_email_templates from public, anon, authenticated;
grant select, insert, update, delete on table public.offerpsp_email_templates to service_role;

insert into public.offerpsp_email_templates(
  template_code, name, category, language, subject_template, body_template, sort_order
) values
  (
    'partner_intro_en',
    'Первое письмо PSP',
    'partnership',
    'en',
    'OfferPSP partnership enquiry — {{company}}',
    $template$Hello {{contact_name}},

I am writing on behalf of OfferPSP, a private payment-provider matching and introduction service for international merchants.

We are expanding our provider network and would like to understand your referral or partner programme, merchant qualification criteria and lead-registration process. We are specifically interested in receiving your current offer matrix and agreeing the commercial model, including the referral fee or revenue share payable to OfferPSP for introduced merchants.

If this is relevant, please share the appropriate partner contact and the information you require from us.

Best regards,
Boris
OfferPSP
bizdev@offerpsp.com
https://offerpsp.com/$template$,
    10
  ),
  (
    'offer_matrix_en',
    'Запрос offer matrix и комиссии',
    'offer_matrix',
    'en',
    'Offer matrix and referral terms — {{company}}',
    $template$Hello {{contact_name}},

To qualify suitable merchant introductions, could you please share your current offer matrix or partner-facing product overview, including supported GEOs, verticals, methods, currencies, volume requirements, restrictions and onboarding criteria?

Please also confirm the referral or revenue-share model available to OfferPSP, the lead-registration and protection process, and how commercial attribution is tracked after a successful introduction.

Final merchant availability and terms will remain subject to your review and approval.

Best regards,
Boris
OfferPSP
bizdev@offerpsp.com$template$,
    20
  ),
  (
    'partner_follow_up_en',
    'Follow-up партнёру',
    'follow_up',
    'en',
    'Re: {{subject}}',
    $template$Hello {{contact_name}},

I wanted to follow up on the partnership enquiry below. We would be glad to align on your merchant criteria, lead-registration process, current offer matrix and the commercial model for qualified introductions from OfferPSP.

Please let me know who would be the best person to continue this discussion with.

Best regards,
Boris
OfferPSP$template$,
    30
  ),
  (
    'merchant_clarification_en',
    'Уточнение данных мерчанта',
    'merchant',
    'en',
    'Additional information required for your payment request',
    $template$Hello {{contact_name}},

Thank you for contacting OfferPSP. To prepare a qualified payment-provider brief, please confirm the following information:

• legal entity and registration country;
• operating and target GEOs;
• licence status and jurisdiction, where applicable;
• expected monthly processing volume and currencies;
• required PayIn / PayOut methods;
• current processing setup, traffic type and launch timeline.

We use this information only to assess relevant routes and coordinate provider review. Provider identity is disclosed only after provider acceptance and a controlled introduction.

Best regards,
OfferPSP$template$,
    40
  )
on conflict (template_code) do nothing;

create or replace function public.update_offerpsp_email_thread_organizer(
  p_thread_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_thread public.offerpsp_email_threads;
  v_priority text;
  v_notes text;
  v_summary text;
  v_tags text[];
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Organizer patch must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) as key
    where key not in ('priority', 'is_flagged', 'follow_up_at', 'organizer_notes', 'ai_summary', 'tags')
  ) then
    raise exception 'Organizer patch contains unsupported fields';
  end if;

  if p_patch ? 'priority' then
    v_priority := nullif(trim(p_patch ->> 'priority'), '');
    if v_priority not in ('low', 'normal', 'high', 'urgent') then
      raise exception 'Unsupported email priority';
    end if;
  end if;

  if p_patch ? 'is_flagged' and jsonb_typeof(p_patch -> 'is_flagged') <> 'boolean' then
    raise exception 'Flag value must be boolean';
  end if;

  if p_patch ? 'organizer_notes' then
    v_notes := nullif(trim(p_patch ->> 'organizer_notes'), '');
    if char_length(coalesce(v_notes, '')) > 5000 then raise exception 'Organizer notes are too large'; end if;
  end if;

  if p_patch ? 'ai_summary' then
    v_summary := nullif(trim(p_patch ->> 'ai_summary'), '');
    if char_length(coalesce(v_summary, '')) > 6000 then raise exception 'AI summary is too large'; end if;
  end if;

  if p_patch ? 'tags' then
    if jsonb_typeof(p_patch -> 'tags') <> 'array' then raise exception 'Tags must be an array'; end if;
    if jsonb_array_length(p_patch -> 'tags') > 12 then raise exception 'A thread can have at most 12 tags'; end if;
    select coalesce(array_agg(left(trim(value), 40) order by ordinal), '{}'::text[])
      into v_tags
    from jsonb_array_elements_text(p_patch -> 'tags') with ordinality as items(value, ordinal)
    where nullif(trim(value), '') is not null;
  end if;

  update public.offerpsp_email_threads
  set priority = case when p_patch ? 'priority' then v_priority else priority end,
      is_flagged = case when p_patch ? 'is_flagged' then (p_patch ->> 'is_flagged')::boolean else is_flagged end,
      follow_up_at = case
        when p_patch ? 'follow_up_at' then nullif(trim(p_patch ->> 'follow_up_at'), '')::timestamptz
        else follow_up_at
      end,
      organizer_notes = case when p_patch ? 'organizer_notes' then v_notes else organizer_notes end,
      ai_summary = case when p_patch ? 'ai_summary' then v_summary else ai_summary end,
      ai_summary_generated_at = case
        when p_patch ? 'ai_summary' then case when v_summary is null then null else now() end
        else ai_summary_generated_at
      end,
      tags = case when p_patch ? 'tags' then v_tags else tags end,
      last_organized_at = now(),
      updated_at = now()
  where id = p_thread_id
  returning * into v_thread;

  if not found then raise exception 'Email thread not found'; end if;
  return to_jsonb(v_thread);
end;
$$;

revoke all on function public.update_offerpsp_email_thread_organizer(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_offerpsp_email_thread_organizer(uuid, jsonb)
  to authenticated;

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
      'overdue_follow_up', (select count(*) from public.offerpsp_email_threads where follow_up_at <= now() and status not in ('closed', 'archived')),
      'flagged', (select count(*) from public.offerpsp_email_threads where is_flagged and status not in ('closed', 'archived')),
      'attachments_to_review', (select count(*) from public.offerpsp_email_attachments where document_type is null)
    ),
    'threads', coalesce((
      select jsonb_agg(to_jsonb(t) order by
        case t.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end desc,
        t.last_message_at desc)
      from (
        select id, subject, participant_email, counterparty_type, counterparty_id,
          lead_id, status, unread_count, assigned_to, last_message_at, tags,
          priority, is_flagged, follow_up_at, organizer_notes, ai_summary,
          ai_summary_generated_at, last_organized_at,
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
        select m.id from public.offerpsp_email_messages m
        where m.thread_id in (
          select id from public.offerpsp_email_threads
          order by last_message_at desc
          limit greatest(1, least(coalesce(p_limit, 200), 500))
        )
      )
    ), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'template_code', template_code,
        'name', name,
        'category', category,
        'language', language,
        'subject_template', subject_template,
        'body_template', body_template
      ) order by sort_order, name)
      from public.offerpsp_email_templates
      where active
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_offerpsp_mail_center(integer)
  from public, anon, authenticated;
grant execute on function public.get_offerpsp_mail_center(integer)
  to authenticated;

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
    lead_id, status, unread_count, last_message_at, follow_up_at
  ) values (
    v_thread_key, v_subject, v_email, v_counterparty ->> 'type',
    v_counterparty ->> 'id', v_lead_id,
    case when new.status = 'sent' then 'awaiting_reply' else 'open' end,
    0, coalesce(new.created_at, now()),
    case when new.status = 'sent' then now() + interval '3 days' else null end
  )
  on conflict (thread_key) do update set
    subject = excluded.subject,
    counterparty_type = case when offerpsp_email_threads.counterparty_type = 'general'
      then excluded.counterparty_type else offerpsp_email_threads.counterparty_type end,
    counterparty_id = coalesce(offerpsp_email_threads.counterparty_id, excluded.counterparty_id),
    lead_id = coalesce(offerpsp_email_threads.lead_id, excluded.lead_id),
    status = case when new.status = 'sent' and offerpsp_email_threads.status not in ('closed', 'archived')
      then 'awaiting_reply' else offerpsp_email_threads.status end,
    follow_up_at = case
      when new.status = 'sent' and offerpsp_email_threads.status not in ('closed', 'archived')
        then now() + interval '3 days'
      else offerpsp_email_threads.follow_up_at
    end,
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
    select id, thread_id into v_message_id, v_thread_id
    from public.offerpsp_email_messages
    where external_message_id = v_external_message_id;
    if v_message_id is not null then
      return jsonb_build_object('success', true, 'duplicate', true, 'thread_id', v_thread_id, 'message_id', v_message_id);
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
    follow_up_at = case when offerpsp_email_threads.status = 'archived' then offerpsp_email_threads.follow_up_at else null end,
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

revoke all on function public.aibot_n8n_ingest_email(jsonb)
  from public, anon, authenticated;
grant execute on function public.aibot_n8n_ingest_email(jsonb)
  to service_role;

update public.offerpsp_email_threads
set follow_up_at = last_message_at + interval '3 days'
where status = 'awaiting_reply'
  and follow_up_at is null;

comment on table public.offerpsp_email_templates is
  'Staff-only reusable email templates exposed through the protected OfferPSP Mail Center snapshot.';
comment on function public.update_offerpsp_email_thread_organizer(uuid, jsonb) is
  'Staff-only organizer patch for priority, flag, follow-up, notes, tags and AI summary.';
