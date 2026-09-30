-- Preserve the reviewed functions verbatim except the exact lifecycle guards.
-- Abort on unexpected source drift instead of silently replacing a different implementation.
do $$ declare signature text; original text; revised text; begin
  foreach signature in array array[
    'private.offerpsp_ensure_intake_task(uuid)',
    'public.prepare_offerpsp_telegram_intake_card(uuid)',
    'public.execute_offerpsp_telegram_intake_action(uuid,text,text)'
  ] loop
    original:=pg_get_functiondef(signature::regprocedure);
    revised:=replace(replace(original,
      'v_lead.status in (''closed'',''spam'')','v_lead.status in (''closed'',''spam'',''won'',''lost'')'),
      'v_lead.status in (''spam'',''closed'')','v_lead.status in (''closed'',''spam'',''won'',''lost'')');
    if revised=original then raise exception 'Intake lifecycle definition drift: %',signature; end if;
    execute revised;
  end loop;
end; $$;

create or replace function private.offerpsp_finish_intake_task()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if new.status in ('won','lost') then
    -- Only the initial-response task, not ongoing servicing/account-management tasks.
    update public.offerpsp_tasks set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now(),
      metadata=metadata || jsonb_build_object('auto_cancelled_reason','intake_terminal_state')
      where lead_id=new.lead_id and automation_ref='intake_response_v1' and status in ('pending','in_progress');
  end if;
  return new;
end; $$;
revoke all on function private.offerpsp_finish_intake_task() from public,anon,authenticated,service_role;
create trigger offerpsp_finish_intake_task after update of status on public.offerpsp_leads
  for each row execute function private.offerpsp_finish_intake_task();
