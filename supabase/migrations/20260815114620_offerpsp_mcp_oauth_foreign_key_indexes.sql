-- Cover every OAuth foreign key used for expiry cleanup, revocation and user deletion.

create index if not exists offerpsp_mcp_oauth_requests_client_idx
  on public.offerpsp_mcp_oauth_requests (client_id, expires_at);
create index if not exists offerpsp_mcp_oauth_requests_actor_idx
  on public.offerpsp_mcp_oauth_requests (actor_user_id)
  where actor_user_id is not null;

create index if not exists offerpsp_mcp_oauth_codes_client_idx
  on public.offerpsp_mcp_oauth_codes (client_id, expires_at);
create index if not exists offerpsp_mcp_oauth_codes_actor_idx
  on public.offerpsp_mcp_oauth_codes (actor_user_id);

create index if not exists offerpsp_mcp_oauth_refresh_client_idx
  on public.offerpsp_mcp_oauth_refresh_tokens (client_id, expires_at);
create index if not exists offerpsp_mcp_oauth_refresh_actor_idx
  on public.offerpsp_mcp_oauth_refresh_tokens (actor_user_id, expires_at desc);

create index if not exists offerpsp_mcp_oauth_access_client_idx
  on public.offerpsp_mcp_oauth_access_tokens (client_id, expires_at);
