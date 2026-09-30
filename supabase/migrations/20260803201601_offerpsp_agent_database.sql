create or replace function public.get_offerpsp_captains_bridge()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return jsonb_build_object(
    'casino_leads', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.updated_at desc nulls last)
      from (
        select id, internal_id, name, website, geo, license, sphere, email,
          contact_name, contact_title, telegram, phone, linkedin, contact_status,
          score, source, city, emails_sent, last_contacted_at, last_reply_at,
          reply_status, next_follow_up, notes, tags, created_at, updated_at
        from public.casino_leads
        order by updated_at desc nulls last, id desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'psp_providers', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.updated_at desc nulls last)
      from (
        select id, name, website, geo, cluster, specialization, methods,
          email, contact_name, phone, telegram, linkedin, contact_status,
          provider_status, risk_appetite, supported_countries,
          supported_currencies, payment_methods, supported_verticals,
          integration_types, notes, created_at, updated_at
        from public.psp_providers
        order by updated_at desc nulls last, id desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'email_drafts', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, chat_id, lead_internal_id, to_email, subject, body, status, created_at
        from public.email_drafts
        order by created_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'telegram_log', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, chat_id, role, message, created_at
        from public.chat_logs
        order by created_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'bot_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, task_type, payload, priority, scheduled_for, status, result,
          error, created_by, created_at, started_at, completed_at, ref_type, ref_id
        from public.bot_tasks
        order by created_at desc nulls last, id desc
        limit 100
      ) row_data
    ), '[]'::jsonb),
    'offerpsp_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (
        select id, lead_id, assigned_to, source, title, details, status, priority,
          due_at, completed_at, automation_ref, metadata, created_at, updated_at
        from public.offerpsp_tasks
        order by created_at desc nulls last
        limit 100
      ) row_data
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_offerpsp_captains_bridge() from public, anon;
grant execute on function public.get_offerpsp_captains_bridge() to authenticated;

comment on function public.get_offerpsp_captains_bridge() is
  'Staff-only unified read model for OfferPSP and the Telegram AIBot, including casino and PSP research databases.';
