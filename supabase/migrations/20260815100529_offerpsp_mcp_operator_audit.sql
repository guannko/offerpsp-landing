-- Staff-scoped audit bridge for the OfferPSP MCP Operator.
-- The MCP resource server forwards the user's Supabase access token, so the
-- caller remains an authenticated staff member and never receives service_role.

create or replace function public.record_offerpsp_mcp_action(
  p_action_type text,
  p_description text,
  p_status text default 'completed',
  p_entity_type text default null,
  p_entity_id text default null,
  p_idempotency_key text default null,
  p_result_summary text default null,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row private.aibot_execution_journal%rowtype;
  v_status text := lower(trim(coalesce(p_status, 'completed')));
begin
  if not public.is_offerpsp_staff() then
    raise exception 'Active OfferPSP staff account required';
  end if;
  if nullif(trim(p_action_type), '') is null then raise exception 'action_type is required'; end if;
  if nullif(trim(p_description), '') is null then raise exception 'description is required'; end if;
  if v_status not in ('planned','in_progress','completed','failed','cancelled') then
    raise exception 'Unsupported journal status';
  end if;
  if p_metadata is not null and jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata must be an object';
  end if;

  insert into private.aibot_execution_journal(
    profile_key, action_type, description, status, entity_type, entity_id,
    started_at, completed_at, result_summary, error_message,
    source_channel, source_session_id, idempotency_key, metadata
  ) values (
    'BIXOFFPSP', left(trim(p_action_type), 120), left(trim(p_description), 1200), v_status,
    nullif(left(trim(coalesce(p_entity_type, '')), 120), ''),
    nullif(left(trim(coalesce(p_entity_id, '')), 200), ''),
    case when v_status in ('in_progress','completed','failed') then now() else null end,
    case when v_status in ('completed','failed','cancelled') then now() else null end,
    nullif(left(trim(coalesce(p_result_summary, '')), 1200), ''),
    nullif(left(trim(coalesce(p_error_message, '')), 1200), ''),
    'codex_mcp', auth.uid()::text,
    nullif(left(trim(coalesce(p_idempotency_key, '')), 240), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('actor_user_id', auth.uid())
  )
  on conflict (profile_key, idempotency_key) where idempotency_key is not null
  do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    result_summary = coalesce(excluded.result_summary, private.aibot_execution_journal.result_summary),
    error_message = excluded.error_message,
    metadata = private.aibot_execution_journal.metadata || excluded.metadata,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'journal_id', v_row.id, 'status', v_row.status);
end;
$$;

revoke all on function public.record_offerpsp_mcp_action(text,text,text,text,text,text,text,text,jsonb)
  from public, anon;
grant execute on function public.record_offerpsp_mcp_action(text,text,text,text,text,text,text,text,jsonb)
  to authenticated;

comment on function public.record_offerpsp_mcp_action(text,text,text,text,text,text,text,text,jsonb) is
  'Staff-only audit bridge for OfferPSP MCP actions under the shared BIXOFFPSP execution journal.';
