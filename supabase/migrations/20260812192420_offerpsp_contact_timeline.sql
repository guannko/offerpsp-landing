-- Canonical contact history for merchants, PSPs, casinos and subagents.
-- AIBot uses the same ledger as Captain's Bridge before preparing or sending mail.

create table if not exists private.offerpsp_contact_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('merchant', 'psp', 'casino', 'subagent')),
  entity_id text not null check (length(trim(entity_id)) between 1 and 100),
  event_type text not null,
  channel text not null default 'system'
    check (channel in ('system', 'email', 'telegram', 'task', 'note', 'status', 'offer', 'introduction')),
  direction text check (direction in ('inbound', 'outbound', 'internal')),
  occurred_at timestamptz not null default now(),
  actor_type text not null default 'system',
  title text not null,
  summary text,
  source_type text not null,
  source_id text not null,
  result_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, event_type)
);

create index if not exists offerpsp_contact_events_entity_time_idx
  on private.offerpsp_contact_events (entity_type, entity_id, occurred_at desc);
create index if not exists offerpsp_contact_events_email_state_idx
  on private.offerpsp_contact_events (entity_type, entity_id, direction, occurred_at desc)
  where channel = 'email';

revoke all on table private.offerpsp_contact_events from public, anon, authenticated;
grant select, insert, update, delete on table private.offerpsp_contact_events to service_role;

create or replace function private.offerpsp_contact_identity(
  p_entity_type text,
  p_entity_id text,
  p_email text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text := lower(trim(coalesce(p_entity_type, '')));
  v_id text := nullif(trim(p_entity_id), '');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_legacy_id integer;
  v_uuid uuid;
begin
  v_type := case v_type
    when 'research_psp' then 'psp'
    when 'provider' then 'psp'
    when 'research_casino' then 'casino'
    when 'organization' then 'subagent'
    when 'agent' then 'subagent'
    else v_type
  end;

  if v_type = 'psp' and v_id is not null then
    if v_id ~ '^[0-9]+$' and exists (select 1 from public.psp_providers where id = v_id::integer) then
      return jsonb_build_object('entity_type', 'psp', 'entity_id', v_id);
    end if;
    begin
      v_uuid := v_id::uuid;
      select legacy_psp_id into v_legacy_id from private.offerpsp_providers where id = v_uuid;
      if found then
        return jsonb_build_object('entity_type', 'psp', 'entity_id', coalesce(v_legacy_id::text, v_id));
      end if;
    exception when invalid_text_representation then null;
    end;
  elsif v_type = 'merchant' and v_id is not null then
    if exists (select 1 from public.offerpsp_leads where lead_id::text = v_id) then
      return jsonb_build_object('entity_type', 'merchant', 'entity_id', v_id);
    end if;
  elsif v_type = 'casino' and v_id is not null then
    if v_id ~ '^[0-9]+$' and exists (select 1 from public.casino_leads where id = v_id::integer) then
      return jsonb_build_object('entity_type', 'casino', 'entity_id', v_id);
    end if;
  elsif v_type = 'subagent' and v_id is not null then
    if exists (select 1 from public.offerpsp_organizations where id::text = v_id and organization_type = 'agent') then
      return jsonb_build_object('entity_type', 'subagent', 'entity_id', v_id);
    end if;
  end if;

  if v_email <> '' then
    select lead_id::text into v_id from public.offerpsp_leads
      where lower(work_email) = v_email order by submitted_at desc nulls last limit 1;
    if v_id is not null then return jsonb_build_object('entity_type', 'merchant', 'entity_id', v_id); end if;

    select id::text into v_id from public.psp_providers
      where lower(email) = v_email order by updated_at desc nulls last limit 1;
    if v_id is not null then return jsonb_build_object('entity_type', 'psp', 'entity_id', v_id); end if;

    select id::text into v_id from public.casino_leads
      where lower(email) = v_email order by updated_at desc nulls last limit 1;
    if v_id is not null then return jsonb_build_object('entity_type', 'casino', 'entity_id', v_id); end if;
  end if;

  return null;
end;
$$;

revoke all on function private.offerpsp_contact_identity(text, text, text) from public, anon, authenticated;
grant execute on function private.offerpsp_contact_identity(text, text, text) to service_role;

create or replace function private.offerpsp_record_contact_event(
  p_entity_type text,
  p_entity_id text,
  p_event_type text,
  p_channel text,
  p_direction text,
  p_occurred_at timestamptz,
  p_actor_type text,
  p_title text,
  p_summary text,
  p_source_type text,
  p_source_id text,
  p_result_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_identity jsonb;
  v_event_id uuid;
begin
  v_identity := private.offerpsp_contact_identity(p_entity_type, p_entity_id, null);
  if v_identity is null then return null; end if;

  insert into private.offerpsp_contact_events(
    entity_type, entity_id, event_type, channel, direction, occurred_at, actor_type,
    title, summary, source_type, source_id, result_status, metadata
  ) values (
    v_identity ->> 'entity_type', v_identity ->> 'entity_id', p_event_type, p_channel,
    p_direction, coalesce(p_occurred_at, now()), coalesce(nullif(p_actor_type, ''), 'system'),
    coalesce(nullif(trim(p_title), ''), p_event_type), p_summary,
    p_source_type, p_source_id, p_result_status, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_type, source_id, event_type) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    occurred_at = excluded.occurred_at,
    title = excluded.title,
    summary = excluded.summary,
    result_status = excluded.result_status,
    metadata = excluded.metadata
  returning id into v_event_id;
  return v_event_id;
end;
$$;

revoke all on function private.offerpsp_record_contact_event(text,text,text,text,text,timestamptz,text,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function private.offerpsp_record_contact_event(text,text,text,text,text,timestamptz,text,text,text,text,text,text,jsonb)
  to service_role;

create or replace function private.offerpsp_contact_event_from_email_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_thread public.offerpsp_email_threads%rowtype;
  v_identity jsonb;
  v_draft public.email_drafts%rowtype;
  v_type text;
  v_id text;
begin
  select * into v_thread from public.offerpsp_email_threads where id = new.thread_id;
  v_type := v_thread.counterparty_type;
  v_id := v_thread.counterparty_id;

  if new.source_draft_id is not null then
    select * into v_draft from public.email_drafts where id = new.source_draft_id;
    if found and coalesce(v_thread.counterparty_type, 'general') = 'general' then
      if v_draft.lead_internal_id ~ '^(psp|casino):' then
        v_type := split_part(v_draft.lead_internal_id, ':', 1);
        v_id := split_part(v_draft.lead_internal_id, ':', 2);
      elsif v_draft.lead_internal_id ~* '^[0-9a-f-]{36}$' then
        v_type := 'merchant'; v_id := v_draft.lead_internal_id;
      end if;
    end if;
  end if;

  v_identity := private.offerpsp_contact_identity(v_type, v_id, v_thread.participant_email);
  if v_identity is null then return new; end if;

  update public.offerpsp_email_threads set
    counterparty_type = case v_identity ->> 'entity_type' when 'psp' then 'research_psp' else v_identity ->> 'entity_type' end,
    counterparty_id = v_identity ->> 'entity_id',
    lead_id = case when v_identity ->> 'entity_type' = 'merchant' then (v_identity ->> 'entity_id')::uuid else lead_id end
  where id = new.thread_id
    and (counterparty_type = 'general' or counterparty_id is null);

  perform private.offerpsp_record_contact_event(
    v_identity ->> 'entity_type', v_identity ->> 'entity_id',
    case when new.direction = 'inbound' then 'email_received'
         when new.delivery_status = 'failed' then 'email_failed' else 'email_sent' end,
    'email', new.direction,
    coalesce(new.received_at, new.sent_at, new.created_at), 'system', new.subject,
    case when new.direction = 'outbound' then 'Получатель: ' || array_to_string(new.recipient_emails, ', ')
         else 'Отправитель: ' || new.sender_email end,
    'email_message', new.id::text, new.delivery_status,
    jsonb_build_object('thread_id', new.thread_id, 'provider', new.provider)
  );
  return new;
end;
$$;

create or replace function private.offerpsp_contact_event_from_email_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_id text;
  v_identity jsonb;
begin
  if coalesce(new.lead_internal_id, '') ~ '^(psp|casino):' then
    v_type := split_part(new.lead_internal_id, ':', 1);
    v_id := split_part(new.lead_internal_id, ':', 2);
  elsif coalesce(new.lead_internal_id, '') ~* '^[0-9a-f-]{36}$' then
    v_type := 'merchant'; v_id := new.lead_internal_id;
  end if;
  v_identity := private.offerpsp_contact_identity(v_type, v_id, new.to_email);
  if v_identity is null then return new; end if;
  perform private.offerpsp_record_contact_event(
    v_identity ->> 'entity_type', v_identity ->> 'entity_id', 'email_draft', 'email', 'outbound',
    new.created_at, 'staff', new.subject, 'Черновик для ' || new.to_email,
    'email_draft', new.id::text, new.status, jsonb_build_object('recipient', new.to_email)
  );
  return new;
end;
$$;

create or replace function private.offerpsp_contact_event_from_task()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_id text;
begin
  if new.lead_id is not null then v_type := 'merchant'; v_id := new.lead_id::text;
  elsif new.entity_type is not null then v_type := new.entity_type; v_id := new.entity_id;
  else return new;
  end if;
  perform private.offerpsp_record_contact_event(
    v_type, v_id, 'task_' || new.status, 'task', 'internal', coalesce(new.updated_at, new.created_at),
    new.source, new.title, new.details, 'task', new.id::text, new.status,
    jsonb_build_object('due_at', new.due_at, 'priority', new.priority)
  );
  return new;
end;
$$;

create or replace function private.offerpsp_contact_event_from_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.offerpsp_record_contact_event(
    'merchant', new.lead_id::text, new.activity_type, 'system', 'internal', new.created_at,
    new.actor_type, new.title, new.body, 'lead_activity', new.id::text, null, new.metadata
  );
  return new;
end;
$$;

create or replace function private.offerpsp_contact_event_from_note()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.offerpsp_record_contact_event(
    new.entity_type, new.entity_id, 'note_created', 'note', 'internal', new.created_at,
    'staff', 'Добавлена заметка', left(new.body, 500), 'research_note', new.id::text, null, '{}'::jsonb
  );
  return new;
end;
$$;

create or replace function private.offerpsp_contact_event_from_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.entity_type in ('merchant', 'provider', 'organization', 'research_psp', 'research_casino') then
    perform private.offerpsp_record_contact_event(
      new.entity_type, new.entity_id, new.action_type,
      case when new.action_type like '%email%' then 'email' when new.action_type like '%status%' or new.action_type like '%archive%' then 'status' else 'system' end,
      'internal', new.created_at, 'staff', replace(new.action_type, '_', ' '), new.reason,
      'entity_audit', new.id::text, null,
      jsonb_build_object('before', new.before_state, 'after', new.after_state)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_contact_email_message on public.offerpsp_email_messages;
create trigger tg_offerpsp_contact_email_message after insert or update on public.offerpsp_email_messages
  for each row execute function private.offerpsp_contact_event_from_email_message();
drop trigger if exists tg_offerpsp_contact_email_draft on public.email_drafts;
create trigger tg_offerpsp_contact_email_draft after insert or update on public.email_drafts
  for each row execute function private.offerpsp_contact_event_from_email_draft();
drop trigger if exists tg_offerpsp_contact_task on public.offerpsp_tasks;
create trigger tg_offerpsp_contact_task after insert or update on public.offerpsp_tasks
  for each row execute function private.offerpsp_contact_event_from_task();
drop trigger if exists tg_offerpsp_contact_activity on public.offerpsp_lead_activities;
create trigger tg_offerpsp_contact_activity after insert on public.offerpsp_lead_activities
  for each row execute function private.offerpsp_contact_event_from_activity();
drop trigger if exists tg_offerpsp_contact_note on private.offerpsp_research_notes;
create trigger tg_offerpsp_contact_note after insert on private.offerpsp_research_notes
  for each row execute function private.offerpsp_contact_event_from_note();
drop trigger if exists tg_offerpsp_contact_audit on private.offerpsp_entity_audit;
create trigger tg_offerpsp_contact_audit after insert on private.offerpsp_entity_audit
  for each row execute function private.offerpsp_contact_event_from_audit();

-- Three complete business days must pass after an outbound email before a follow-up.
-- Weekends do not consume the cooldown: Monday -> Thursday, Friday -> Wednesday.
create or replace function private.offerpsp_business_days_after(
  p_sent_at timestamptz,
  p_as_of date default current_date
)
returns integer
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when p_sent_at is null or p_as_of <= p_sent_at::date then 0
    else coalesce((
      select count(*)::integer
      from generate_series(p_sent_at::date + 1, p_as_of, interval '1 day') as day
      where extract(isodow from day) between 1 and 5
    ), 0)
  end;
$$;

create or replace function private.offerpsp_next_follow_up_date(p_sent_at timestamptz)
returns date
language sql
stable
set search_path = pg_catalog
as $$
  select case when p_sent_at is null then null else (
    select day::date
    from generate_series(p_sent_at::date + 1, p_sent_at::date + 14, interval '1 day') as day
    where extract(isodow from day) between 1 and 5
    order by day
    offset 2 limit 1
  ) end;
$$;

revoke all on function private.offerpsp_business_days_after(timestamptz, date) from public, anon, authenticated;
revoke all on function private.offerpsp_next_follow_up_date(timestamptz) from public, anon, authenticated;
grant execute on function private.offerpsp_business_days_after(timestamptz, date) to service_role;
grant execute on function private.offerpsp_next_follow_up_date(timestamptz) to service_role;

create or replace function private.offerpsp_contact_summary(p_entity_type text, p_entity_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_last_out private.offerpsp_contact_events%rowtype;
  v_last_in private.offerpsp_contact_events%rowtype;
  v_draft private.offerpsp_contact_events%rowtype;
  v_state text := 'clear_to_prepare';
  v_business_days integer := 0;
  v_next_follow_up date;
begin
  select * into v_last_out from private.offerpsp_contact_events
    where entity_type = p_entity_type and entity_id = p_entity_id and channel = 'email'
      and direction = 'outbound' and event_type in ('email_sent', 'email_failed')
      and coalesce(result_status, 'sent') <> 'failed'
    order by occurred_at desc limit 1;
  select * into v_last_in from private.offerpsp_contact_events
    where entity_type = p_entity_type and entity_id = p_entity_id and channel = 'email' and direction = 'inbound'
    order by occurred_at desc limit 1;
  select * into v_draft from private.offerpsp_contact_events
    where entity_type = p_entity_type and entity_id = p_entity_id and event_type = 'email_draft'
      and coalesce(result_status, 'draft') = 'draft'
    order by occurred_at desc limit 1;

  if v_last_out.id is not null then
    v_business_days := private.offerpsp_business_days_after(v_last_out.occurred_at, current_date);
    v_next_follow_up := private.offerpsp_next_follow_up_date(v_last_out.occurred_at);
  end if;

  if v_draft.id is not null and (v_last_out.id is null or v_draft.occurred_at > v_last_out.occurred_at) then
    v_state := 'draft_exists';
  elsif v_last_in.id is not null and (v_last_out.id is null or v_last_in.occurred_at > v_last_out.occurred_at) then
    v_state := 'reply_received';
  elsif v_last_out.id is not null and v_business_days < 3 then
    v_state := 'duplicate_recent';
  elsif v_last_out.id is not null then
    v_state := 'follow_up_due';
  end if;

  return jsonb_build_object(
    'state', v_state,
    'business_days_since_outbound', case when v_last_out.id is null then null else v_business_days end,
    'next_follow_up_date', v_next_follow_up,
    'cooldown_policy', '3_business_days_monday_friday',
    'last_outbound', case when v_last_out.id is null then null else jsonb_build_object(
      'at', v_last_out.occurred_at, 'subject', v_last_out.title, 'status', v_last_out.result_status) end,
    'last_inbound', case when v_last_in.id is null then null else jsonb_build_object(
      'at', v_last_in.occurred_at, 'subject', v_last_in.title) end,
    'open_draft', case when v_draft.id is null then null else jsonb_build_object(
      'at', v_draft.occurred_at, 'subject', v_draft.title, 'source_id', v_draft.source_id) end
  );
end;
$$;

revoke all on function private.offerpsp_contact_summary(text, text) from public, anon, authenticated;
grant execute on function private.offerpsp_contact_summary(text, text) to service_role;

create or replace function public.get_offerpsp_contact_timeline(
  p_entity_type text,
  p_entity_id text,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_identity jsonb;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  v_identity := private.offerpsp_contact_identity(p_entity_type, p_entity_id, null);
  if v_identity is null then raise exception 'Contact not found'; end if;
  return jsonb_build_object(
    'entity_type', v_identity ->> 'entity_type',
    'entity_id', v_identity ->> 'entity_id',
    'communication_state', private.offerpsp_contact_summary(v_identity ->> 'entity_type', v_identity ->> 'entity_id'),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from (select * from private.offerpsp_contact_events
        where entity_type = v_identity ->> 'entity_type' and entity_id = v_identity ->> 'entity_id'
        order by occurred_at desc limit greatest(1, least(coalesce(p_limit, 100), 250))) e), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_offerpsp_contact_timeline(text, text, integer) from public, anon;
grant execute on function public.get_offerpsp_contact_timeline(text, text, integer) to authenticated;

create or replace function public.aibot_n8n_contact_timeline_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text := lower(trim(coalesce(p_command ->> 'action', 'get')));
  v_identity jsonb;
  v_summary jsonb;
  v_override boolean := coalesce((p_command ->> 'override')::boolean, false);
  v_state text;
  v_stop boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then raise exception 'Command must be an object'; end if;

  v_identity := private.offerpsp_contact_identity(
    p_command ->> 'entity_type', p_command ->> 'entity_id', p_command ->> 'email'
  );
  if v_identity is null then
    return jsonb_build_object('ok', false, 'code', 'contact_not_resolved',
      'message', 'Сначала найди точную карточку через Operating Desk и передай entity_type/entity_id.');
  end if;

  v_summary := private.offerpsp_contact_summary(v_identity ->> 'entity_type', v_identity ->> 'entity_id');
  v_state := v_summary ->> 'state';

  if v_action = 'preflight_email' then
    v_stop := v_state in ('duplicate_recent', 'draft_exists') and not v_override;
    return jsonb_build_object(
      'ok', true, 'action', v_action,
      'entity_type', v_identity ->> 'entity_type', 'entity_id', v_identity ->> 'entity_id',
      'communication_state', v_summary,
      'stop_required', v_stop,
      'allowed', not v_stop,
      'message', case v_state
        when 'duplicate_recent' then 'Стоп: этому контакту уже отправляли письмо менее трёх рабочих дней назад. Назови Boris дату, тему и ближайшую допустимую дату follow-up.'
        when 'draft_exists' then 'Стоп: для контакта уже есть незакрытый черновик. Покажи его тему вместо создания дубля.'
        when 'reply_received' then 'Получен ответ после последнего исходящего. Сначала изучи ответ, затем готовь следующее письмо.'
        when 'follow_up_due' then 'Повторное касание уместно: после последнего письма прошло не менее трёх полных рабочих дней.'
        else 'Предыдущих исходящих писем не найдено; можно готовить первое письмо.' end,
      'override_used', v_override
    );
  elsif v_action = 'add_event' then
    perform private.offerpsp_record_contact_event(
      v_identity ->> 'entity_type', v_identity ->> 'entity_id',
      coalesce(nullif(p_command ->> 'event_type', ''), 'manual_event'),
      coalesce(nullif(p_command ->> 'channel', ''), 'system'),
      coalesce(nullif(p_command ->> 'direction', ''), 'internal'), now(),
      'aibot', coalesce(nullif(p_command ->> 'title', ''), 'AIBot action'),
      p_command ->> 'summary', 'aibot', gen_random_uuid()::text,
      p_command ->> 'result_status', coalesce(p_command -> 'metadata', '{}'::jsonb)
    );
  elsif v_action <> 'get' then
    raise exception 'Unsupported action';
  end if;

  return jsonb_build_object(
    'ok', true, 'action', v_action,
    'entity_type', v_identity ->> 'entity_type', 'entity_id', v_identity ->> 'entity_id',
    'communication_state', private.offerpsp_contact_summary(v_identity ->> 'entity_type', v_identity ->> 'entity_id'),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from (select * from private.offerpsp_contact_events
        where entity_type = v_identity ->> 'entity_type' and entity_id = v_identity ->> 'entity_id'
        order by occurred_at desc limit greatest(1, least(coalesce((p_command ->> 'limit')::integer, 30), 100))) e), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.aibot_n8n_contact_timeline_v1(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_contact_timeline_v1(jsonb) to service_role;

-- Backfill current operational history. Trigger upserts keep this idempotent.
insert into private.offerpsp_contact_events(
  entity_type, entity_id, event_type, channel, direction, occurred_at, actor_type,
  title, summary, source_type, source_id, result_status, metadata
)
select 'merchant', a.lead_id::text, a.activity_type, 'system', 'internal', a.created_at, a.actor_type,
  a.title, a.body, 'lead_activity', a.id::text, null, a.metadata
from public.offerpsp_lead_activities a
on conflict (source_type, source_id, event_type) do nothing;

insert into private.offerpsp_contact_events(
  entity_type, entity_id, event_type, channel, direction, occurred_at, actor_type,
  title, summary, source_type, source_id, result_status, metadata
)
select case n.entity_type when 'research_psp' then 'psp' else 'casino' end,
  n.entity_id, 'note_created', 'note', 'internal', n.created_at, 'staff', 'Добавлена заметка',
  left(n.body, 500), 'research_note', n.id::text, null, '{}'::jsonb
from private.offerpsp_research_notes n
on conflict (source_type, source_id, event_type) do nothing;

-- Re-run current mail rows through the trigger function without changing business data.
update public.offerpsp_email_messages set metadata = metadata;
update public.email_drafts set status = status;

comment on table private.offerpsp_contact_events is
  'Canonical append-only operational timeline used by Captain''s Bridge and BIXOFFPSP AIBot.';
comment on function public.aibot_n8n_contact_timeline_v1(jsonb) is
  'Service-only contact history and mandatory email duplicate/follow-up preflight for AIBot.';

-- Trigger functions are invoked by their triggers only, never through the Data API.
revoke all on function private.offerpsp_contact_event_from_email_message() from public, anon, authenticated;
revoke all on function private.offerpsp_contact_event_from_email_draft() from public, anon, authenticated;
revoke all on function private.offerpsp_contact_event_from_task() from public, anon, authenticated;
revoke all on function private.offerpsp_contact_event_from_activity() from public, anon, authenticated;
revoke all on function private.offerpsp_contact_event_from_note() from public, anon, authenticated;
revoke all on function private.offerpsp_contact_event_from_audit() from public, anon, authenticated;
