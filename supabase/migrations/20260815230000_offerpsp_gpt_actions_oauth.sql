-- Allow confidential OAuth clients for ChatGPT GPT Actions while retaining
-- public PKCE clients for MCP consumers such as Codex.

alter table public.offerpsp_mcp_oauth_clients
  drop constraint if exists offerpsp_mcp_oauth_clients_token_endpoint_auth_method_check;

alter table public.offerpsp_mcp_oauth_clients
  add constraint offerpsp_mcp_oauth_clients_token_endpoint_auth_method_check
  check (token_endpoint_auth_method in ('none', 'client_secret_post', 'client_secret_basic'));

comment on table public.offerpsp_mcp_oauth_clients is
  'OAuth clients for OfferPSP MCP and GPT Actions. Server-only; exact redirect URIs, hashed client secrets and staff-approved sessions.';
