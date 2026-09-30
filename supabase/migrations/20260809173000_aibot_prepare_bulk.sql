-- A semantically narrow AI tool endpoint. It can only prepare a bulk change;
-- execution remains available exclusively through the chat-bound v3 token.

create or replace function public.aibot_n8n_prepare_bulk(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_bulk_action text := lower(trim(coalesce(p_command ->> 'bulk_action', '')));
  v_normalized jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Command must be an object';
  end if;
  if v_bulk_action not in ('update_status', 'add_note', 'create_task', 'create_email_draft') then
    raise exception 'Unsupported bulk action';
  end if;

  v_normalized := (p_command - 'action' - 'bulk_action' - 'confirm' - 'confirmation_token')
    || jsonb_build_object('action', v_bulk_action);

  return public.aibot_n8n_operating_desk_v3(v_normalized);
end;
$$;

revoke all on function public.aibot_n8n_prepare_bulk(jsonb) from public, anon, authenticated;
grant execute on function public.aibot_n8n_prepare_bulk(jsonb) to service_role;

comment on function public.aibot_n8n_prepare_bulk(jsonb) is
  'Prepare-only endpoint for immutable bulk-operation previews; never executes a mutation.';
