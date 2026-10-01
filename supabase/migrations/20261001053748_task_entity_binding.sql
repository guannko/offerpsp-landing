-- Tasks can bind canonical merchants/PSPs as well as legacy research records.
-- No business status, source offer or transport policy is changed.
alter table public.offerpsp_tasks drop constraint offerpsp_tasks_research_entity_check;
alter table public.offerpsp_tasks add constraint offerpsp_tasks_research_entity_check check (
  (entity_type is null and entity_id is null)
  or (entity_type in ('merchant','provider','research_casino','research_psp')
      and nullif(trim(entity_id),'') is not null)
);

create or replace function private.offerpsp_task_entity_exists(p_entity_type text,p_entity_id text)
returns boolean language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_entity_type in ('merchant','provider') then
    if p_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    if p_entity_type='merchant' then
      return exists(select 1 from public.offerpsp_leads where lead_id=p_entity_id::uuid);
    end if;
    return exists(select 1 from private.offerpsp_providers where id=p_entity_id::uuid);
  end if;
  if p_entity_type in ('research_casino','research_psp') and p_entity_id ~ '^[1-9][0-9]{0,8}$' then
    return private.offerpsp_research_entity_exists(p_entity_type,p_entity_id);
  end if;
  return false;
end;
$$;
revoke all on function private.offerpsp_task_entity_exists(text,text) from public,anon,authenticated,service_role;

create or replace function public.save_offerpsp_task(
  p_task_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  v_entity_type := case v_entity_type when 'casino' then 'research_casino'
    when 'psp_research' then 'research_psp' else v_entity_type end;
  if v_entity_type is not null and not private.offerpsp_task_entity_exists(v_entity_type, v_entity_id) then
    raise exception 'Task entity not found';
  end if;
  if v_entity_type = 'merchant' then
    if v_lead_id is not null and v_lead_id <> v_entity_id::uuid then
      raise exception 'Task merchant linkage conflicts with lead_id';
    end if;
    v_lead_id := v_entity_id::uuid;
  end if;
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

-- Preserve the existing staff-only RPC boundary, including after replacement.
revoke all on function public.save_offerpsp_task(uuid,jsonb) from public,anon;
grant execute on function public.save_offerpsp_task(uuid,jsonb) to authenticated,service_role;

create or replace function public.get_offerpsp_entity_workspace(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if p_entity_type = 'merchant' then
    if not exists (select 1 from public.offerpsp_leads where lead_id = p_entity_id) then
      raise exception 'OfferPSP merchant not found';
    end if;

    return jsonb_build_object(
      'contacts', coalesce((
        select jsonb_agg(to_jsonb(c) order by c.is_primary desc, c.active desc, c.full_name)
        from private.offerpsp_merchant_contacts c
        where c.lead_id = p_entity_id
      ), '[]'::jsonb),
      'documents', coalesce((
        select jsonb_agg(to_jsonb(d) order by (d.status = 'active') desc, d.updated_at desc)
        from private.offerpsp_entity_documents d
        where d.entity_type = 'merchant' and d.merchant_lead_id = p_entity_id
      ), '[]'::jsonb),
      'activities', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from (
          select * from public.offerpsp_lead_activities
          where lead_id = p_entity_id
          order by created_at desc
          limit 200
        ) a
      ), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(to_jsonb(t) order by
          case t.status when 'open' then 0 when 'in_progress' then 1 else 2 end,
          t.due_at nulls last,
          t.created_at desc)
        from public.offerpsp_tasks t
        where t.lead_id = p_entity_id
      ), '[]'::jsonb),
      'conversations', coalesce((
        select jsonb_agg(
          to_jsonb(c) || jsonb_build_object(
            'messages', coalesce((
              select jsonb_agg(to_jsonb(m) order by m.sent_at, m.created_at)
              from public.offerpsp_messages m
              where m.conversation_id = c.id
            ), '[]'::jsonb)
          ) order by c.updated_at desc
        )
        from public.offerpsp_conversations c
        where c.lead_id = p_entity_id
      ), '[]'::jsonb),
      'emails', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at desc)
        from public.email_drafts e
        where e.lead_internal_id = p_entity_id::text
      ), '[]'::jsonb)
    );
  elsif p_entity_type = 'provider' then
    if not exists (select 1 from private.offerpsp_providers where id = p_entity_id) then
      raise exception 'PSP provider not found';
    end if;

    return jsonb_build_object(
      'contacts', coalesce((
        select jsonb_agg(to_jsonb(c) order by c.active desc, c.full_name)
        from private.offerpsp_provider_contacts c
        where c.provider_id = p_entity_id
      ), '[]'::jsonb),
      'documents', coalesce((
        select jsonb_agg(to_jsonb(d) order by (d.status = 'active') desc, d.updated_at desc)
        from private.offerpsp_entity_documents d
        where d.entity_type = 'provider' and d.provider_id = p_entity_id
      ), '[]'::jsonb),
      'activities', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from (
          select * from private.offerpsp_supply_activities
          where provider_id = p_entity_id
          order by created_at desc
          limit 200
        ) a
      ), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(to_jsonb(t) order by
          case t.status when 'pending' then 0 when 'in_progress' then 1 else 2 end,
          t.due_at nulls last, t.created_at desc)
        from public.offerpsp_tasks t
        where t.entity_type='provider' and t.entity_id=p_entity_id::text
      ), '[]'::jsonb),
      'conversations', '[]'::jsonb,
      'emails', '[]'::jsonb
    );
  end if;

  raise exception 'Unsupported OfferPSP entity type';
end;
$$;
