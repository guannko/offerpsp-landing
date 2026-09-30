-- Delta audit after the 2026-08-27 full SECURITY DEFINER review found one
-- trigger function that still had PostgreSQL's default PUBLIC execute grant.
-- Trigger invocation does not require API roles to execute the function directly.

revoke all on function private.offerpsp_sync_email_draft()
  from public, anon, authenticated, service_role;

comment on function private.offerpsp_sync_email_draft() is
  'Private email-draft synchronization trigger. Direct execution is denied to API roles.';
