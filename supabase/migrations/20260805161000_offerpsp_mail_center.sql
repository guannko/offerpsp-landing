create table public.offerpsp_email_threads (
  id uuid primary key default gen_random_uuid(),
  thread_key text not null unique,
  subject text not null,
  participant_email text not null,
  counterparty_type text not null default 'general'
    check (counterparty_type in ('merchant', 'provider', 'casino', 'research_psp', 'subagent', 'general')),
  counterparty_id text,
  lead_id uuid references public.offerpsp_leads(lead_id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'awaiting_reply', 'follow_up', 'closed', 'archived')),
  unread_count integer not null default 0 check (unread_count >= 0),
  assigned_to uuid references public.offerpsp_staff_members(user_id) on delete set null,
  last_message_at timestamptz not null default now(),
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offerpsp_email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.offerpsp_email_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_email text not null,
  recipient_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text not null,
  text_body text,
  html_body text,
  external_message_id text unique,
  in_reply_to text,
  message_references text[] not null default '{}',
  provider text not null default 'control_bridge'
    check (provider in ('imap', 'smtp', 'brevo', 'control_bridge')),
  delivery_status text not null default 'received'
    check (delivery_status in ('draft', 'sending', 'sent', 'failed', 'cancelled', 'received')),
  is_read boolean not null default false,
  source_draft_id bigint unique references public.email_drafts(id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  raw_headers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index offerpsp_email_threads_last_message_idx
  on public.offerpsp_email_threads (last_message_at desc);
create index offerpsp_email_threads_status_idx
  on public.offerpsp_email_threads (status, unread_count, last_message_at desc);
create index offerpsp_email_threads_lead_idx
  on public.offerpsp_email_threads (lead_id, last_message_at desc)
  where lead_id is not null;
create index offerpsp_email_messages_thread_idx
  on public.offerpsp_email_messages (thread_id, created_at);

alter table public.offerpsp_email_threads enable row level security;
alter table public.offerpsp_email_messages enable row level security;

revoke all on table public.offerpsp_email_threads from public, anon, authenticated;
revoke all on table public.offerpsp_email_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.offerpsp_email_threads to service_role;
grant select, insert, update, delete on table public.offerpsp_email_messages to service_role;

create or replace function private.offerpsp_mail_normalize_subject(p_subject text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(trim(regexp_replace(
    regexp_replace(coalesce(nullif(trim(p_subject), ''), '(no subject)'),
      '^\s*((re|fw|fwd)\s*:\s*)+', '', 'i'),
    '\s+', ' ', 'g'
  )));
$$;

create or replace function private.offerpsp_mail_extract_email(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(trim(coalesce(
    nullif(substring(coalesce(p_value, '') from '<([^>]+)>'), ''),
    nullif(substring(coalesce(p_value, '') from '([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})'), ''),
    p_value
  )));
$$;

create or replace function private.offerpsp_mail_resolve_counterparty(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_email text := private.offerpsp_mail_extract_email(p_email);
  v_lead_id uuid;
  v_entity_id text;
begin
  select lead_id into v_lead_id
  from public.offerpsp_leads
  where lower(work_email) = v_email
  order by submitted_at desc nulls last
  limit 1;
  if v_lead_id is not null then
    return jsonb_build_object('type', 'merchant', 'id', v_lead_id::text, 'lead_id', v_lead_id);
  end if;

  select id::text into v_entity_id from public.casino_leads
  where lower(email) = v_email order by updated_at desc nulls last limit 1;
  if v_entity_id is not null then
    return jsonb_build_object('type', 'casino', 'id', v_entity_id);
  end if;

  select id::text into v_entity_id from public.psp_providers
  where lower(email) = v_email order by updated_at desc nulls last limit 1;
  if v_entity_id is not null then
    return jsonb_build_object('type', 'research_psp', 'id', v_entity_id);
  end if;

  return jsonb_build_object('type', 'general', 'id', null);
end;
$$;

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
  v_counterparty jsonb;
  v_lead_id uuid;
begin
  if v_email is null or v_email = '' then return new; end if;
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
    delivery_status = excluded.delivery_status,
    provider = excluded.provider,
    sent_at = coalesce(offerpsp_email_messages.sent_at, excluded.sent_at),
    text_body = excluded.text_body,
    subject = excluded.subject;
  return new;
end;
$$;

drop trigger if exists offerpsp_sync_email_draft_trigger on public.email_drafts;
create trigger offerpsp_sync_email_draft_trigger
after insert or update of status, to_email, subject, body on public.email_drafts
for each row execute function private.offerpsp_sync_email_draft();

create or replace function public.aibot_n8n_ingest_email(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_sender text := private.offerpsp_mail_extract_email(coalesce(p_payload ->> 'from_email', p_payload ->> 'from'));
  v_subject text := coalesce(nullif(trim(p_payload ->> 'subject'), ''), '(no subject)');
  v_thread_key text;
  v_thread_id uuid;
  v_message_id uuid;
  v_counterparty jsonb;
  v_received_at timestamptz;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Email payload must be an object'; end if;
  if v_sender is null or v_sender = '' or position('@' in v_sender) = 0 then raise exception 'Sender email is required'; end if;
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
    jsonb_build_object('last_ingest_provider', 'imap')
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
    nullif(trim(p_payload ->> 'message_id'), ''), nullif(trim(p_payload ->> 'in_reply_to'), ''),
    private.offerpsp_jsonb_text_array(p_payload -> 'references'),
    'imap', 'received', false, v_received_at,
    coalesce(p_payload -> 'headers', '{}'::jsonb), p_payload - array['text','html','headers'], v_received_at
  )
  on conflict (external_message_id) do update set
    thread_id = excluded.thread_id
  returning id into v_message_id;

  return jsonb_build_object(
    'success', true,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'counterparty_type', v_counterparty ->> 'type',
    'counterparty_id', v_counterparty ->> 'id'
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
      'follow_up', (select count(*) from public.offerpsp_email_threads where status = 'follow_up')
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
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_offerpsp_email_thread_state(
  p_thread_id uuid,
  p_status text,
  p_mark_read boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_thread public.offerpsp_email_threads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('open', 'awaiting_reply', 'follow_up', 'closed', 'archived') then raise exception 'Unsupported email thread status'; end if;
  update public.offerpsp_email_threads
  set status = p_status,
      unread_count = case when p_mark_read is true then 0 else unread_count end,
      updated_at = now()
  where id = p_thread_id returning * into v_thread;
  if not found then raise exception 'Email thread not found'; end if;
  if p_mark_read is true then
    update public.offerpsp_email_messages set is_read = true
    where thread_id = p_thread_id and direction = 'inbound';
  end if;
  return to_jsonb(v_thread);
end;
$$;

create or replace function public.link_offerpsp_email_thread(
  p_thread_id uuid,
  p_counterparty_type text,
  p_counterparty_id text default null,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_thread public.offerpsp_email_threads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_counterparty_type not in ('merchant', 'provider', 'casino', 'research_psp', 'subagent', 'general') then
    raise exception 'Unsupported email counterparty type';
  end if;
  if p_lead_id is not null and not exists (select 1 from public.offerpsp_leads where lead_id = p_lead_id) then
    raise exception 'OfferPSP merchant not found';
  end if;
  update public.offerpsp_email_threads
  set counterparty_type = p_counterparty_type,
      counterparty_id = nullif(trim(p_counterparty_id), ''),
      lead_id = p_lead_id,
      updated_at = now()
  where id = p_thread_id returning * into v_thread;
  if not found then raise exception 'Email thread not found'; end if;
  return to_jsonb(v_thread);
end;
$$;

revoke all on function public.aibot_n8n_ingest_email(jsonb) from public, anon, authenticated;
revoke all on function public.get_offerpsp_mail_center(integer) from public, anon;
revoke all on function public.set_offerpsp_email_thread_state(uuid, text, boolean) from public, anon;
revoke all on function public.link_offerpsp_email_thread(uuid, text, text, uuid) from public, anon;
grant execute on function public.aibot_n8n_ingest_email(jsonb) to service_role;
grant execute on function public.get_offerpsp_mail_center(integer) to authenticated;
grant execute on function public.set_offerpsp_email_thread_state(uuid, text, boolean) to authenticated;
grant execute on function public.link_offerpsp_email_thread(uuid, text, text, uuid) to authenticated;

-- Import the existing outbound journal into the new threaded mailbox.
insert into public.offerpsp_email_threads(
  thread_key, subject, participant_email, counterparty_type, counterparty_id,
  lead_id, status, unread_count, last_message_at
)
select distinct on (thread_key)
  thread_key, subject, participant_email, counterparty_type, counterparty_id,
  lead_id, status, 0, last_message_at
from (
  select md5(private.offerpsp_mail_extract_email(d.to_email) || '|' || private.offerpsp_mail_normalize_subject(d.subject)) as thread_key,
    coalesce(nullif(trim(d.subject), ''), '(no subject)') as subject,
    private.offerpsp_mail_extract_email(d.to_email) as participant_email,
    coalesce(private.offerpsp_mail_resolve_counterparty(d.to_email) ->> 'type', 'general') as counterparty_type,
    private.offerpsp_mail_resolve_counterparty(d.to_email) ->> 'id' as counterparty_id,
    case when d.lead_internal_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then d.lead_internal_id::uuid else null end as lead_id,
    case when bool_or(d.status = 'sent') then 'awaiting_reply' else 'open' end as status,
    max(d.created_at) as last_message_at
  from public.email_drafts d
  where nullif(trim(d.to_email), '') is not null
  group by 1, 2, 3, 4, 5, 6
) existing
order by thread_key, last_message_at desc
on conflict (thread_key) do nothing;

insert into public.offerpsp_email_messages(
  thread_id, direction, sender_email, recipient_emails, subject, text_body,
  provider, delivery_status, is_read, source_draft_id, sent_at, created_at
)
select t.id, 'outbound', 'bizdev@offerpsp.com', array[private.offerpsp_mail_extract_email(d.to_email)],
  coalesce(nullif(trim(d.subject), ''), '(no subject)'), d.body,
  case when d.status = 'sent' then 'brevo' else 'control_bridge' end,
  coalesce(d.status, 'draft'), true, d.id,
  case when d.status = 'sent' then d.created_at else null end, d.created_at
from public.email_drafts d
join public.offerpsp_email_threads t
  on t.thread_key = md5(private.offerpsp_mail_extract_email(d.to_email) || '|' || private.offerpsp_mail_normalize_subject(d.subject))
where nullif(trim(d.to_email), '') is not null
on conflict (source_draft_id) do nothing;

comment on table public.offerpsp_email_threads is
  'Staff mailbox threads for bizdev@offerpsp.com, linked to OfferPSP and AIBot entities.';
comment on function public.aibot_n8n_ingest_email(jsonb) is
  'Service-role-only inbound IMAP ingestion with automatic merchant, casino and PSP linkage.';
