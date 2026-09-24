create table if not exists private.aibot_execution_journal (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null default 'BIXOFFPSP',
  action_type text not null,
  description text not null,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','failed','cancelled')),
  entity_type text,
  entity_id text,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  result_summary text,
  error_message text,
  source_channel text,
  source_session_id text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists aibot_execution_journal_idempotency_idx
  on private.aibot_execution_journal(profile_key, idempotency_key)
  where idempotency_key is not null;
create index if not exists aibot_execution_journal_due_idx
  on private.aibot_execution_journal(profile_key, status, scheduled_for)
  where status in ('planned','in_progress');
create index if not exists aibot_execution_journal_entity_idx
  on private.aibot_execution_journal(entity_type, entity_id, created_at desc);

revoke all on table private.aibot_execution_journal from public, anon, authenticated;
grant select, insert, update on table private.aibot_execution_journal to service_role;

create or replace function public.aibot_n8n_execution_journal_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_action text := lower(trim(coalesce(p_command ->> 'action', 'list')));
  v_id uuid;
  v_row private.aibot_execution_journal%rowtype;
  v_items jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then raise exception 'Command must be an object'; end if;

  if v_action = 'plan' then
    if nullif(trim(p_command ->> 'action_type'), '') is null or nullif(trim(p_command ->> 'description'), '') is null then
      raise exception 'action_type and description are required';
    end if;
    insert into private.aibot_execution_journal(
      action_type, description, entity_type, entity_id, scheduled_for,
      source_channel, source_session_id, idempotency_key, metadata
    ) values (
      trim(p_command ->> 'action_type'), trim(p_command ->> 'description'),
      nullif(trim(p_command ->> 'entity_type'), ''), nullif(trim(p_command ->> 'entity_id'), ''),
      nullif(p_command ->> 'scheduled_for', '')::timestamptz,
      nullif(trim(p_command ->> 'source_channel'), ''), nullif(trim(p_command ->> 'source_session_id'), ''),
      nullif(trim(p_command ->> 'idempotency_key'), ''), coalesce(p_command -> 'metadata', '{}'::jsonb)
    )
    on conflict (profile_key, idempotency_key) where idempotency_key is not null
    do update set updated_at = now()
    returning * into v_row;
    return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
  end if;

  if v_action in ('start','complete','fail','cancel') then
    v_id := nullif(p_command ->> 'id', '')::uuid;
    if v_id is null then raise exception 'id is required'; end if;
    update private.aibot_execution_journal set
      status = case v_action when 'start' then 'in_progress' when 'complete' then 'completed' when 'fail' then 'failed' else 'cancelled' end,
      started_at = case when v_action = 'start' then coalesce(started_at, now()) else started_at end,
      completed_at = case when v_action in ('complete','fail','cancel') then now() else completed_at end,
      result_summary = case when v_action = 'complete' then nullif(trim(p_command ->> 'result_summary'), '') else result_summary end,
      error_message = case when v_action = 'fail' then nullif(trim(p_command ->> 'error_message'), '') else error_message end,
      metadata = metadata || coalesce(p_command -> 'metadata', '{}'::jsonb), updated_at = now()
    where id = v_id and profile_key = 'BIXOFFPSP'
    returning * into v_row;
    if not found then raise exception 'Journal item not found'; end if;
    return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
  end if;

  if v_action not in ('list','due') then raise exception 'Unsupported action'; end if;
  select coalesce(jsonb_agg(to_jsonb(j) order by j.scheduled_for nulls last, j.created_at desc), '[]'::jsonb)
  into v_items from (
    select * from private.aibot_execution_journal
    where profile_key = 'BIXOFFPSP'
      and (v_action <> 'due' or (status in ('planned','in_progress') and scheduled_for <= now()))
      and (nullif(trim(p_command ->> 'entity_type'), '') is null or entity_type = trim(p_command ->> 'entity_type'))
      and (nullif(trim(p_command ->> 'entity_id'), '') is null or entity_id = trim(p_command ->> 'entity_id'))
    order by scheduled_for nulls last, created_at desc
    limit greatest(1, least(coalesce((p_command ->> 'limit')::integer, 20), 100))
  ) j;
  return jsonb_build_object('ok', true, 'items', v_items, 'count', jsonb_array_length(v_items));
end;
$$;

revoke all on function public.aibot_n8n_execution_journal_v1(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_execution_journal_v1(jsonb) to service_role;

