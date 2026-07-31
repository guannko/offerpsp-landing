create or replace function public.claim_offerpsp_leads()
returns table (lead_id uuid, company text, claimed boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select lower(email)
  into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null then
    raise exception 'Authenticated email is unavailable';
  end if;

  return query
  update public.offerpsp_leads l
  set client_user_id = auth.uid(),
      last_activity_at = now()
  where lower(l.work_email) = v_email
    and l.status not in ('closed', 'spam')
    and (l.client_user_id is null or l.client_user_id = auth.uid())
  returning l.lead_id, l.company::text, true;
end;
$$;

revoke all on function public.claim_offerpsp_leads() from public;
revoke execute on function public.claim_offerpsp_leads() from anon;
grant execute on function public.claim_offerpsp_leads() to authenticated;
