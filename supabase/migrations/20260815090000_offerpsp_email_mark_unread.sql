create or replace function public.set_offerpsp_email_thread_state(
  p_thread_id uuid,
  p_status text,
  p_mark_read boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_thread public.offerpsp_email_threads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_status not in ('open', 'awaiting_reply', 'follow_up', 'closed', 'archived') then raise exception 'Unsupported email thread status'; end if;

  update public.offerpsp_email_threads
  set status = p_status,
      unread_count = case when p_mark_read is true then 0 else unread_count end,
      updated_at = now()
  where id = p_thread_id
  returning * into v_thread;

  if not found then raise exception 'Email thread not found'; end if;

  if p_mark_read is true then
    update public.offerpsp_email_messages
    set is_read = true
    where thread_id = p_thread_id and direction = 'inbound';
  elsif p_mark_read is false then
    update public.offerpsp_email_messages
    set is_read = false
    where id = (
      select id
      from public.offerpsp_email_messages
      where thread_id = p_thread_id and direction = 'inbound'
      order by coalesce(received_at, created_at) desc, created_at desc
      limit 1
    );

    update public.offerpsp_email_threads
    set unread_count = (
          select count(*)::integer
          from public.offerpsp_email_messages
          where thread_id = p_thread_id
            and direction = 'inbound'
            and is_read is false
        ),
        updated_at = now()
    where id = p_thread_id
    returning * into v_thread;
  end if;

  return to_jsonb(v_thread);
end;
$$;

revoke all on function public.set_offerpsp_email_thread_state(uuid, text, boolean) from public, anon;
grant execute on function public.set_offerpsp_email_thread_state(uuid, text, boolean) to authenticated;

comment on function public.set_offerpsp_email_thread_state(uuid, text, boolean) is
  'Staff-only email thread state. true marks all inbound messages read; false returns the latest inbound message to unread; null preserves read state.';
