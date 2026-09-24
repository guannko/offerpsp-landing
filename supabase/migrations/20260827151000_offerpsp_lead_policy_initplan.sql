-- Avoid evaluating auth.uid() for every candidate lead row.

drop policy if exists offerpsp_staff_select_leads on public.offerpsp_leads;
create policy offerpsp_staff_select_leads
on public.offerpsp_leads for select to authenticated
using (
  public.is_offerpsp_staff()
  or client_user_id = (select auth.uid())
);
