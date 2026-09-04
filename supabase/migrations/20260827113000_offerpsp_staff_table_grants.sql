-- Staff identity is readable through RLS, but membership changes must go
-- through controlled administrative paths rather than direct client DML.

revoke all on table public.offerpsp_staff_members from anon, authenticated;
grant select on table public.offerpsp_staff_members to authenticated;
grant all on table public.offerpsp_staff_members to service_role;
