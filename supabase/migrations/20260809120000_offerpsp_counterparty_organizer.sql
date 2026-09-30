-- Unified counterparty organizer for the Control Bridge and the Telegram AIBot.
-- Research casinos/PSPs remain in their source tables; this migration adds a
-- shared operational layer (notes, tasks, mail drafts and safe bot commands).

create table if not exists private.offerpsp_research_notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('research_casino', 'research_psp')),
  entity_id text not null,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on table private.offerpsp_research_notes from public, anon, authenticated;
grant select, insert, update, delete on table private.offerpsp_research_notes to service_role;

create index if not exists offerpsp_research_notes_entity_created_idx
  on private.offerpsp_research_notes (entity_type, entity_id, created_at desc);

alter table public.offerpsp_tasks
  add column if not exists entity_type text,
  add column if not exists entity_id text;

alter table public.offerpsp_tasks
  drop constraint if exists offerpsp_tasks_research_entity_check;
alter table public.offerpsp_tasks
  add constraint offerpsp_tasks_research_entity_check
  check (
    (entity_type is null and entity_id is null)
    or (entity_type in ('research_casino', 'research_psp') and nullif(trim(entity_id), '') is not null)
  ) not valid;
alter table public.offerpsp_tasks validate constraint offerpsp_tasks_research_entity_check;

create index if not exists offerpsp_tasks_research_entity_open_idx
  on public.offerpsp_tasks (entity_type, entity_id, due_at nulls last)
  where entity_type is not null and status in ('pending', 'in_progress');

create or replace function private.offerpsp_research_entity_exists(
  p_entity_type text,
  p_entity_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case p_entity_type
    when 'research_casino' then exists (
      select 1 from public.casino_leads where id = p_entity_id::integer
    )
    when 'research_psp' then exists (
      select 1 from public.psp_providers where id = p_entity_id::integer
    )
    else false
  end;
$$;

revoke all on function private.offerpsp_research_entity_exists(text, text) from public, anon, authenticated;
grant execute on function private.offerpsp_research_entity_exists(text, text) to service_role;

create or replace function public.get_offerpsp_research_workspace(
  p_entity_type text,
  p_record_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_entity jsonb;
  v_key text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('casino', 'psp') then
    raise exception 'Unsupported research entity type';
  end if;
  v_type := case when p_entity_type = 'casino' then 'research_casino' else 'research_psp' end;
  v_key := p_entity_type || ':' || p_record_id::text;

  if p_entity_type = 'casino' then
    select to_jsonb(c) - 'archived_by' into v_entity
    from public.casino_leads c where c.id = p_record_id::integer;
  else
    select to_jsonb(p) - 'archived_by' into v_entity
    from public.psp_providers p where p.id = p_record_id::integer;
  end if;
  if v_entity is null then raise exception 'Research entity not found'; end if;

  return jsonb_build_object(
    'entity', v_entity,
    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from private.offerpsp_research_notes n
      where n.entity_type = v_type and n.entity_id = p_record_id::text
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.status in ('pending','in_progress') desc, t.due_at asc nulls last, t.created_at desc)
      from public.offerpsp_tasks t
      where t.entity_type = v_type and t.entity_id = p_record_id::text
    ), '[]'::jsonb),
    'email_drafts', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at desc nulls last, d.id desc)
      from public.email_drafts d where d.lead_internal_id = v_key
    ), '[]'::jsonb),
    'email_threads', coalesce((
      select jsonb_agg(to_jsonb(th) order by th.last_message_at desc)
      from public.offerpsp_email_threads th
      where th.counterparty_type = case when p_entity_type = 'casino' then 'casino' else 'research_psp' end
        and th.counterparty_id = p_record_id::text
    ), '[]'::jsonb),
    'email_messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by coalesce(m.received_at, m.sent_at, m.created_at) desc)
      from public.offerpsp_email_messages m
      join public.offerpsp_email_threads th on th.id = m.thread_id
      where th.counterparty_type = case when p_entity_type = 'casino' then 'casino' else 'research_psp' end
        and th.counterparty_id = p_record_id::text
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select id, action_type, actor_user_id, created_at
        from private.offerpsp_entity_audit
        where entity_type = v_type and entity_id = p_record_id::text
        order by created_at desc limit 100
      ) a
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_offerpsp_research_note(
  p_entity_type text,
  p_record_id bigint,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_note private.offerpsp_research_notes;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_entity_type not in ('casino', 'psp') then raise exception 'Unsupported research entity type'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Note is required'; end if;
  v_type := case when p_entity_type = 'casino' then 'research_casino' else 'research_psp' end;
  if not private.offerpsp_research_entity_exists(v_type, p_record_id::text) then
    raise exception 'Research entity not found';
  end if;
  insert into private.offerpsp_research_notes(entity_type, entity_id, body, created_by)
  values (v_type, p_record_id::text, trim(p_body), auth.uid()) returning * into v_note;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
  values (v_type, p_record_id::text, 'note_created', auth.uid(), jsonb_build_object('note_id', v_note.id));
  return to_jsonb(v_note);
end;
$$;

create or replace function public.delete_offerpsp_research_note(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_note private.offerpsp_research_notes;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  delete from private.offerpsp_research_notes where id = p_note_id returning * into v_note;
  if not found then raise exception 'Note not found'; end if;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state)
  values (v_note.entity_type, v_note.entity_id, 'note_deleted', auth.uid(), jsonb_build_object('note_id', v_note.id));
  return true;
end;
$$;

create or replace function public.create_offerpsp_research_email_draft(
  p_entity_type text,
  p_record_id bigint,
  p_to_email text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_draft public.email_drafts;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_entity_type not in ('casino', 'psp') then raise exception 'Unsupported research entity type'; end if;
  v_type := case when p_entity_type = 'casino' then 'research_casino' else 'research_psp' end;
  if not private.offerpsp_research_entity_exists(v_type, p_record_id::text) then raise exception 'Research entity not found'; end if;
  if nullif(trim(p_to_email), '') is null or position('@' in p_to_email) = 0 then raise exception 'Valid recipient email is required'; end if;
  if nullif(trim(p_subject), '') is null then raise exception 'Email subject is required'; end if;
  if nullif(trim(p_body), '') is null then raise exception 'Email body is required'; end if;
  insert into public.email_drafts(chat_id, lead_internal_id, to_email, subject, body, status)
  values ('control-bridge', p_entity_type || ':' || p_record_id::text, lower(trim(p_to_email)), trim(p_subject), trim(p_body), 'draft')
  returning * into v_draft;
  insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
  values (v_type, p_record_id::text, 'email_draft_created', auth.uid(), jsonb_build_object('draft_id', v_draft.id));
  return to_jsonb(v_draft);
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
  v_entity_type text;
  v_entity_id text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Task payload must be an object'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all (array[
      'title', 'details', 'status', 'priority', 'due_at', 'assigned_to',
      'lead_id', 'entity_type', 'entity_id', 'metadata'
    ])
  ) then raise exception 'Task payload contains unsupported fields'; end if;

  v_title := nullif(trim(p_payload ->> 'title'), '');
  v_status := coalesce(nullif(trim(p_payload ->> 'status'), ''), 'pending');
  v_priority := coalesce(nullif(trim(p_payload ->> 'priority'), ''), 'normal');
  v_lead_id := nullif(trim(p_payload ->> 'lead_id'), '')::uuid;
  v_assigned_to := nullif(trim(p_payload ->> 'assigned_to'), '')::uuid;
  v_due_at := nullif(trim(p_payload ->> 'due_at'), '')::timestamptz;
  v_entity_type := nullif(trim(p_payload ->> 'entity_type'), '');
  v_entity_id := nullif(trim(p_payload ->> 'entity_id'), '');
  if v_title is null then raise exception 'Task title is required'; end if;
  if char_length(v_title) > 240 then raise exception 'Task title is too long'; end if;
  if v_status not in ('pending', 'in_progress', 'done', 'cancelled', 'failed') then raise exception 'Unsupported task status'; end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'Unsupported task priority'; end if;
  if (v_entity_type is null) <> (v_entity_id is null) then raise exception 'Task entity type and ID must be supplied together'; end if;
  if v_entity_type is not null and not private.offerpsp_research_entity_exists(v_entity_type, v_entity_id) then raise exception 'Research entity not found'; end if;
  if v_lead_id is not null and not exists (select 1 from public.offerpsp_leads where lead_id = v_lead_id) then raise exception 'OfferPSP merchant not found'; end if;
  if v_assigned_to is not null and not exists (select 1 from public.offerpsp_staff_members where user_id = v_assigned_to and active = true) then raise exception 'Active staff assignee not found'; end if;

  if p_task_id is null then
    insert into public.offerpsp_tasks(
      lead_id, entity_type, entity_id, assigned_to, created_by, source, title,
      details, status, priority, due_at, completed_at, metadata
    ) values (
      v_lead_id, v_entity_type, v_entity_id, coalesce(v_assigned_to, auth.uid()), auth.uid(), 'staff', v_title,
      nullif(trim(p_payload ->> 'details'), ''), v_status, v_priority, v_due_at,
      case when v_status = 'done' then now() end, coalesce(p_payload -> 'metadata', '{}'::jsonb)
    ) returning * into v_after;
    insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
    values ('task', v_after.id::text, 'created', auth.uid(), to_jsonb(v_after));
  else
    select * into v_before from public.offerpsp_tasks where id = p_task_id for update;
    if not found then raise exception 'OfferPSP task not found'; end if;
    update public.offerpsp_tasks set
      lead_id = v_lead_id, entity_type = v_entity_type, entity_id = v_entity_id,
      assigned_to = v_assigned_to, title = v_title,
      details = nullif(trim(p_payload ->> 'details'), ''), status = v_status,
      priority = v_priority, due_at = v_due_at,
      completed_at = case when v_status = 'done' then coalesce(completed_at, now()) else null end,
      metadata = coalesce(p_payload -> 'metadata', metadata), updated_at = now()
    where id = p_task_id returning * into v_after;
    insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, before_state, after_state)
    values ('task', v_after.id::text, 'updated', auth.uid(), to_jsonb(v_before), to_jsonb(v_after));
  end if;
  return to_jsonb(v_after);
end;
$$;

-- A single service-role tool for the Telegram agent. It supports discovery,
-- safe organizer actions and offer intake/search without exposing private data
-- to browser clients.
create or replace function public.aibot_n8n_operating_desk(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text := lower(coalesce(p_command ->> 'action', ''));
  v_entity text := lower(coalesce(p_command ->> 'entity_type', 'all'));
  v_query text := lower(trim(coalesce(p_command ->> 'query', '')));
  v_geo text := lower(trim(coalesce(p_command ->> 'geo', '')));
  v_status text := lower(trim(coalesce(p_command ->> 'status', '')));
  v_status_scope text := lower(trim(coalesce(p_command ->> 'status_scope', '')));
  v_provider text := lower(trim(coalesce(p_command ->> 'provider', '')));
  v_method text := lower(trim(coalesce(p_command ->> 'method', '')));
  v_currency text := lower(trim(coalesce(p_command ->> 'currency', '')));
  v_flow text := lower(trim(coalesce(p_command ->> 'flow', '')));
  v_limit integer := least(greatest(coalesce((p_command ->> 'limit')::integer, 25), 1), 100);
  v_ids integer[] := array[]::integer[];
  v_id integer;
  v_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_draft public.email_drafts;
  v_job jsonb;
  v_recipient text;
  v_research_type text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then raise exception 'Command must be an object'; end if;

  if p_command ? 'ids' then
    if jsonb_typeof(p_command -> 'ids') <> 'array' then raise exception 'ids must be an array'; end if;
    select coalesce(array_agg(distinct value::integer), array[]::integer[]) into v_ids
    from jsonb_array_elements_text(p_command -> 'ids');
  elsif p_command ? 'id' then
    v_ids := array[(p_command ->> 'id')::integer];
  end if;

  if v_action = 'search_companies' then
    if v_entity not in ('all', 'casino', 'psp') then raise exception 'Unsupported entity type'; end if;
    if v_status_scope not in ('', 'all', 'active', 'pipeline', 'inactive') then raise exception 'Unsupported status scope'; end if;
    select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_results from (
      select jsonb_build_object('entity_type','casino','id',c.id,'name',c.name,'website',c.website,'geo',c.geo,'email',c.email,'telegram',c.telegram,'contact_status',c.contact_status,'record_state',c.record_state,'score',c.score) row_data
      from public.casino_leads c
      where v_entity in ('all','casino')
        and (v_query = '' or lower(concat_ws(' ',c.name,c.website,c.email,c.telegram,c.contact_name,c.sphere,c.license,array_to_string(c.tags,' '))) like '%'||v_query||'%')
        and (v_geo = '' or lower(coalesce(c.geo,'')) like '%'||v_geo||'%')
        and (v_status = '' or lower(coalesce(c.contact_status,'')) = v_status or lower(c.record_state) = v_status)
        and (
          v_status_scope in ('', 'all')
          or (v_status_scope = 'active' and c.record_state = 'active' and lower(coalesce(c.contact_status,'')) in ('active','partner','replied','deal'))
          or (v_status_scope = 'pipeline' and c.record_state = 'active' and lower(coalesce(c.contact_status,'')) not in ('active','partner','replied','deal','rejected','lost','paused'))
          or (v_status_scope = 'inactive' and (c.record_state = 'archived' or lower(coalesce(c.contact_status,'')) in ('rejected','lost','paused')))
        )
      union all
      select jsonb_build_object('entity_type','psp','id',p.id,'name',p.name,'website',p.website,'geo',p.geo,'email',p.email,'telegram',p.telegram,'contact_status',p.contact_status,'provider_status',p.provider_status,'record_state',p.record_state) row_data
      from public.psp_providers p
      where v_entity in ('all','psp')
        and (v_query = '' or lower(concat_ws(' ',p.name,p.website,p.email,p.telegram,p.contact_name,p.specialization,array_to_string(p.supported_countries,' '),array_to_string(p.payment_methods,' '))) like '%'||v_query||'%')
        and (v_geo = '' or lower(concat_ws(' ',p.geo,array_to_string(p.supported_countries,' '))) like '%'||v_geo||'%')
        and (v_status = '' or lower(coalesce(p.contact_status,'')) = v_status or lower(p.provider_status) = v_status or lower(p.record_state) = v_status)
        and (
          v_status_scope in ('', 'all')
          or (v_status_scope = 'active' and p.record_state = 'active' and lower(coalesce(p.provider_status,'')) in ('active','partner','live','top'))
          or (v_status_scope = 'pipeline' and p.record_state = 'active' and lower(coalesce(p.provider_status,'')) not in ('active','partner','live','top','rejected','lost','paused','inactive'))
          or (v_status_scope = 'inactive' and (p.record_state = 'archived' or lower(coalesce(p.provider_status,'')) in ('rejected','lost','paused','inactive')))
        )
      limit v_limit
    ) found;
    return jsonb_build_object('action',v_action,'count',jsonb_array_length(v_results),'items',v_results);
  end if;

  if v_action = 'search_offers' then
    select coalesce(jsonb_agg(to_jsonb(route_row)), '[]'::jsonb) into v_results from (
      select r.id, r.internal_code, p.internal_code provider_code, p.brand_name provider_name,
        r.client_title, r.geos, r.currencies, r.methods, r.flow, r.verticals,
        r.traffic_types, r.integrations, r.status, r.updated_at
      from private.offerpsp_offer_routes r
      join private.offerpsp_providers p on p.id = r.provider_id
      where (v_query = '' or lower(concat_ws(' ',p.brand_name,p.internal_code,r.client_title,r.internal_code,array_to_string(r.geos,' '),array_to_string(r.currencies,' '),array_to_string(r.methods,' '),r.flow,array_to_string(r.verticals,' '))) like '%'||v_query||'%')
        and (v_provider = '' or lower(concat_ws(' ',p.brand_name,p.internal_code)) like '%'||v_provider||'%')
        and (v_geo = '' or exists (select 1 from unnest(r.geos) g where lower(g) like '%'||v_geo||'%'))
        and (v_method = '' or exists (select 1 from unnest(r.methods) m where lower(m) like '%'||v_method||'%'))
        and (v_currency = '' or exists (select 1 from unnest(r.currencies) c where lower(c) like '%'||v_currency||'%'))
        and (v_flow = '' or lower(r.flow) = v_flow)
        and (v_status = '' or lower(r.status) = v_status)
      order by (r.status = 'published') desc, r.updated_at desc
      limit v_limit
    ) route_row;
    return jsonb_build_object('action',v_action,'count',jsonb_array_length(v_results),'items',v_results);
  end if;

  if v_action = 'ingest_offer' then
    v_job := public.enqueue_offerpsp_source(
      p_command ->> 'provider_name',
      coalesce(nullif(p_command ->> 'source_type',''), 'telegram'),
      p_command ->> 'source_text',
      p_command ->> 'source_reference',
      coalesce(p_command -> 'source_metadata','{}'::jsonb) || jsonb_build_object('entrypoint','aibot_operating_desk')
    );
    return jsonb_build_object('action',v_action,'result',v_job);
  end if;

  if v_entity not in ('casino','psp') then raise exception 'entity_type must be casino or psp'; end if;
  if cardinality(v_ids) = 0 then raise exception 'Explicit id or ids are required for mutations'; end if;
  if cardinality(v_ids) > 1 and not coalesce((p_command ->> 'confirm')::boolean, false) then
    return jsonb_build_object('confirmation_required',true,'action',v_action,'entity_type',v_entity,'ids',to_jsonb(v_ids),'count',cardinality(v_ids));
  end if;

  foreach v_id in array v_ids loop
    v_research_type := case when v_entity='casino' then 'research_casino' else 'research_psp' end;
    if not private.offerpsp_research_entity_exists(v_research_type, v_id::text) then
      raise exception 'Research entity % not found', v_id;
    end if;
    if v_action = 'update_status' then
      if v_entity = 'casino' then
        update public.casino_leads set
          contact_status = coalesce(nullif(p_command ->> 'contact_status',''), contact_status),
          record_state = coalesce(nullif(p_command ->> 'record_state',''), record_state), updated_at = now()
        where id = v_id;
      else
        update public.psp_providers set
          contact_status = coalesce(nullif(p_command ->> 'contact_status',''), contact_status),
          provider_status = coalesce(nullif(p_command ->> 'provider_status',''), provider_status),
          record_state = coalesce(nullif(p_command ->> 'record_state',''), record_state), updated_at = now()
        where id = v_id;
      end if;
      insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
      values (v_research_type, v_id::text, 'aibot_status_updated', auth.uid(), p_command - 'confirm');
    elsif v_action = 'add_note' then
      if nullif(trim(p_command ->> 'body'),'') is null then raise exception 'Note body is required'; end if;
      insert into private.offerpsp_research_notes(entity_type,entity_id,body)
      values (v_research_type,v_id::text,trim(p_command ->> 'body'));
      insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
      values (v_research_type, v_id::text, 'aibot_note_created', auth.uid(), jsonb_build_object('body', trim(p_command ->> 'body')));
    elsif v_action = 'create_task' then
      if nullif(trim(p_command ->> 'title'),'') is null then raise exception 'Task title is required'; end if;
      insert into public.offerpsp_tasks(entity_type,entity_id,source,title,details,status,priority,due_at,metadata)
      values (v_research_type,v_id::text,'aibot',trim(p_command ->> 'title'),nullif(trim(p_command ->> 'details'),''),'pending',coalesce(nullif(p_command ->> 'priority',''),'normal'),nullif(p_command ->> 'due_at','')::timestamptz,jsonb_build_object('entrypoint','telegram_aibot'));
      insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
      values (v_research_type, v_id::text, 'aibot_task_created', auth.uid(), jsonb_build_object('title', trim(p_command ->> 'title')));
    elsif v_action = 'create_email_draft' then
      if nullif(trim(p_command ->> 'subject'),'') is null or nullif(trim(p_command ->> 'body'),'') is null then raise exception 'Email subject and body are required'; end if;
      if v_entity = 'casino' then select lower(trim(c.email)) into v_recipient from public.casino_leads c where c.id = v_id;
      else select lower(trim(p.email)) into v_recipient from public.psp_providers p where p.id = v_id;
      end if;
      v_recipient := coalesce(nullif(lower(trim(p_command ->> 'to_email')),''), nullif(v_recipient,''));
      if v_recipient is null or position('@' in v_recipient) = 0 then raise exception 'Recipient email is missing for entity %', v_id; end if;
      insert into public.email_drafts(chat_id,lead_internal_id,to_email,subject,body,status)
      values (coalesce(nullif(p_command ->> 'chat_id',''),'aibot'),v_entity||':'||v_id::text,
        v_recipient,trim(p_command ->> 'subject'),trim(p_command ->> 'body'),'draft')
      returning * into v_draft;
      insert into private.offerpsp_entity_audit(entity_type, entity_id, action_type, actor_user_id, after_state)
      values (v_research_type, v_id::text, 'aibot_email_draft_created', auth.uid(), jsonb_build_object('draft_id', v_draft.id, 'to_email', v_recipient));
    else
      raise exception 'Unsupported operating desk action';
    end if;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('action',v_action,'entity_type',v_entity,'processed',v_count,'ids',to_jsonb(v_ids),'status','completed');
end;
$$;

revoke all on function public.get_offerpsp_research_workspace(text, bigint) from public, anon;
revoke all on function public.save_offerpsp_research_note(text, bigint, text) from public, anon;
revoke all on function public.delete_offerpsp_research_note(uuid) from public, anon;
revoke all on function public.create_offerpsp_research_email_draft(text, bigint, text, text, text) from public, anon;
revoke all on function public.aibot_n8n_operating_desk(jsonb) from public, anon, authenticated;
grant execute on function public.get_offerpsp_research_workspace(text, bigint) to authenticated;
grant execute on function public.save_offerpsp_research_note(text, bigint, text) to authenticated;
grant execute on function public.delete_offerpsp_research_note(uuid) to authenticated;
grant execute on function public.create_offerpsp_research_email_draft(text, bigint, text, text, text) to authenticated;
grant execute on function public.aibot_n8n_operating_desk(jsonb) to service_role;

comment on function public.aibot_n8n_operating_desk(jsonb) is
  'Service-role tool for Telegram AIBot: company/offer search, safe group organizer actions and offer ingestion.';
