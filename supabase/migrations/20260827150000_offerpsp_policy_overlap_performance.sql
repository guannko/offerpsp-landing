-- Keep the existing staff/client access boundaries while avoiding multiple
-- permissive policies for the same role and command. Supabase reports every
-- staff `FOR ALL` policy that overlaps a client SELECT/INSERT policy because
-- PostgreSQL must evaluate both branches for each row.

drop policy if exists offerpsp_agent_clients_agent_read on public.offerpsp_agent_clients;
drop policy if exists offerpsp_agent_clients_staff_all on public.offerpsp_agent_clients;
create policy offerpsp_agent_clients_select
on public.offerpsp_agent_clients for select to authenticated
using (
  public.is_offerpsp_staff()
  or public.is_offerpsp_organization_member(agent_organization_id)
);
create policy offerpsp_agent_clients_staff_insert
on public.offerpsp_agent_clients for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_agent_clients_staff_update
on public.offerpsp_agent_clients for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_agent_clients_staff_delete
on public.offerpsp_agent_clients for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_conversations_client_read on public.offerpsp_conversations;
drop policy if exists offerpsp_conversations_staff_all on public.offerpsp_conversations;
create policy offerpsp_conversations_select
on public.offerpsp_conversations for select to authenticated
using (
  public.is_offerpsp_staff()
  or (
    client_visible
    and (
      (lead_id is not null and public.can_access_offerpsp_client_lead(lead_id))
      or client_user_id = (select auth.uid())
    )
  )
);
create policy offerpsp_conversations_staff_insert
on public.offerpsp_conversations for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_conversations_staff_update
on public.offerpsp_conversations for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_conversations_staff_delete
on public.offerpsp_conversations for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_activities_client_read on public.offerpsp_lead_activities;
drop policy if exists offerpsp_activities_staff_all on public.offerpsp_lead_activities;
create policy offerpsp_activities_select
on public.offerpsp_lead_activities for select to authenticated
using (
  public.is_offerpsp_staff()
  or (client_visible and public.can_access_offerpsp_client_lead(lead_id))
);
create policy offerpsp_activities_staff_insert
on public.offerpsp_lead_activities for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_activities_staff_update
on public.offerpsp_lead_activities for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_activities_staff_delete
on public.offerpsp_lead_activities for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_messages_client_insert on public.offerpsp_messages;
drop policy if exists offerpsp_messages_client_read on public.offerpsp_messages;
drop policy if exists offerpsp_messages_staff_all on public.offerpsp_messages;
create policy offerpsp_messages_select
on public.offerpsp_messages for select to authenticated
using (
  public.is_offerpsp_staff()
  or exists (
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
create policy offerpsp_messages_insert
on public.offerpsp_messages for insert to authenticated
with check (
  public.is_offerpsp_staff()
  or (
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
  )
);
create policy offerpsp_messages_staff_update
on public.offerpsp_messages for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_messages_staff_delete
on public.offerpsp_messages for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_notifications_recipient_read on public.offerpsp_notifications;
drop policy if exists offerpsp_notifications_staff_all on public.offerpsp_notifications;
create policy offerpsp_notifications_select
on public.offerpsp_notifications for select to authenticated
using (
  public.is_offerpsp_staff()
  or recipient_user_id = (select auth.uid())
);
create policy offerpsp_notifications_staff_insert
on public.offerpsp_notifications for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_notifications_staff_update
on public.offerpsp_notifications for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_notifications_staff_delete
on public.offerpsp_notifications for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_organization_members_member_read on public.offerpsp_organization_members;
drop policy if exists offerpsp_organization_members_staff_all on public.offerpsp_organization_members;
create policy offerpsp_organization_members_select
on public.offerpsp_organization_members for select to authenticated
using (
  public.is_offerpsp_staff()
  or user_id = (select auth.uid())
  or public.is_offerpsp_organization_member(organization_id)
);
create policy offerpsp_organization_members_staff_insert
on public.offerpsp_organization_members for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_organization_members_staff_update
on public.offerpsp_organization_members for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_organization_members_staff_delete
on public.offerpsp_organization_members for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_organizations_member_read on public.offerpsp_organizations;
drop policy if exists offerpsp_organizations_staff_all on public.offerpsp_organizations;
create policy offerpsp_organizations_select
on public.offerpsp_organizations for select to authenticated
using (
  public.is_offerpsp_staff()
  or public.is_offerpsp_organization_member(id)
);
create policy offerpsp_organizations_staff_insert
on public.offerpsp_organizations for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_organizations_staff_update
on public.offerpsp_organizations for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_organizations_staff_delete
on public.offerpsp_organizations for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_shortlists_client_read on public.offerpsp_shortlists;
drop policy if exists offerpsp_shortlists_staff_all on public.offerpsp_shortlists;
create policy offerpsp_shortlists_select
on public.offerpsp_shortlists for select to authenticated
using (
  public.is_offerpsp_staff()
  or (status = 'shared' and public.can_access_offerpsp_client_lead(lead_id))
);
create policy offerpsp_shortlists_staff_insert
on public.offerpsp_shortlists for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_shortlists_staff_update
on public.offerpsp_shortlists for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_shortlists_staff_delete
on public.offerpsp_shortlists for delete to authenticated
using (public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_read on public.offerpsp_staff_members;
drop policy if exists offerpsp_staff_manage on public.offerpsp_staff_members;
create policy offerpsp_staff_select
on public.offerpsp_staff_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_offerpsp_staff()
);
create policy offerpsp_staff_insert
on public.offerpsp_staff_members for insert to authenticated
with check (public.is_offerpsp_staff());
create policy offerpsp_staff_update
on public.offerpsp_staff_members for update to authenticated
using (public.is_offerpsp_staff())
with check (public.is_offerpsp_staff());
create policy offerpsp_staff_delete
on public.offerpsp_staff_members for delete to authenticated
using (public.is_offerpsp_staff());
