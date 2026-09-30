-- Include the merchant's Telegram handle in verified portal notifications so
-- the owner has both the private portal reply path and the direct contact.

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
    'company', lead.company,
    'sender_email', lead.work_email,
    'sender_telegram', lead.telegram,
    'message', message.body,
    'sent_at', message.sent_at
  )
  from public.offerpsp_messages message
  join public.offerpsp_conversations conversation
    on conversation.id = message.conversation_id
   and conversation.channel = 'portal'
  join public.offerpsp_leads lead on lead.lead_id = conversation.lead_id
  where message.id = p_message_id
    and message.sender_type = 'client'
    and message.direction = 'inbound';
$$;

revoke all on function public.get_offerpsp_portal_message_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.get_offerpsp_portal_message_notification(uuid)
  to service_role;
