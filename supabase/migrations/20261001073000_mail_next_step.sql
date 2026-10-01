-- An explicit working decision is distinct from delivery direction.
-- Use the existing organizer tag contract instead of changing mail statuses.
create or replace function public.set_offerpsp_email_next_step(
  p_thread_id uuid, p_action text, p_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.offerpsp_email_threads;
  v_status text;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_action is null or p_action not in ('open','awaiting_reply','reply_not_needed','follow_up','closed') then
    raise exception 'Unsupported email next step';
  end if;
  if p_action = 'follow_up' and (p_follow_up_at is null or p_follow_up_at <= now()) then
    raise exception 'A future follow-up date is required';
  end if;
  if p_action <> 'follow_up' and p_follow_up_at is not null then
    raise exception 'A date is only supported for scheduled follow-up';
  end if;
  select * into v_thread from public.offerpsp_email_threads where id = p_thread_id for update;
  if not found then raise exception 'Email thread not found'; end if;
  if v_thread.status in ('archived','trashed') or 'system:spam' = any(coalesce(v_thread.tags,'{}')) then
    raise exception 'Restore the thread before choosing a next step';
  end if;
  v_status := case when p_action = 'reply_not_needed' then 'open' else p_action end;
  update public.offerpsp_email_threads
  set status = v_status,
      follow_up_at = case when p_action = 'follow_up' then p_follow_up_at else null end,
      tags = array_remove(coalesce(tags,'{}'), 'system:reply_not_needed') ||
        case when p_action = 'reply_not_needed' then array['system:reply_not_needed'] else '{}'::text[] end,
      last_organized_at = now(), updated_at = now()
  where id = p_thread_id returning * into v_thread;
  return to_jsonb(v_thread);
end;
$$;
revoke all on function public.set_offerpsp_email_next_step(uuid,text,timestamptz) from public, anon, service_role;
grant execute on function public.set_offerpsp_email_next_step(uuid,text,timestamptz) to authenticated;

-- New activity invalidates "no answer needed" for the previous message.
create or replace function private.offerpsp_clear_mail_next_step()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.last_message_at is distinct from old.last_message_at
      or (new.status is distinct from old.status and new.status <> 'open') then
    new.tags := array_remove(coalesce(new.tags,'{}'), 'system:reply_not_needed');
  end if;
  return new;
end;
$$;
revoke all on function private.offerpsp_clear_mail_next_step() from public, anon, authenticated, service_role;
create trigger offerpsp_clear_mail_next_step
before update on public.offerpsp_email_threads
for each row execute function private.offerpsp_clear_mail_next_step();
