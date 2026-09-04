# OfferPSP + AIBot recovery and distribution kit

This directory contains the reproducible tooling and documentation used to create two different
artifacts from the same verified production system.

## Artifacts

1. **Private recovery pack** — exact Git history, current worktree patch, production n8n JSON,
   Supabase schema/data/functions/storage metadata, Vercel metadata and recovery runbook. It is
   stored under `.private/recovery-packs/` and must never be committed or shared.
2. **Sale-ready pack** — complete application source, migrations, Edge Functions and sanitized n8n
   logic without BIX data, credentials, personal identifiers or production IDs.

The sale-ready pack preserves business logic but starts inactive. A buyer must provide their own
Supabase, n8n, Vercel, Telegram, SMTP and AI/search credentials.

## Build

```bash
node recovery/sale-pack/scripts/build-sale-pack.mjs \
  .private/recovery-packs/2026-08-13-offerpsp-aibot
node recovery/sale-pack/scripts/generate-private-restore.mjs \
  .private/recovery-packs/2026-08-13-offerpsp-aibot
node recovery/sale-pack/scripts/verify-pack.mjs \
  .private/recovery-packs/2026-08-13-offerpsp-aibot
```

Read [RESTORE.md](docs/RESTORE.md) before using the private pack.

## Verification boundary

The sale-ready source must pass a clean dependency install, the root validation command and the
Captain's Bridge production build before an archive is released. The exact private pack contains a
Git bundle, worktree patch, checksums and a credential-placement inventory, but no credential
values.

An archive is not a substitute for a disaster rehearsal. A release may be described as
`recovery-ready` only until it has been restored into isolated Supabase, n8n and Vercel projects and
the critical lead, offer, portal, Telegram and email paths have passed end-to-end tests.
