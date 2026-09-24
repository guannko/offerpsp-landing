-- Historical attempted hardening: VERIFIED NO-OP on this hosted project because
-- pg_net objects belong to supabase_admin, not the migration role. Do NOT claim
-- these ACLs were tightened. Following migrations use short-lived JWTs instead
-- of putting the permanent signing key into the transport queue. Vault is restricted.
-- pg_net defaults grant queue access broadly. Its headers would contain the narrow event token.
-- Only the SECURITY DEFINER trigger owner and extension worker need transport access.
revoke all on schema net from public, anon, authenticated, service_role;
revoke all on all tables in schema net from public, anon, authenticated, service_role;
revoke all on all sequences in schema net from public, anon, authenticated, service_role;
revoke all on all functions in schema net from public, anon, authenticated, service_role;
