alter table public.chat_logs
  add column if not exists profile_key text,
  add column if not exists channel text,
  add column if not exists session_id text;

update public.chat_logs
set profile_key = 'BIXOFFPSP'
where profile_key is null;

alter table public.chat_logs
  alter column profile_key set default 'BIXOFFPSP',
  alter column profile_key set not null;

create index if not exists chat_logs_profile_created_idx
  on public.chat_logs(profile_key, created_at desc);

create table if not exists public.aibot_memories (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null default 'BIXOFFPSP',
  scope text not null default 'offerpsp',
  memory_key text not null,
  memory_type text not null,
  content text not null,
  importance smallint not null default 50,
  source_channel text,
  source_chat_id text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint aibot_memories_type_check check (
    memory_type in ('fact', 'decision', 'preference', 'action', 'commitment', 'correction')
  ),
  constraint aibot_memories_importance_check check (importance between 0 and 100),
  constraint aibot_memories_status_check check (status in ('active', 'superseded', 'archived')),
  constraint aibot_memories_key_check check (memory_key ~ '^[a-z0-9][a-z0-9_.:-]{2,119}$'),
  constraint aibot_memories_content_check check (char_length(trim(content)) between 1 and 4000)
);

create unique index if not exists aibot_memories_active_key_idx
  on public.aibot_memories(profile_key, scope, memory_key)
  where status = 'active';

create index if not exists aibot_memories_recall_idx
  on public.aibot_memories(profile_key, scope, status, importance desc, updated_at desc);

create index if not exists aibot_memories_search_idx
  on public.aibot_memories using gin (
    to_tsvector('simple'::regconfig, coalesce(memory_key, '') || ' ' || coalesce(content, ''))
  );

alter table public.aibot_memories enable row level security;

revoke all on table public.aibot_memories from public, anon, authenticated;
grant select, insert, update, delete on table public.aibot_memories to service_role;

create or replace function public.aibot_n8n_save_chat_history_v2(
  p_chat_id text,
  p_profile_key text default 'BIXOFFPSP',
  p_channel text default null,
  p_session_id text default null,
  p_user_message text default null,
  p_assistant_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_count integer := 0;
  v_profile_key text := coalesce(nullif(trim(p_profile_key), ''), 'BIXOFFPSP');
begin
  if nullif(trim(p_chat_id), '') is null then
    return jsonb_build_object('status', 'skipped', 'count', 0);
  end if;

  if nullif(trim(p_user_message), '') is not null then
    insert into public.chat_logs(
      chat_id, profile_key, channel, session_id, role, message
    ) values (
      p_chat_id, v_profile_key, nullif(trim(p_channel), ''),
      nullif(trim(p_session_id), ''), 'user', left(p_user_message, 4000)
    );
    v_count := v_count + 1;
  end if;

  if nullif(trim(p_assistant_message), '') is not null then
    insert into public.chat_logs(
      chat_id, profile_key, channel, session_id, role, message
    ) values (
      p_chat_id, v_profile_key, nullif(trim(p_channel), ''),
      nullif(trim(p_session_id), ''), 'assistant', left(p_assistant_message, 4000)
    );
    v_count := v_count + 1;
  end if;

  return jsonb_build_object(
    'status', case when v_count > 0 then 'saved' else 'skipped' end,
    'count', v_count,
    'chat_id', p_chat_id,
    'profile_key', v_profile_key
  );
end;
$$;

create or replace function public.aibot_n8n_get_agent_context_v1(
  p_chat_id text,
  p_profile_key text default 'BIXOFFPSP',
  p_query text default null,
  p_history_limit integer default 30,
  p_memory_limit integer default 12
)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  with settings as (
    select
      coalesce(nullif(trim(p_profile_key), ''), 'BIXOFFPSP') as profile_key,
      greatest(1, least(coalesce(p_history_limit, 30), 100)) as history_limit,
      greatest(1, least(coalesce(p_memory_limit, 12), 30)) as memory_limit,
      nullif(trim(p_query), '') as query
  ),
  local_history as (
    select logs.chat_id, logs.channel, logs.session_id, logs.role, logs.message, logs.created_at
    from public.chat_logs logs, settings s
    where logs.profile_key = s.profile_key
      and logs.chat_id = p_chat_id
    order by logs.created_at desc, logs.id desc
    limit (select history_limit from settings)
  ),
  shared_history as (
    select logs.chat_id, logs.channel, logs.session_id, logs.role, logs.message, logs.created_at
    from public.chat_logs logs, settings s
    where logs.profile_key = s.profile_key
      and logs.chat_id <> coalesce(p_chat_id, '')
    order by logs.created_at desc, logs.id desc
    limit greatest(4, (select history_limit / 2 from settings))
  ),
  memories as (
    select
      memory_key, memory_type, scope, content, importance, metadata, updated_at,
      case
        when (select query from settings) is null then 0::real
        else ts_rank_cd(
          to_tsvector('simple'::regconfig, memory_key || ' ' || content),
          plainto_tsquery('simple'::regconfig, (select query from settings))
        )
      end as search_rank
    from public.aibot_memories, settings s
    where aibot_memories.profile_key = s.profile_key
      and status = 'active'
    order by
      case when (select query from settings) is not null
        and (
          to_tsvector('simple'::regconfig, memory_key || ' ' || content)
            @@ plainto_tsquery('simple'::regconfig, (select query from settings))
          or content ilike '%' || (select query from settings) || '%'
        ) then 0 else 1 end,
      importance desc,
      updated_at desc
    limit (select memory_limit from settings)
  )
  select jsonb_build_object(
    'profile_key', (select profile_key from settings),
    'local_history', coalesce((
      select jsonb_agg(to_jsonb(local_history) order by created_at)
      from local_history
    ), '[]'::jsonb),
    'shared_history', coalesce((
      select jsonb_agg(to_jsonb(shared_history) order by created_at)
      from shared_history
    ), '[]'::jsonb),
    'memories', coalesce((
      select jsonb_agg(to_jsonb(memories) order by search_rank desc, importance desc, updated_at desc)
      from memories
    ), '[]'::jsonb)
  );
$$;

create or replace function public.aibot_n8n_memory_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_action text := lower(coalesce(nullif(trim(p_input->>'action'), ''), 'recall'));
  v_profile_key text := coalesce(nullif(trim(p_input->>'profile_key'), ''), 'BIXOFFPSP');
  v_scope text := coalesce(nullif(trim(p_input->>'scope'), ''), 'offerpsp');
  v_memory_key text := lower(nullif(trim(p_input->>'memory_key'), ''));
  v_memory_type text := lower(coalesce(nullif(trim(p_input->>'memory_type'), ''), 'fact'));
  v_content text := nullif(trim(p_input->>'content'), '');
  v_query text := nullif(trim(p_input->>'query'), '');
  v_limit integer := greatest(1, least(coalesce((p_input->>'limit')::integer, 10), 20));
  v_importance integer := greatest(0, least(coalesce((p_input->>'importance')::integer, 50), 100));
  v_row public.aibot_memories;
  v_items jsonb;
begin
  if v_action = 'remember' then
    if v_memory_key is null or v_memory_key !~ '^[a-z0-9][a-z0-9_.:-]{2,119}$' then
      raise exception using errcode = '22023', message = 'memory_key must be a stable lowercase identifier';
    end if;
    if v_memory_type not in ('fact', 'decision', 'preference', 'action', 'commitment', 'correction') then
      raise exception using errcode = '22023', message = 'Unsupported memory_type';
    end if;
    if v_content is null then
      raise exception using errcode = '22023', message = 'content is required';
    end if;

    insert into public.aibot_memories(
      profile_key, scope, memory_key, memory_type, content, importance,
      source_channel, source_chat_id, metadata
    ) values (
      v_profile_key, v_scope, v_memory_key, v_memory_type, left(v_content, 4000), v_importance,
      nullif(trim(p_input->>'source_channel'), ''),
      nullif(trim(p_input->>'source_chat_id'), ''),
      coalesce(p_input->'metadata', '{}'::jsonb)
    )
    on conflict (profile_key, scope, memory_key) where status = 'active'
    do update set
      memory_type = excluded.memory_type,
      content = excluded.content,
      importance = excluded.importance,
      source_channel = excluded.source_channel,
      source_chat_id = excluded.source_chat_id,
      metadata = excluded.metadata,
      updated_at = now()
    returning * into v_row;

    return jsonb_build_object('status', 'remembered', 'memory', to_jsonb(v_row));
  end if;

  if v_action = 'forget' then
    if v_memory_key is null then
      raise exception using errcode = '22023', message = 'memory_key is required';
    end if;
    update public.aibot_memories
    set status = 'archived', updated_at = now()
    where profile_key = v_profile_key
      and scope = v_scope
      and memory_key = v_memory_key
      and status = 'active'
    returning * into v_row;
    return jsonb_build_object(
      'status', case when found then 'forgotten' else 'not_found' end,
      'memory_key', v_memory_key
    );
  end if;

  if v_action not in ('recall', 'recent') then
    raise exception using errcode = '22023', message = 'Unsupported memory action';
  end if;

  select coalesce(jsonb_agg(to_jsonb(found_rows) order by found_rows.search_rank desc,
    found_rows.importance desc, found_rows.updated_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      id, memory_key, memory_type, scope, content, importance, metadata, updated_at,
      case
        when v_query is null then 0::real
        else ts_rank_cd(
          to_tsvector('simple'::regconfig, memory_key || ' ' || content),
          plainto_tsquery('simple'::regconfig, v_query)
        )
      end as search_rank
    from public.aibot_memories
    where profile_key = v_profile_key
      and status = 'active'
      and (v_scope = '*' or scope = v_scope)
      and (
        v_action = 'recent'
        or v_query is null
        or to_tsvector('simple'::regconfig, memory_key || ' ' || content)
          @@ plainto_tsquery('simple'::regconfig, v_query)
        or content ilike '%' || v_query || '%'
        or memory_key ilike '%' || v_query || '%'
      )
    order by search_rank desc, importance desc, updated_at desc
    limit v_limit
  ) found_rows;

  return jsonb_build_object(
    'status', 'ok',
    'profile_key', v_profile_key,
    'action', v_action,
    'count', jsonb_array_length(v_items),
    'items', v_items
  );
end;
$$;

revoke all on function public.aibot_n8n_save_chat_history_v2(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.aibot_n8n_get_agent_context_v1(text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.aibot_n8n_memory_v1(jsonb)
  from public, anon, authenticated;

grant execute on function public.aibot_n8n_save_chat_history_v2(text, text, text, text, text, text)
  to service_role;
grant execute on function public.aibot_n8n_get_agent_context_v1(text, text, text, integer, integer)
  to service_role;
grant execute on function public.aibot_n8n_memory_v1(jsonb)
  to service_role;
