drop policy if exists offerpsp_staff_read on public.offerpsp_staff_members;
create policy offerpsp_staff_read
on public.offerpsp_staff_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_offerpsp_staff());

drop policy if exists offerpsp_staff_select_leads on public.offerpsp_leads;
create policy offerpsp_staff_select_leads
on public.offerpsp_leads for select to authenticated
using (public.is_offerpsp_staff() or client_user_id = (select auth.uid()));

drop policy if exists offerpsp_notifications_recipient_read on public.offerpsp_notifications;
create policy offerpsp_notifications_recipient_read
on public.offerpsp_notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));

drop policy if exists offerpsp_organization_members_member_read on public.offerpsp_organization_members;
create policy offerpsp_organization_members_member_read
on public.offerpsp_organization_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_offerpsp_organization_member(organization_id)
);
