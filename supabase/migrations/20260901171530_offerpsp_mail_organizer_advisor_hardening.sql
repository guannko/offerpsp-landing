-- Make the intentional staff-only boundary explicit to the database advisor.
-- Direct access is still revoked; staff reads templates through the protected
-- mail-center RPC.

create index if not exists offerpsp_email_templates_created_by_idx
  on public.offerpsp_email_templates (created_by)
  where created_by is not null;

drop policy if exists offerpsp_email_templates_deny_direct_access
  on public.offerpsp_email_templates;
create policy offerpsp_email_templates_deny_direct_access
  on public.offerpsp_email_templates
  for all
  to public
  using (false)
  with check (false);
