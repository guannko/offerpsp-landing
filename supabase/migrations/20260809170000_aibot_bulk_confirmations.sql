-- Two-phase bulk mutations for the Telegram Operating Desk.
-- A model may prepare a mutation, but only a later user message from the same
-- Telegram chat can execute the immutable snapshot identified by a one-time token.

create table if not exists private.aibot_bulk_confirmations (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null check (length(chat_id) between 1 and 100),
  action text not null check (action in ('update_status', 'add_note', 'create_task', 'create_email_draft')),
  entity_type text not null check (entity_type in ('casino', 'psp')),
  target_ids integer[] not null check (cardinality(target_ids) between 2 and 50),
  command jsonb not null check (jsonb_typeof(command) = 'object'),
  preview jsonb not null default '[]'::jsonb check (jsonb_typeof(preview) = 'array'),
  status text not null default 'pending' check (status in ('pending', 'executed', 'cancelled', 'expired')),
  result jsonb,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists idx_aibot_bulk_confirmations_pending
  on private.aibot_bulk_confirmations (chat_id, created_at desc)
  where status = 'pending';

revoke all on table private.aibot_bulk_confirmations from public, anon, authenticated, service_role;

create or replace function public.aibot_n8n_operating_desk_v3(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text := lower(trim(coalesce(p_command ->> 'action', '')));
  v_entity text := lower(trim(coalesce(p_command ->> 'entity_type', '')));
  v_chat_id text := trim(coalesce(p_command ->> 'chat_id', ''));
  v_ids integer[] := array[]::integer[];
  v_found_count integer := 0;
  v_preview jsonb := '[]'::jsonb;
  v_normalized jsonb;
  v_confirmation private.aibot_bulk_confirmations%rowtype;
  v_token uuid;
  v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Command must be an object';
  end if;

  if v_action in ('search_companies', 'search_offers') then
    return public.aibot_n8n_operating_desk_v2(p_command);
  end if;

  if v_action = 'confirm_bulk' then
    if v_chat_id = '' then raise exception 'chat_id is required for confirmation'; end if;
    begin
      v_token := (p_command ->> 'confirmation_token')::uuid;
    exception when invalid_text_representation then
      raise exception 'A valid confirmation_token is required';
    end;
    if v_token is null then raise exception 'confirmation_token is required'; end if;

    select * into v_confirmation
    from private.aibot_bulk_confirmations
    where id = v_token
    for update;

    if not found or v_confirmation.chat_id <> v_chat_id then
      raise exception 'Confirmation was not found for this Telegram chat';
    end if;
    if v_confirmation.status = 'executed' then
      return jsonb_build_object(
        'action', 'confirm_bulk',
        'confirmation_token', v_token,
        'status', 'already_executed',
        'result', v_confirmation.result
      );
    end if;
    if v_confirmation.status <> 'pending' then
      raise exception 'Confirmation is no longer pending (%).', v_confirmation.status;
    end if;
    if v_confirmation.expires_at <= now() then
      update private.aibot_bulk_confirmations
      set status = 'expired'
      where id = v_token;
      return jsonb_build_object(
        'action', 'confirm_bulk',
        'confirmation_token', v_token,
        'status', 'expired',
        'message', 'Prepare the bulk operation again.'
      );
    end if;

    v_result := public.aibot_n8n_operating_desk(
      v_confirmation.command || jsonb_build_object('confirm', true)
    );

    update private.aibot_bulk_confirmations
    set status = 'executed', result = v_result, confirmed_at = now()
    where id = v_token;

    return jsonb_build_object(
      'action', 'confirm_bulk',
      'confirmation_token', v_token,
      'status', 'executed',
      'processed', coalesce((v_result ->> 'processed')::integer, 0),
      'result', v_result
    );
  end if;

  if v_action = 'cancel_bulk' then
    if v_chat_id = '' then raise exception 'chat_id is required for cancellation'; end if;
    begin
      v_token := (p_command ->> 'confirmation_token')::uuid;
    exception when invalid_text_representation then
      raise exception 'A valid confirmation_token is required';
    end;
    if v_token is null then raise exception 'confirmation_token is required'; end if;

    update private.aibot_bulk_confirmations
    set status = 'cancelled', cancelled_at = now()
    where id = v_token and chat_id = v_chat_id and status = 'pending'
    returning * into v_confirmation;

    if not found then
      raise exception 'Pending confirmation was not found for this Telegram chat';
    end if;
    return jsonb_build_object(
      'action', 'cancel_bulk',
      'confirmation_token', v_token,
      'status', 'cancelled'
    );
  end if;

  if p_command ? 'ids' then
    if jsonb_typeof(p_command -> 'ids') <> 'array' then raise exception 'ids must be an array'; end if;
    begin
      select coalesce(array_agg(distinct value::integer order by value::integer), array[]::integer[])
      into v_ids
      from jsonb_array_elements_text(p_command -> 'ids');
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'ids must contain valid integers';
    end;
  elsif p_command ? 'id' then
    begin
      v_ids := array[(p_command ->> 'id')::integer];
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'id must be a valid integer';
    end;
  end if;

  if cardinality(v_ids) <= 1 then
    return public.aibot_n8n_operating_desk(p_command - 'confirm' - 'confirmation_token');
  end if;

  if cardinality(v_ids) > 50 then raise exception 'Bulk operations are limited to 50 records'; end if;
  if v_action not in ('update_status', 'add_note', 'create_task', 'create_email_draft') then
    raise exception 'Unsupported bulk action';
  end if;
  if v_entity not in ('casino', 'psp') then raise exception 'entity_type must be casino or psp'; end if;
  if v_chat_id = '' then raise exception 'chat_id is required for bulk operations'; end if;

  if v_entity = 'psp' then
    select count(*)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'contact_status', p.contact_status,
        'provider_status', p.provider_status,
        'record_state', p.record_state
      ) order by p.id), '[]'::jsonb)
    into v_found_count, v_preview
    from public.psp_providers p
    where p.id = any(v_ids);
  else
    select count(*)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'contact_status', c.contact_status,
        'record_state', c.record_state
      ) order by c.id), '[]'::jsonb)
    into v_found_count, v_preview
    from public.casino_leads c
    where c.id = any(v_ids);
  end if;

  if v_found_count <> cardinality(v_ids) then
    raise exception 'One or more target records do not exist';
  end if;

  v_normalized := (p_command - 'confirm' - 'confirmation_token' - 'id')
    || jsonb_build_object('ids', to_jsonb(v_ids), 'chat_id', v_chat_id);

  select * into v_confirmation
  from private.aibot_bulk_confirmations
  where chat_id = v_chat_id
    and status = 'pending'
    and expires_at > now()
    and command = v_normalized
  order by created_at desc
  limit 1;

  if not found then
    insert into private.aibot_bulk_confirmations(
      chat_id, action, entity_type, target_ids, command, preview
    ) values (
      v_chat_id, v_action, v_entity, v_ids, v_normalized, v_preview
    )
    returning * into v_confirmation;
  end if;

  return jsonb_build_object(
    'confirmation_required', true,
    'confirmation_token', v_confirmation.id,
    'status', v_confirmation.status,
    'action', v_action,
    'entity_type', v_entity,
    'count', cardinality(v_ids),
    'items', v_preview,
    'requested_changes', v_normalized - 'ids' - 'chat_id' - 'action' - 'entity_type',
    'expires_at', v_confirmation.expires_at,
    'instruction', 'Ask Boris to confirm or cancel this exact operation. Do not execute it yet.'
  );
end;
$$;

-- Only the two-phase endpoint is exposed to the n8n service credential.
revoke execute on function public.aibot_n8n_operating_desk(jsonb) from service_role;
revoke execute on function public.aibot_n8n_operating_desk_v2(jsonb) from service_role;
revoke all on function public.aibot_n8n_operating_desk_v3(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_operating_desk_v3(jsonb) to service_role;

comment on function public.aibot_n8n_operating_desk_v3(jsonb) is
  'Paginated Operating Desk with chat-bound, expiring, immutable two-phase confirmation for bulk mutations.';
