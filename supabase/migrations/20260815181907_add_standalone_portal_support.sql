-- General client support that works before the first payment request exists.

alter table public.offerpsp_conversations
  add column if not exists client_user_id uuid references auth.users(id) on delete cascade;

alter table public.offerpsp_conversations
  alter column lead_id drop not null;

alter table public.offerpsp_conversations
  drop constraint if exists offerpsp_conversations_owner_check,
  add constraint offerpsp_conversations_owner_check
    check (lead_id is not null or client_user_id is not null);

create unique index if not exists offerpsp_conversations_general_support_user_idx
  on public.offerpsp_conversations(client_user_id)
  where lead_id is null and client_user_id is not null and channel = 'portal';

drop policy if exists offerpsp_conversations_client_read on public.offerpsp_conversations;
create policy offerpsp_conversations_client_read
on public.offerpsp_conversations for select to authenticated
using (
  client_visible
  and (
    (lead_id is not null and public.can_access_offerpsp_client_lead(lead_id))
    or client_user_id = (select auth.uid())
  )
);

drop policy if exists offerpsp_messages_client_read on public.offerpsp_messages;
create policy offerpsp_messages_client_read
on public.offerpsp_messages for select to authenticated
using (
  exists (
    select 1
    from public.offerpsp_conversations conversation
    where conversation.id = offerpsp_messages.conversation_id
      and conversation.client_visible
      and (
        (conversation.lead_id is not null and public.can_access_offerpsp_client_lead(conversation.lead_id))
        or conversation.client_user_id = (select auth.uid())
      )
  )
);

drop policy if exists offerpsp_messages_client_insert on public.offerpsp_messages;
create policy offerpsp_messages_client_insert
on public.offerpsp_messages for insert to authenticated
with check (
  sender_type = 'client'
  and sender_user_id = (select auth.uid())
  and direction = 'inbound'
  and exists (
    select 1
    from public.offerpsp_conversations conversation
    where conversation.id = offerpsp_messages.conversation_id
      and conversation.client_visible
      and (
        (conversation.lead_id is not null and public.can_access_offerpsp_client_lead(conversation.lead_id))
        or conversation.client_user_id = (select auth.uid())
      )
  )
);

create or replace function public.ensure_offerpsp_portal_support_conversation()
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select id into v_conversation_id
  from public.offerpsp_conversations
  where client_user_id = v_user_id
    and lead_id is null
    and channel = 'portal'
  order by created_at
  limit 1;

  if v_conversation_id is null then
    insert into public.offerpsp_conversations(
      lead_id, client_user_id, channel, subject, client_visible
    ) values (
      null, v_user_id, 'portal', 'OfferPSP general support', true
    )
    on conflict (client_user_id)
      where lead_id is null and client_user_id is not null and channel = 'portal'
    do update set updated_at = public.offerpsp_conversations.updated_at
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

revoke all on function public.ensure_offerpsp_portal_support_conversation()
  from public, anon;
grant execute on function public.ensure_offerpsp_portal_support_conversation()
  to authenticated;

create or replace function public.get_offerpsp_portal_message_notification(
  p_message_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'portal_message_id', message.id,
    'conversation_id', conversation.id,
    'lead_id', lead.lead_id,
    'company', coalesce(lead.company, 'Portal support'),
    'sender_email', coalesce(lead.work_email, portal_user.email),
    'sender_telegram', lead.telegram,
    'message', message.body,
    'sent_at', message.sent_at
  )
  from public.offerpsp_messages message
  join public.offerpsp_conversations conversation
    on conversation.id = message.conversation_id
   and conversation.channel = 'portal'
  left join public.offerpsp_leads lead on lead.lead_id = conversation.lead_id
  left join auth.users portal_user on portal_user.id = conversation.client_user_id
  where message.id = p_message_id
    and message.sender_type = 'client'
    and message.direction = 'inbound'
    and coalesce(lead.work_email, portal_user.email) is not null;
$$;

revoke all on function public.get_offerpsp_portal_message_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.get_offerpsp_portal_message_notification(uuid)
  to service_role;

comment on function public.ensure_offerpsp_portal_support_conversation() is
  'Creates or returns the authenticated client general support conversation without requiring a payment request.';
