-- OfferPSP-owned OAuth 2.1 storage for the staff MCP gateway.
--
-- These tables are deliberately exposed through no client role. The OAuth
-- server accesses them with its server-side credential, while every OfferPSP
-- business query continues to use a dedicated Supabase user session and RLS.

create table if not exists public.offerpsp_mcp_oauth_clients (
  client_id text primary key,
  client_name text not null check (char_length(client_name) between 1 and 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  token_endpoint_auth_method text not null default 'none'
    check (token_endpoint_auth_method = 'none'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.offerpsp_mcp_oauth_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.offerpsp_mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  state_ciphertext text,
  scope text not null,
  resource text not null,
  code_challenge text not null check (char_length(code_challenge) between 43 and 128),
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  status text not null default 'pending'
    check (status in ('pending', 'approving', 'approved', 'denied', 'failed')),
  actor_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  decided_at timestamptz,
  error_message text
);

create table if not exists public.offerpsp_mcp_oauth_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  request_id uuid not null unique references public.offerpsp_mcp_oauth_requests(id) on delete cascade,
  client_id text not null references public.offerpsp_mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  scope text not null,
  resource text not null,
  code_challenge text not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  session_ciphertext text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  consumed_at timestamptz
);

create table if not exists public.offerpsp_mcp_oauth_refresh_tokens (
  token_hash text primary key check (char_length(token_hash) = 64),
  family_id uuid not null,
  client_id text not null references public.offerpsp_mcp_oauth_clients(client_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  resource text not null,
  session_ciphertext text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  replaced_by_hash text
);

create table if not exists public.offerpsp_mcp_oauth_access_tokens (
  token_hash text primary key check (char_length(token_hash) = 64),
  family_id uuid not null,
  client_id text not null references public.offerpsp_mcp_oauth_clients(client_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  resource text not null,
  session_ciphertext text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  revoked_at timestamptz
);

create index if not exists offerpsp_mcp_oauth_requests_pending_idx
  on public.offerpsp_mcp_oauth_requests (expires_at)
  where status in ('pending', 'approving');
create index if not exists offerpsp_mcp_oauth_codes_active_idx
  on public.offerpsp_mcp_oauth_codes (expires_at)
  where consumed_at is null;
create index if not exists offerpsp_mcp_oauth_refresh_family_idx
  on public.offerpsp_mcp_oauth_refresh_tokens (family_id, created_at desc);
create index if not exists offerpsp_mcp_oauth_access_family_idx
  on public.offerpsp_mcp_oauth_access_tokens (family_id, expires_at desc)
  where revoked_at is null;
create index if not exists offerpsp_mcp_oauth_access_actor_idx
  on public.offerpsp_mcp_oauth_access_tokens (actor_user_id, expires_at desc)
  where revoked_at is null;

alter table public.offerpsp_mcp_oauth_clients enable row level security;
alter table public.offerpsp_mcp_oauth_requests enable row level security;
alter table public.offerpsp_mcp_oauth_codes enable row level security;
alter table public.offerpsp_mcp_oauth_refresh_tokens enable row level security;
alter table public.offerpsp_mcp_oauth_access_tokens enable row level security;

revoke all on table public.offerpsp_mcp_oauth_clients from public, anon, authenticated;
revoke all on table public.offerpsp_mcp_oauth_requests from public, anon, authenticated;
revoke all on table public.offerpsp_mcp_oauth_codes from public, anon, authenticated;
revoke all on table public.offerpsp_mcp_oauth_refresh_tokens from public, anon, authenticated;
revoke all on table public.offerpsp_mcp_oauth_access_tokens from public, anon, authenticated;

grant all on table public.offerpsp_mcp_oauth_clients to service_role;
grant all on table public.offerpsp_mcp_oauth_requests to service_role;
grant all on table public.offerpsp_mcp_oauth_codes to service_role;
grant all on table public.offerpsp_mcp_oauth_refresh_tokens to service_role;
grant all on table public.offerpsp_mcp_oauth_access_tokens to service_role;

comment on table public.offerpsp_mcp_oauth_clients is
  'Dynamic OAuth clients for OfferPSP MCP. Server-only; exact redirect URIs and public PKCE clients only.';
comment on table public.offerpsp_mcp_oauth_requests is
  'Short-lived OfferPSP MCP authorization requests. Server-only and staff-approved.';
comment on table public.offerpsp_mcp_oauth_codes is
  'Single-use hashed OAuth authorization codes with encrypted dedicated Supabase staff sessions.';
comment on table public.offerpsp_mcp_oauth_refresh_tokens is
  'Rotating hashed OAuth refresh tokens. Supabase session material is AES-GCM encrypted server-side.';
comment on table public.offerpsp_mcp_oauth_access_tokens is
  'Short-lived opaque MCP access tokens mapped to encrypted staff sessions for RLS-preserving calls.';
