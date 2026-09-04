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
    and (l.client_user_id is null or l.client_user_id = auth.uid())
  returning l.lead_id, l.company::text, true;
end;
$$;

create or replace function public.share_offerpsp_shortlist(p_shortlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_lead_id uuid;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  update public.offerpsp_shortlists
  set status = 'shared',
      shared_at = now()
  where id = p_shortlist_id
  returning lead_id into v_lead_id;

  if v_lead_id is null then
    raise exception 'Shortlist not found';
  end if;

  update public.offerpsp_matches m
  set client_visible = true
  where m.id in (
    select si.match_id
    from public.offerpsp_shortlist_items si
    where si.shortlist_id = p_shortlist_id
      and si.match_id is not null
  );

  update public.offerpsp_leads
  set status = 'shared'
  where lead_id = v_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id,
    actor_user_id,
    actor_type,
    activity_type,
    title,
    body,
    client_visible
  )
  values (
    v_lead_id,
    auth.uid(),
    'staff',
    'shortlist_shared',
    'PSP shortlist shared',
    'The reviewed shortlist is now available in the client cabinet.',
    true
  );

  return jsonb_build_object(
    'lead_id', v_lead_id,
    'shortlist_id', p_shortlist_id,
    'status', 'shared'
  );
end;
$$;

create or replace function public.ensure_offerpsp_portal_conversation(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if not (
    public.is_offerpsp_staff()
    or exists (
      select 1
      from public.offerpsp_leads l
      where l.lead_id = p_lead_id
        and l.client_user_id = auth.uid()
    )
  ) then
    raise exception 'Access denied';
  end if;

  select id
  into v_conversation_id
  from public.offerpsp_conversations
  where lead_id = p_lead_id
    and channel = 'portal'
  order by created_at
  limit 1;

  if v_conversation_id is null then
    insert into public.offerpsp_conversations (
      lead_id,
      channel,
      subject,
      client_visible
    )
    values (
      p_lead_id,
      'portal',
      'OfferPSP support',
      true
    )
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

create or replace view public.offerpsp_client_shortlist
with (security_invoker = true)
as
select
  s.id as shortlist_id,
  s.lead_id,
  s.version,
  s.title,
  s.introduction,
  s.status,
  s.shared_at,
  si.rank,
  si.client_note,
  p.id as psp_id,
  p.name as psp_name,
  p.website as psp_website,
  p.geo,
  p.specialization,
  p.methods,
  m.score,
  m.strengths,
  m.risks,
  m.explanation
from public.offerpsp_shortlists s
join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
join public.psp_providers p on p.id = si.psp_id
left join public.offerpsp_matches m on m.id = si.match_id
where s.status = 'shared';

revoke all on function public.claim_offerpsp_leads() from public;
revoke execute on function public.claim_offerpsp_leads() from anon;
grant execute on function public.claim_offerpsp_leads() to authenticated;

revoke all on function public.share_offerpsp_shortlist(uuid) from public;
revoke execute on function public.share_offerpsp_shortlist(uuid) from anon;
grant execute on function public.share_offerpsp_shortlist(uuid) to authenticated;

revoke all on function public.ensure_offerpsp_portal_conversation(uuid) from public;
revoke execute on function public.ensure_offerpsp_portal_conversation(uuid) from anon;
grant execute on function public.ensure_offerpsp_portal_conversation(uuid) to authenticated;

grant select on public.offerpsp_client_shortlist to authenticated;
