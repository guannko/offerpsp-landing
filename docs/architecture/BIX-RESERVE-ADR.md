# ADR: independent BIX Reserve data plane

Status: `PROPOSED`

Date: 2026-08-22

## Decision

Build an independent warm-standby data plane for OfferPSP. Both primary and reserve remain online and continuously synchronized, but only one data plane may accept business writes at a time.

The first implementation target is:

- neutral front door: Cloudflare DNS, health checks and controlled routing;
- reserve API/runtime: Google Cloud Run;
- reserve database: Cloud SQL for PostgreSQL 17 with regional HA;
- reserve identity: Google Cloud Identity Platform with email-link sign-in;
- reserve files: Google Cloud Storage;
- reserve async layer: Pub/Sub and Cloud Tasks;
- reserve secrets and observability: Secret Manager, Cloud Logging and Monitoring.

The exact GCP region must be different from the primary Supabase failure domain and selected only after checking data residency, latency and provider availability.

## Why warm standby, not active-active writes

Automatic multi-master writes would create split-brain risks in offers, deals, messages, confirmations and matching state. Conflict resolution for those objects is a business decision, not a timestamp comparison.

Therefore:

| Mode | Primary | Reserve | User-facing state |
|---|---|---|---|
| Normal | writes enabled | synchronized, shadow reads and checks | normal operation |
| Degraded | writes fenced or queued | reserve promoted after checks | controlled failover |
| Recovery | read-only or replay source | active writer until reconciliation | controlled failback later |

Both systems work simultaneously in normal mode: the reserve consumes change events, validates data, serves internal shadow reads and runs independent health checks. It is not an idle backup, but it is not a second writer.

## Target topology

```text
                       +-----------------------+
Users / Codex / MCP -->| Cloudflare front door |
                       +-----------+-----------+
                                   |
                       +-----------v-----------+
                       | BIX Gateway / router  |
                       +------+----------+-----+
                              |          |
                    NORMAL    |          | FAILOVER
                              |          |
              +---------------v--+    +--v----------------+
              | Primary data     |    | BIX Reserve       |
              | plane            |    | data plane        |
              | Supabase/Vercel  |    | GCP               |
              +--------+---------+    +---------+----------+
                       |                        ^
                       +-- outbox / CDC events-+
```

## Synchronization contract

1. All new business mutations pass through BIX Gateway.
2. Every mutation carries an immutable `operation_id`/idempotency key.
3. The writer commits the business change and an outbox event in one database transaction.
4. A replication worker applies events to the reserve and records them in an `applied_events` ledger.
5. Replaying an event is safe: an already applied `operation_id` changes nothing.
6. Every mutable aggregate has a stable UUID, monotonic version and `updated_at` timestamp.
7. Schema changes use the same portable migration contract in both databases. DDL is never delegated to logical replication.
8. Files are copied separately with object version, size and checksum verification.
9. Identity records use an `identity_links` mapping between the internal actor ID and each provider subject. Passwords and raw provider tokens are never replicated.
10. Reconciliation compares row counts, event offsets, aggregate checksums and file manifests.

## Write fencing

Promotion is allowed only after the gateway obtains a writer lease from an independent control store. The lease identifies exactly one active data plane and expires unless renewed.

Required safeguards:

- no client may write directly to Supabase after the migration phase;
- primary writes are disabled or rejected before reserve promotion;
- n8n workflows use the gateway, not direct database credentials;
- queued tasks carry idempotency keys and are safe to retry;
- email and Telegram sends use a delivery ledger so failover cannot resend them silently;
- bulk operations remain preview plus token-bound confirmation.

## Recovery objectives

These are targets, not current verified capabilities.

| Stage | Target RPO | Target RTO |
|---|---:|---:|
| Independent encrypted backup only | 15 minutes | 2 hours |
| Warm database + files + gateway | 60 seconds | 10 minutes |
| Drilled full data plane | 30 seconds | 5 minutes |

No RPO/RTO is considered achieved until a timed failover and restoration drill passes.

## Implementation phases

### Phase 0 — inventory and contract

- freeze this ADR and dependency inventory;
- catalogue tables, RPCs, RLS policies, functions, buckets and workflow writes;
- classify P0/P1/P2 data and define retention/residency;
- define an internal actor/organization authorization model independent of `auth.users`.

Exit criterion: every production read/write path has an owner and migration route.

### Phase 1 — independent observability and gateway seam

- create a health/status endpoint that does not authenticate through Supabase;
- introduce a provider-neutral `DataPlane` adapter in BIX Gateway;
- route new server-side reads through the adapter;
- add circuit breakers for Supabase and n8n to stop alert storms.

Exit criterion: primary health can be reported accurately while Supabase is unavailable.

### Phase 2 — portable schema and event safety

- create reserve-compatible migrations;
- add outbox, applied-event ledger, idempotency and delivery-ledger tables;
- remove client-side business writes and direct n8n database writes;
- add identity mapping without exposing `service_role`.

Exit criterion: every business mutation is journaled and replayable.

### Phase 3 — provision the independent reserve

- provision separate GCP project, billing, IAM and break-glass accounts;
- create Cloud SQL, Cloud Run, Identity Platform, Storage and queues;
- seed schema, data and files from a verified snapshot;
- deploy reserve workers and read-only gateway paths.

Exit criterion: reserve can authenticate a test staff user and serve verified shadow reads without Supabase.

### Phase 4 — continuous synchronization

- enable outbox/CDC replication;
- compare offsets, rows, checksums and files continuously;
- alert on lag and reconciliation differences;
- keep reserve external writes disabled.

Exit criterion: seven days within the agreed lag/error budget.

### Phase 5 — failover drills

- run a planned read-only drill;
- run an isolated write drill with synthetic data;
- run a production maintenance-window promotion and failback;
- record actual RPO/RTO and close gaps.

Exit criterion: two consecutive successful drills with no duplicate deliveries or lost writes.

## First reversible implementation slice

Start with Phase 1 only: independent health, the `DataPlane` interface and read-only shadow checks. It changes no production storage and creates the seam needed for later migration.

## Rejected alternatives

- **Second Supabase project:** separate project but still the same provider/control plane; does not meet the independence requirement.
- **Database-only replica:** leaves Auth, Storage, Edge Functions, queues and health unavailable.
- **Immediate active-active:** unacceptable split-brain and delivery-duplication risk.
- **DNS-only failover:** routes users to an incomplete reserve and creates a false sense of resilience.

## Provider references

- [Cloud Run overview](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)
- [Cloud SQL replication](https://docs.cloud.google.com/sql/docs/postgres/replication)
- [Cloud SQL disaster recovery](https://docs.cloud.google.com/sql/docs/postgres/intro-to-cloud-sql-disaster-recovery)
- [Identity Platform multi-tenancy and email-link authentication](https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication)
