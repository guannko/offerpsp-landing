# BIX Reserve — dependency inventory

Status: `VERIFIED` for repository coupling; `PARTIAL` for live Supabase metadata because the metadata connection timed out during inspection.

Date: 2026-08-22

## Purpose

This document records what must survive a complete Supabase outage. BIX Reserve is not a second database inside Supabase. It is an independent data plane with separate provider accounts, credentials, runtime, database, authentication, object storage and queues.

## Current production coupling

The current OfferPSP path is:

`browser / portal / Captain's Bridge -> Vercel API -> Supabase Auth + Postgres/RPC/RLS + Storage -> Edge Functions / n8n -> email, Telegram and AI services`

Repository inspection confirmed the following hard dependencies.

| Area | Current dependency | Outage impact | Reserve requirement |
|---|---|---|---|
| Merchant and staff sign-in | Supabase Auth; browser persists a Supabase session | New sessions and staff checks stop | Independent identity provider and identity mapping |
| Staff API authorization | `/auth/v1/user` plus `is_offerpsp_staff` RPC | Most staff APIs fail even if Vercel is healthy | Provider-neutral session validation in BIX Gateway |
| Core operational data | Supabase Postgres tables, views and RPCs | Portal, bridge, matching and operations stop | Independent PostgreSQL with portable schema and services |
| Authorization | RLS and functions coupled to `auth.users` | Copying tables alone does not restore access control | Application authorization model plus equivalent DB policies |
| Files | Supabase Storage and `storage.objects` policies | Attachments and source files become unavailable | Independent object store with checksummed replication |
| Server functions | Supabase Edge Functions | Invite, ingest and related paths stop | Reserve HTTP workers on an independent runtime |
| Async operations | n8n plus database-backed state | Retries may amplify an outage and create duplicate work | Durable queue, idempotency keys and circuit breakers |
| Health endpoint | Validates staff and records checks through Supabase | Health reporting itself becomes unavailable | External health service with no Supabase dependency |
| MCP / GPT actions | OAuth, action journal, memory and RPCs in Supabase | Operator becomes unavailable | Reserve auth, journal and read/write gateway |

## Critical data groups

Representative repository objects confirm that the reserve must cover more than merchant and PSP tables:

- supply: providers, contacts, routes, fees, limits, settlement terms, rate-card batches and anomalies;
- demand: merchants, leads, organizations, members and client profiles;
- operations: matching results, shortlists, offers, deals, tasks, notes and audit/action journals;
- communications: conversations, messages, mail centre records and attachments;
- AI and automation: BIXOFFPSP memory, AIBot state, bulk-operation confirmations and MCP OAuth state;
- analytics: SEO/GEO snapshots and audit runs;
- files: imported source files and email attachments;
- identity: staff and merchant membership links currently tied to Supabase identities.

## Failure domains to separate

The reserve must not reuse the following primary failure domains:

- Supabase project, organization, credentials or status page;
- Supabase Auth/JWT issuer;
- Supabase Storage;
- Vercel runtime as the only API path;
- the same cloud region as the primary data plane;
- the same DNS/provider account for both routing and application hosting;
- the same queue or n8n instance as the only retry mechanism.

## Current live evidence

- Supabase project `xcizofpejsomjiflesbx` reported `ACTIVE_HEALTHY` in `eu-west-1` with PostgreSQL 17.6.
- Listing Edge Functions succeeded and returned eight active functions, including `offerpsp-invite-member` and `offerpsp-ingest-email`.
- Two metadata queries terminated with a connection timeout during the same inspection window.

This is evidence of an operational dependency and intermittent access during inspection. It is not proof of data loss.

## Important migration limits

PostgreSQL logical replication alone is insufficient:

- it does not replicate schema/DDL, sequences or large objects automatically;
- Supabase Storage objects must be copied separately;
- external authentication requires its own issuer, keys, providers and user-session strategy;
- existing Supabase sessions cannot be assumed valid in another identity system;
- Edge Functions, SMTP settings and secrets must be deployed separately.

References:

- [Supabase: Migrate to Supabase with Postgres replication](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres)
- [Supabase: Restore a platform project to self-hosted Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
