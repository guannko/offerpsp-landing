alter table private.offerpsp_entity_audit
  drop constraint if exists offerpsp_entity_audit_entity_type_check;
alter table private.offerpsp_entity_audit
  add constraint offerpsp_entity_audit_entity_type_check
  check (entity_type in (
    'merchant', 'provider', 'offer', 'organization', 'agent_assignment',
    'margin_policy', 'research_casino', 'research_psp', 'task',
    'integration', 'telegram_message'
  ));

create table if not exists private.offerpsp_integration_settings (
  integration_key text primary key
    check (integration_key in ('supabase', 'n8n', 'email', 'telegram')),
  display_name text not null,
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('success', 'failed')),
  last_error text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists private.offerpsp_telegram_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  message_text text not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  external_message_id text,
  lead_id uuid references public.offerpsp_leads(lead_id) on delete set null,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists offerpsp_telegram_messages_created_idx
  on private.offerpsp_telegram_messages(created_at desc);
create index if not exists offerpsp_telegram_messages_lead_idx
  on private.offerpsp_telegram_messages(lead_id, created_at desc)
  where lead_id is not null;

revoke all on table private.offerpsp_integration_settings from public, anon, authenticated;
revoke all on table private.offerpsp_telegram_messages from public, anon, authenticated;

insert into private.offerpsp_integration_settings(integration_key, display_name, enabled, configuration)
values
  ('supabase', 'Supabase', true, '{}'::jsonb),
  ('n8n', 'n8n / AIBot', true, jsonb_build_object('operations_enabled', true)),
  ('email', 'Email Sender', true, jsonb_build_object(
    'from_name', 'OfferPSP',
    'from_email', 'bizdev@offerpsp.com',
    'reply_to', 'bizdev@offerpsp.com'
  )),
  ('telegram', 'Telegram', true, jsonb_build_object(
    'default_chat_id', '1124622535',
    'lead_notifications', true,
    'error_notifications', true
  ))
on conflict (integration_key) do nothing;

create or replace function public.get_offerpsp_operations_workspace()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.due_at asc nulls last, row_data.created_at desc)
      from (
        select t.id, t.lead_id, t.assigned_to, t.created_by, t.source,
          t.title, t.details, t.status, t.priority, t.due_at, t.completed_at,
          t.automation_ref, t.metadata, t.created_at, t.updated_at,
          coalesce(l.company, l.name, l.work_email) as merchant_name,
          s.display_name as assignee_name
        from public.offerpsp_tasks t
        left join public.offerpsp_leads l on l.lead_id = t.lead_id
        left join public.offerpsp_staff_members s on s.user_id = t.assigned_to
        order by t.due_at asc nulls last, t.created_at desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'aibot_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.scheduled_for asc nulls last, row_data.created_at desc)
      from (
        select id, task_type, payload, priority, scheduled_for, status, result,
          error, created_by, created_at, started_at, completed_at, ref_type, ref_id
        from public.bot_tasks
        order by scheduled_for asc nulls last, created_at desc
        limit 250
      ) row_data
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'display_name', coalesce(s.display_name, u.email),
        'email', u.email,
        'role', s.role
      ) order by coalesce(s.display_name, u.email))
      from public.offerpsp_staff_members s
      join auth.users u on u.id = s.user_id
      where s.active = true
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

create or replace function public.save_offerpsp_task(
  p_task_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_before public.offerpsp_tasks;
  v_after public.offerpsp_tasks;
  v_title text;
  v_status text;
  v_priority text;
  v_lead_id uuid;
  v_assigned_to uuid;
  v_due_at timestamptz;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Task payload must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all (array[
      'title', 'details', 'status', 'priority', 'due_at', 'assigned_to',
      'lead_id', 'metadata'
    ])
  ) then
    raise exception 'Task payload contains unsupported fields';
  end if;

  v_title := nullif(trim(p_payload ->> 'title'), '');
  v_status := coalesce(nullif(trim(p_payload ->> 'status'), ''), 'pending');
  v_priority := coalesce(nullif(trim(p_payload ->> 'priority'), ''), 'normal');
  v_lead_id := nullif(trim(p_payload ->> 'lead_id'), '')::uuid;
  v_assigned_to := nullif(trim(p_payload ->> 'assigned_to'), '')::uuid;
  v_due_at := nullif(trim(p_payload ->> 'due_at'), '')::timestamptz;

  if v_title is null then raise exception 'Task title is required'; end if;
  if char_length(v_title) > 240 then raise exception 'Task title is too long'; end if;
  if v_status not in ('pending', 'in_progress', 'done', 'cancelled', 'failed') then
    raise exception 'Unsupported task status';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Unsupported task priority';
  end if;
  if v_lead_id is not null and not exists (
    select 1 from public.offerpsp_leads where lead_id = v_lead_id
  ) then
    raise exception 'OfferPSP merchant not found';
  end if;
  if v_assigned_to is not null and not exists (
    select 1 from public.offerpsp_staff_members
    where user_id = v_assigned_to and active = true
  ) then
    raise exception 'Active staff assignee not found';
  end if;

  if p_task_id is null then
    insert into public.offerpsp_tasks(
      lead_id, assigned_to, created_by, source, title, details, status,
      priority, due_at, completed_at, metadata
    ) values (
      v_lead_id, coalesce(v_assigned_to, auth.uid()), auth.uid(), 'staff',
      v_title, nullif(trim(p_payload ->> 'details'), ''), v_status,
      v_priority, v_due_at,
      case when v_status = 'done' then now() end,
      coalesce(p_payload -> 'metadata', '{}'::jsonb)
    ) returning * into v_after;
    insert into private.offerpsp_entity_audit(
      entity_type, entity_id, action_type, actor_user_id, after_state
    ) values ('task', v_after.id::text, 'created', auth.uid(), to_jsonb(v_after));
  else
    select * into v_before from public.offerpsp_tasks where id = p_task_id for update;
    if not found then raise exception 'OfferPSP task not found'; end if;
    update public.offerpsp_tasks
    set lead_id = v_lead_id,
        assigned_to = v_assigned_to,
        title = v_title,
        details = nullif(trim(p_payload ->> 'details'), ''),
        status = v_status,
        priority = v_priority,
        due_at = v_due_at,
        completed_at = case when v_status = 'done' then coalesce(completed_at, now()) else null end,
        metadata = coalesce(p_payload -> 'metadata', metadata),
        updated_at = now()
    where id = p_task_id
    returning * into v_after;
    insert into private.offerpsp_entity_audit(
      entity_type, entity_id, action_type, actor_user_id, before_state, after_state
    ) values ('task', v_after.id::text, 'updated', auth.uid(), to_jsonb(v_before), to_jsonb(v_after));
  end if;

  return to_jsonb(v_after);
end;
$$;

create or replace function public.delete_offerpsp_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_task public.offerpsp_tasks;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  select * into v_task from public.offerpsp_tasks where id = p_task_id for update;
  if not found then raise exception 'OfferPSP task not found'; end if;
  if v_task.source <> 'staff' or v_task.automation_ref is not null then
    raise exception 'Automated tasks cannot be deleted; cancel them instead';
  end if;
  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state
  ) values ('task', v_task.id::text, 'deleted', auth.uid(), to_jsonb(v_task));
  delete from public.offerpsp_tasks where id = p_task_id;
  return true;
end;
$$;

create or replace function public.get_offerpsp_integration_settings()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', integration_key,
      'display_name', display_name,
      'enabled', enabled,
      'configuration', configuration,
      'last_tested_at', last_tested_at,
      'last_test_status', last_test_status,
      'last_error', last_error,
      'updated_at', updated_at
    ) order by integration_key)
    from private.offerpsp_integration_settings
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_offerpsp_integration_settings(
  p_integration_key text,
  p_enabled boolean,
  p_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_allowed text[];
  v_before private.offerpsp_integration_settings;
  v_after private.offerpsp_integration_settings;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_integration_key not in ('n8n', 'email', 'telegram') then
    raise exception 'This integration cannot be edited';
  end if;
  if p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    raise exception 'Integration configuration must be an object';
  end if;
  v_allowed := case p_integration_key
    when 'n8n' then array['operations_enabled']
    when 'email' then array['from_name', 'from_email', 'reply_to']
    when 'telegram' then array['default_chat_id', 'lead_notifications', 'error_notifications']
  end;
  if exists (
    select 1 from jsonb_object_keys(p_configuration) supplied(key)
    where not (supplied.key = any(v_allowed))
  ) then
    raise exception 'Integration configuration contains unsupported fields';
  end if;
  if p_integration_key = 'email' and (
    coalesce(p_configuration ->> 'from_name', '') = '' or
    coalesce(p_configuration ->> 'from_email', '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or
    coalesce(p_configuration ->> 'reply_to', '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ) then
    raise exception 'Valid email sender settings are required';
  end if;
  if p_integration_key = 'telegram' and coalesce(p_configuration ->> 'default_chat_id', '') !~ '^-?[0-9]+$' then
    raise exception 'Valid Telegram chat ID is required';
  end if;

  select * into v_before from private.offerpsp_integration_settings
  where integration_key = p_integration_key for update;
  update private.offerpsp_integration_settings
  set enabled = p_enabled,
      configuration = p_configuration,
      updated_by = auth.uid(),
      updated_at = now()
  where integration_key = p_integration_key
  returning * into v_after;

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, before_state, after_state
  ) values (
    'integration', p_integration_key, 'settings_updated', auth.uid(),
    to_jsonb(v_before) - 'updated_by', to_jsonb(v_after) - 'updated_by'
  );
  return jsonb_build_object(
    'key', v_after.integration_key,
    'display_name', v_after.display_name,
    'enabled', v_after.enabled,
    'configuration', v_after.configuration,
    'updated_at', v_after.updated_at
  );
end;
$$;

create or replace function public.record_offerpsp_integration_test(
  p_integration_key text,
  p_success boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  update private.offerpsp_integration_settings
  set last_tested_at = now(),
      last_test_status = case when p_success then 'success' else 'failed' end,
      last_error = case when p_success then null else left(coalesce(p_error, 'Unknown error'), 1000) end,
      updated_by = auth.uid(),
      updated_at = now()
  where integration_key = p_integration_key;
  return found;
end;
$$;

create or replace function public.record_offerpsp_telegram_message(
  p_chat_id text,
  p_message_text text,
  p_status text,
  p_external_message_id text default null,
  p_error_message text default null,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_message private.offerpsp_telegram_messages;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if nullif(trim(p_chat_id), '') is null or nullif(trim(p_message_text), '') is null then
    raise exception 'Telegram chat and message are required';
  end if;
  if p_status not in ('sent', 'failed') then raise exception 'Unsupported Telegram status'; end if;
  if char_length(p_message_text) > 4096 then raise exception 'Telegram message is too long'; end if;
  insert into private.offerpsp_telegram_messages(
    chat_id, message_text, status, external_message_id, lead_id,
    error_message, created_by, sent_at
  ) values (
    trim(p_chat_id), p_message_text, p_status, nullif(trim(p_external_message_id), ''),
    p_lead_id, nullif(left(p_error_message, 1000), ''), auth.uid(),
    case when p_status = 'sent' then now() end
  ) returning * into v_message;
  return to_jsonb(v_message) - 'created_by';
end;
$$;

create or replace function public.list_offerpsp_telegram_messages(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
    from (
      select m.id, m.chat_id, m.message_text, m.status, m.external_message_id,
        m.lead_id, m.error_message, m.created_at, m.sent_at,
        coalesce(l.company, l.name, l.work_email) as merchant_name
      from private.offerpsp_telegram_messages m
      left join public.offerpsp_leads l on l.lead_id = m.lead_id
      order by m.created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 250))
    ) row_data
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_offerpsp_operations_workspace() from public, anon;
revoke all on function public.save_offerpsp_task(uuid, jsonb) from public, anon;
revoke all on function public.delete_offerpsp_task(uuid) from public, anon;
revoke all on function public.get_offerpsp_integration_settings() from public, anon;
revoke all on function public.save_offerpsp_integration_settings(text, boolean, jsonb) from public, anon;
revoke all on function public.record_offerpsp_integration_test(text, boolean, text) from public, anon;
revoke all on function public.record_offerpsp_telegram_message(text, text, text, text, text, uuid) from public, anon;
revoke all on function public.list_offerpsp_telegram_messages(integer) from public, anon;

grant execute on function public.get_offerpsp_operations_workspace() to authenticated;
grant execute on function public.save_offerpsp_task(uuid, jsonb) to authenticated;
grant execute on function public.delete_offerpsp_task(uuid) to authenticated;
grant execute on function public.get_offerpsp_integration_settings() to authenticated;
grant execute on function public.save_offerpsp_integration_settings(text, boolean, jsonb) to authenticated;
grant execute on function public.record_offerpsp_integration_test(text, boolean, text) to authenticated;
grant execute on function public.record_offerpsp_telegram_message(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.list_offerpsp_telegram_messages(integer) to authenticated;

comment on function public.get_offerpsp_operations_workspace() is
  'Staff-only task manager workspace. AIBot execution tasks are intentionally read-only.';
comment on function public.save_offerpsp_task(uuid, jsonb) is
  'Staff-only create/update operation for human OfferPSP tasks.';
comment on function public.get_offerpsp_integration_settings() is
  'Returns safe operational settings only. Credentials remain in server-side secret storage.';
