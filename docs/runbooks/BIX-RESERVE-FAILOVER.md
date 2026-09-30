# BIX Reserve failover runbook

Status: `DRAFT` — do not use for production until the reserve is provisioned and the drill checklist is verified.

Date: 2026-08-22

## Activation authority

Only an OfferPSP owner or explicitly delegated incident commander may promote the reserve. Monitoring may recommend failover, but must not perform an automatic write promotion.

## Trigger conditions

Consider failover when at least one P0 path is unavailable and independent probes confirm that the problem is not limited to a browser, Vercel deployment or local network:

- staff and merchant authentication is unavailable;
- core reads/writes or matching cannot complete;
- Supabase Auth/Postgres/Storage remains unavailable beyond the agreed threshold;
- the primary returns sustained 5xx/timeouts and circuit breakers are open.

Do not promote solely because one n8n execution failed.

## Preconditions

- reserve database, API, identity, storage and queue health are green;
- replication lag is within the approved RPO;
- reconciliation has no unexplained P0 differences;
- the writer lease is reachable independently of the primary;
- outgoing email/Telegram delivery ledger is current;
- a named incident commander and operator are recorded.

If any precondition fails, keep the system degraded/read-only and report `BLOCKED` instead of pretending failover is safe.

## Promotion procedure

1. Record incident start, symptoms and independent probe results.
2. Pause primary-originating schedulers and n8n mutation workflows.
3. Enable the gateway maintenance/read-only response for business writes.
4. Drain or snapshot the primary outbox if reachable.
5. Wait for the reserve consumer to reach the last known safe event offset.
6. Run the P0 reconciliation set: actors, organizations, merchants, PSPs, offers, deals, confirmations, messages and delivery ledger.
7. Acquire the reserve writer lease. Confirm the primary lease is absent/expired.
8. Promote the reserve database/API to writer mode.
9. Switch Cloudflare/BIX Gateway routing to the reserve.
10. Enable reserve queues and schedulers with their idempotency ledger.
11. Run synthetic checks without sending real customer messages:
    - staff sign-in;
    - merchant sign-in;
    - one read from each P0 domain;
    - one synthetic create/update/delete cycle in an isolated test organization;
    - MCP `system_health` and read-only search.
12. Remove maintenance mode only after all checks pass.
13. Announce `VERIFIED` with actual timestamp, active writer and last replicated event. Otherwise roll back routing and report `PARTIAL`/`BLOCKED`.

## During reserve operation

- keep the former primary fenced from writes;
- do not re-enable direct database/n8n mutations;
- retain all reserve outbox events for reverse replay;
- monitor database lag, error rate, queue age, file-copy failures and duplicate-delivery attempts;
- make no unrelated migrations until the incident is closed.

## Failback procedure

Failback is a planned operation, never an automatic reaction to the primary becoming reachable.

1. Restore and health-check the primary without accepting writes.
2. Apply every schema migration present on the reserve.
3. Replay reserve outbox events into the primary using idempotency keys.
4. Recopy changed files and verify checksums.
5. Run full P0/P1 reconciliation and investigate every difference.
6. Pause reserve schedulers, enter a short write-maintenance window and drain the final events.
7. Acquire the primary writer lease and confirm the reserve lease is released.
8. Route traffic to the primary and run the synthetic checks.
9. Keep the reserve online in shadow mode and monitor for at least one hour.
10. Close the incident only after documenting actual RPO, RTO, duplicates, lost events and corrective actions.

## Abort conditions

Abort promotion or failback if:

- two writer leases exist or lease state is unknown;
- replication offsets cannot be established;
- P0 reconciliation differs without explanation;
- identity mapping cannot authorize the intended staff/merchant;
- storage manifests or delivery ledgers are missing;
- synthetic writes are not idempotent.

## Evidence checklist

- [ ] incident ID and named commander
- [ ] primary and reserve health probe outputs
- [ ] last primary outbox offset
- [ ] last reserve applied offset
- [ ] replication lag at promotion
- [ ] reconciliation report
- [ ] writer lease transition
- [ ] routing change record
- [ ] synthetic-check results
- [ ] actual RPO and RTO
- [ ] failback reconciliation
- [ ] post-incident actions
