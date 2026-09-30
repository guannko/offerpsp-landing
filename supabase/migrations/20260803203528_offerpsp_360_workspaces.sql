create table if not exists private.offerpsp_merchant_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  full_name text not null,
  role_title text,
  email text,
  telegram text,
  phone text,
  preferred_channel text not null default 'telegram'
    check (preferred_channel in ('telegram', 'email', 'phone', 'other')),
  is_primary boolean not null default false,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists offerpsp_merchant_contacts_primary_idx
  on private.offerpsp_merchant_contacts(lead_id)
  where is_primary and active;

create index if not exists offerpsp_merchant_contacts_lead_idx
  on private.offerpsp_merchant_contacts(lead_id, active desc, updated_at desc);

create table if not exists private.offerpsp_entity_documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('merchant', 'provider')),
  merchant_lead_id uuid references public.offerpsp_leads(lead_id) on delete cascade,
  provider_id uuid references private.offerpsp_providers(id) on delete cascade,
  category text not null default 'other'
    check (category in ('license', 'kyb', 'contract', 'rate_card', 'integration', 'statement', 'other')),
  title text not null,
  file_name text,
  document_url text,
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  expires_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (entity_type = 'merchant' and merchant_lead_id is not null and provider_id is null)
    or (entity_type = 'provider' and provider_id is not null and merchant_lead_id is null)
  ),
  check (nullif(trim(coalesce(document_url, '')), '') is not null or nullif(trim(coalesce(storage_path, '')), '') is not null)
);

create index if not exists offerpsp_entity_documents_merchant_idx
  on private.offerpsp_entity_documents(merchant_lead_id, status, updated_at desc)
  where merchant_lead_id is not null;

create index if not exists offerpsp_entity_documents_provider_idx
  on private.offerpsp_entity_documents(provider_id, status, updated_at desc)
  where provider_id is not null;

create or replace function public.get_offerpsp_entity_workspace(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
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
      'tasks', '[]'::jsonb,
      'conversations', '[]'::jsonb,
      'emails', '[]'::jsonb
    );
  end if;

  raise exception 'Unsupported OfferPSP entity type';
end;
$$;

create or replace function public.save_offerpsp_merchant_contact(
  p_lead_id uuid,
  p_contact_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_contact private.offerpsp_merchant_contacts;
  v_full_name text;
  v_is_primary boolean;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from public.offerpsp_leads where lead_id = p_lead_id) then
    raise exception 'OfferPSP merchant not found';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Contact payload must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all (array[
      'full_name', 'role_title', 'email', 'telegram', 'phone',
      'preferred_channel', 'is_primary', 'active', 'notes'
    ])
  ) then
    raise exception 'Contact payload contains unsupported fields';
  end if;

  v_full_name := nullif(trim(p_payload ->> 'full_name'), '');
  if v_full_name is null then raise exception 'Contact name is required'; end if;
  v_is_primary := coalesce((p_payload ->> 'is_primary')::boolean, false);

  if v_is_primary then
    update private.offerpsp_merchant_contacts
    set is_primary = false, updated_at = now(), updated_by = auth.uid()
    where lead_id = p_lead_id and is_primary and (p_contact_id is null or id <> p_contact_id);
  end if;

  if p_contact_id is null then
    insert into private.offerpsp_merchant_contacts(
      lead_id, full_name, role_title, email, telegram, phone,
      preferred_channel, is_primary, active, notes, created_by, updated_by
    ) values (
      p_lead_id,
      v_full_name,
      nullif(trim(p_payload ->> 'role_title'), ''),
      nullif(trim(p_payload ->> 'email'), ''),
      nullif(trim(p_payload ->> 'telegram'), ''),
      nullif(trim(p_payload ->> 'phone'), ''),
      coalesce(nullif(trim(p_payload ->> 'preferred_channel'), ''), 'telegram'),
      v_is_primary,
      coalesce((p_payload ->> 'active')::boolean, true),
      nullif(trim(p_payload ->> 'notes'), ''),
      auth.uid(), auth.uid()
    ) returning * into v_contact;
  else
    update private.offerpsp_merchant_contacts
    set full_name = v_full_name,
        role_title = nullif(trim(p_payload ->> 'role_title'), ''),
        email = nullif(trim(p_payload ->> 'email'), ''),
        telegram = nullif(trim(p_payload ->> 'telegram'), ''),
        phone = nullif(trim(p_payload ->> 'phone'), ''),
        preferred_channel = coalesce(nullif(trim(p_payload ->> 'preferred_channel'), ''), preferred_channel),
        is_primary = v_is_primary,
        active = coalesce((p_payload ->> 'active')::boolean, active),
        notes = nullif(trim(p_payload ->> 'notes'), ''),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_contact_id and lead_id = p_lead_id
    returning * into v_contact;
    if not found then raise exception 'Merchant contact not found'; end if;
  end if;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    p_lead_id, auth.uid(), 'staff',
    case when p_contact_id is null then 'contact_added' else 'contact_updated' end,
    case when p_contact_id is null then 'Merchant contact added' else 'Merchant contact updated' end,
    v_contact.full_name,
    jsonb_build_object('contact_id', v_contact.id, 'preferred_channel', v_contact.preferred_channel),
    false
  );

  return to_jsonb(v_contact);
end;
$$;

create or replace function public.archive_offerpsp_merchant_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_contact private.offerpsp_merchant_contacts;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  update private.offerpsp_merchant_contacts
  set active = false, is_primary = false, updated_by = auth.uid(), updated_at = now()
  where id = p_contact_id
  returning * into v_contact;
  if not found then raise exception 'Merchant contact not found'; end if;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    v_contact.lead_id, auth.uid(), 'staff', 'contact_archived',
    'Merchant contact archived', v_contact.full_name,
    jsonb_build_object('contact_id', v_contact.id), false
  );

  return to_jsonb(v_contact);
end;
$$;

create or replace function public.save_offerpsp_entity_document(
  p_entity_type text,
  p_entity_id uuid,
  p_document_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_document private.offerpsp_entity_documents;
  v_title text;
  v_url text;
  v_category text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_entity_type not in ('merchant', 'provider') then
    raise exception 'Unsupported OfferPSP entity type';
  end if;
  if p_entity_type = 'merchant' and not exists (select 1 from public.offerpsp_leads where lead_id = p_entity_id) then
    raise exception 'OfferPSP merchant not found';
  end if;
  if p_entity_type = 'provider' and not exists (select 1 from private.offerpsp_providers where id = p_entity_id) then
    raise exception 'PSP provider not found';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Document payload must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all (array[
      'category', 'title', 'file_name', 'document_url', 'storage_path',
      'mime_type', 'size_bytes', 'status', 'expires_at', 'notes'
    ])
  ) then
    raise exception 'Document payload contains unsupported fields';
  end if;

  v_title := nullif(trim(p_payload ->> 'title'), '');
  v_url := nullif(trim(p_payload ->> 'document_url'), '');
  v_category := coalesce(nullif(trim(p_payload ->> 'category'), ''), 'other');
  if v_title is null then raise exception 'Document title is required'; end if;
  if v_url is null and nullif(trim(p_payload ->> 'storage_path'), '') is null then
    raise exception 'Document URL or storage path is required';
  end if;

  if p_document_id is null then
    insert into private.offerpsp_entity_documents(
      entity_type, merchant_lead_id, provider_id, category, title, file_name,
      document_url, storage_path, mime_type, size_bytes, status, expires_at,
      notes, created_by, updated_by
    ) values (
      p_entity_type,
      case when p_entity_type = 'merchant' then p_entity_id end,
      case when p_entity_type = 'provider' then p_entity_id end,
      v_category, v_title,
      nullif(trim(p_payload ->> 'file_name'), ''), v_url,
      nullif(trim(p_payload ->> 'storage_path'), ''),
      nullif(trim(p_payload ->> 'mime_type'), ''),
      nullif(trim(p_payload ->> 'size_bytes'), '')::bigint,
      coalesce(nullif(trim(p_payload ->> 'status'), ''), 'active'),
      nullif(trim(p_payload ->> 'expires_at'), '')::date,
      nullif(trim(p_payload ->> 'notes'), ''),
      auth.uid(), auth.uid()
    ) returning * into v_document;
  else
    update private.offerpsp_entity_documents
    set category = v_category,
        title = v_title,
        file_name = nullif(trim(p_payload ->> 'file_name'), ''),
        document_url = v_url,
        storage_path = nullif(trim(p_payload ->> 'storage_path'), ''),
        mime_type = nullif(trim(p_payload ->> 'mime_type'), ''),
        size_bytes = nullif(trim(p_payload ->> 'size_bytes'), '')::bigint,
        status = coalesce(nullif(trim(p_payload ->> 'status'), ''), status),
        expires_at = nullif(trim(p_payload ->> 'expires_at'), '')::date,
        notes = nullif(trim(p_payload ->> 'notes'), ''),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_document_id
      and entity_type = p_entity_type
      and ((p_entity_type = 'merchant' and merchant_lead_id = p_entity_id)
        or (p_entity_type = 'provider' and provider_id = p_entity_id))
    returning * into v_document;
    if not found then raise exception 'OfferPSP document not found'; end if;
  end if;

  if p_entity_type = 'merchant' then
    insert into public.offerpsp_lead_activities(
      lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
    ) values (
      p_entity_id, auth.uid(), 'staff',
      case when p_document_id is null then 'document_added' else 'document_updated' end,
      case when p_document_id is null then 'Document added' else 'Document updated' end,
      v_document.title,
      jsonb_build_object('document_id', v_document.id, 'category', v_document.category), false
    );
  else
    insert into private.offerpsp_supply_activities(
      provider_id, actor_user_id, action_type, summary, after_state
    ) values (
      p_entity_id, auth.uid(),
      case when p_document_id is null then 'document_added' else 'document_updated' end,
      v_document.title,
      jsonb_build_object('document_id', v_document.id, 'category', v_document.category)
    );
  end if;

  return to_jsonb(v_document);
end;
$$;

create or replace function public.archive_offerpsp_entity_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_document private.offerpsp_entity_documents;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  update private.offerpsp_entity_documents
  set status = 'archived', updated_by = auth.uid(), updated_at = now()
  where id = p_document_id
  returning * into v_document;
  if not found then raise exception 'OfferPSP document not found'; end if;

  if v_document.entity_type = 'merchant' then
    insert into public.offerpsp_lead_activities(
      lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
    ) values (
      v_document.merchant_lead_id, auth.uid(), 'staff', 'document_archived',
      'Document archived', v_document.title,
      jsonb_build_object('document_id', v_document.id), false
    );
  else
    insert into private.offerpsp_supply_activities(
      provider_id, actor_user_id, action_type, summary, after_state
    ) values (
      v_document.provider_id, auth.uid(), 'document_archived', v_document.title,
      jsonb_build_object('document_id', v_document.id)
    );
  end if;

  return to_jsonb(v_document);
end;
$$;

create or replace function public.save_offerpsp_lead_task(
  p_lead_id uuid,
  p_task_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_task public.offerpsp_tasks;
  v_title text;
  v_status text;
  v_priority text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from public.offerpsp_leads where lead_id = p_lead_id) then
    raise exception 'OfferPSP merchant not found';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Task payload must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all (array['title', 'details', 'status', 'priority', 'due_at'])
  ) then
    raise exception 'Task payload contains unsupported fields';
  end if;

  v_title := nullif(trim(p_payload ->> 'title'), '');
  v_status := coalesce(nullif(trim(p_payload ->> 'status'), ''), 'pending');
  v_priority := coalesce(nullif(trim(p_payload ->> 'priority'), ''), 'normal');
  if v_title is null then raise exception 'Task title is required'; end if;
  if v_status not in ('pending', 'in_progress', 'done', 'cancelled', 'failed') then
    raise exception 'Unsupported task status';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Unsupported task priority';
  end if;

  if p_task_id is null then
    insert into public.offerpsp_tasks(
      lead_id, assigned_to, created_by, source, title, details,
      status, priority, due_at, completed_at
    ) values (
      p_lead_id, auth.uid(), auth.uid(), 'staff', v_title,
      nullif(trim(p_payload ->> 'details'), ''), v_status, v_priority,
      nullif(trim(p_payload ->> 'due_at'), '')::timestamptz,
      case when v_status = 'done' then now() end
    ) returning * into v_task;
  else
    update public.offerpsp_tasks
    set title = v_title,
        details = nullif(trim(p_payload ->> 'details'), ''),
        status = v_status,
        priority = v_priority,
        due_at = nullif(trim(p_payload ->> 'due_at'), '')::timestamptz,
        completed_at = case when v_status = 'done' then coalesce(completed_at, now()) else null end,
        updated_at = now()
    where id = p_task_id and lead_id = p_lead_id
    returning * into v_task;
    if not found then raise exception 'OfferPSP task not found'; end if;
  end if;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    p_lead_id, auth.uid(), 'staff',
    case when p_task_id is null then 'task_added' else 'task_updated' end,
    case when p_task_id is null then 'Task added' else 'Task updated' end,
    v_task.title,
    jsonb_build_object('task_id', v_task.id, 'status', v_task.status, 'priority', v_task.priority),
    false
  );

  return to_jsonb(v_task);
end;
$$;

revoke all on private.offerpsp_merchant_contacts from public, anon, authenticated;
revoke all on private.offerpsp_entity_documents from public, anon, authenticated;
grant all on private.offerpsp_merchant_contacts to service_role;
grant all on private.offerpsp_entity_documents to service_role;

revoke all on function public.get_offerpsp_entity_workspace(text, uuid) from public, anon;
revoke all on function public.save_offerpsp_merchant_contact(uuid, uuid, jsonb) from public, anon;
revoke all on function public.archive_offerpsp_merchant_contact(uuid) from public, anon;
revoke all on function public.save_offerpsp_entity_document(text, uuid, uuid, jsonb) from public, anon;
revoke all on function public.archive_offerpsp_entity_document(uuid) from public, anon;
revoke all on function public.save_offerpsp_lead_task(uuid, uuid, jsonb) from public, anon;

grant execute on function public.get_offerpsp_entity_workspace(text, uuid) to authenticated;
grant execute on function public.save_offerpsp_merchant_contact(uuid, uuid, jsonb) to authenticated;
grant execute on function public.archive_offerpsp_merchant_contact(uuid) to authenticated;
grant execute on function public.save_offerpsp_entity_document(text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.archive_offerpsp_entity_document(uuid) to authenticated;
grant execute on function public.save_offerpsp_lead_task(uuid, uuid, jsonb) to authenticated;

comment on table private.offerpsp_merchant_contacts is
  'Staff-only contacts linked to one OfferPSP merchant request.';
comment on table private.offerpsp_entity_documents is
  'Staff-only document and external-link registry for merchants and PSP providers.';
comment on function public.get_offerpsp_entity_workspace(text, uuid) is
  'Staff-only 360-degree projection with contacts, documents, activities, tasks and conversations.';
