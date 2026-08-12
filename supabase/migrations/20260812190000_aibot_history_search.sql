create or replace function public.aibot_n8n_search_chat_history_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_key text := coalesce(nullif(trim(p_input->>'profile_key'), ''), 'BIXOFFPSP');
  v_query text := nullif(trim(p_input->>'query'), '');
  v_limit integer := greatest(1, least(coalesce((p_input->>'limit')::integer, 10), 20));
  v_items jsonb;
begin
  if v_query is null or char_length(v_query) < 2 then
    raise exception using errcode = '22023', message = 'query must contain at least 2 characters';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(found_rows) order by found_rows.created_at desc, found_rows.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      logs.id,
      logs.channel,
      logs.chat_id,
      logs.session_id,
      logs.role,
      logs.message,
      logs.created_at
    from public.chat_logs logs
    where logs.profile_key = v_profile_key
      and (
        to_tsvector('simple'::regconfig, coalesce(logs.message, ''))
          @@ plainto_tsquery('simple'::regconfig, v_query)
        or logs.message ilike '%' || v_query || '%'
      )
    order by logs.created_at desc, logs.id desc
    limit v_limit
  ) found_rows;

  return jsonb_build_object(
    'status', 'ok',
    'profile_key', v_profile_key,
    'query', v_query,
    'count', jsonb_array_length(v_items),
    'items', v_items
  );
end;
$$;

revoke all on function public.aibot_n8n_search_chat_history_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.aibot_n8n_search_chat_history_v1(jsonb)
  to service_role;
