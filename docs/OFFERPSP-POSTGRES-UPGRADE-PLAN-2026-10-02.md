# OfferPSP managed PostgreSQL security upgrade plan

Status: **PARTIAL**. Read-only compatibility preflight and the isolated official
Supabase PostgreSQL 17.11 restore rehearsal pass. The managed production upgrade
has not occurred. No downtime is authorized merely by saving this plan.

## Current evidence and target

The canonical production project is `iceopurxqzqmwtcmwfzl`, PostgreSQL 17.6.
Seven extension versions were inspected on 2 October 2026: pg_cron 1.6.4,
pg_net 0.20.4, pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0,
supabase_vault 0.3.1 and uuid-ossp 1.1.

Supabase's [September 25 security upgrade guidance](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
identifies the PostgreSQL 17.11 update and compatibility considerations. Use the
supported patched target actually offered by the production dashboard; confirm
its exact version at execution time rather than treating this plan as an
availability receipt.

Read-only preflight found no affected ltree/float GiST indexes, custom
selectivity-estimator operators or public/private application references to the
affected PGP functions in the inspected categories. No managed ciphertext was
decrypted. Absence in these categories is not a complete compatibility guarantee.

The current private recovery package has a verified logical database restore,
all 156 archived COPY tables with exact row hashes, all 20 Storage files with
exact hashes, and a bounded Auth/REST/Storage restart drill. It does not provide
managed Vault decryption, an atomic DB/Storage snapshot, hosted failover or an
engine-downgrade guarantee. Keep these recovery limits explicit.

## Rehearsal before a production window

Completed bounded rehearsal, 2 October 19:04:41–19:05:01 UTC: fresh private pack
`current-20261002-Q1HHtd`, exported at 19:03:49 UTC, restored into official
`public.ecr.aws/supabase/postgres:17.11.0.002`, image digest
`sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53`.
The verifier independently asserts the running engine is 17.11. All 159 table
definitions, 62 policies, 265 public function definitions and seven extension
versions match; all 156 archived COPY tables / 12,204 rows and 20 Storage files
have exact content hashes. Nine rolled-back company-rejection cases and nine
bounded Auth/REST/Storage checks, including restart, pass. Networking is none,
no ports are published, cron is disabled and temporary containers are removed.
Receipt: private `restore-proof-1JB3BZ/report.json`. The source engine remains
17.6; this is not a managed platform upgrade, hosted failover, Vault decryption
or proof that the dashboard offers this exact build. Those limits still apply.

Reproduction: `node scripts/verify-current-recovery-pack.mjs <private-pack>
--target-pg17.11 --check-services --check-company-rejection`.

1. Confirm the dashboard's supported target, downtime estimate and rollback
   guidance. Record version, extension compatibility and any platform-specific
   change; do not extrapolate from an upstream PostgreSQL container alone.
2. Prepare a private network-isolated compatible target-version environment.
   Use only an official reviewed image. If the matching Supabase image is not
   available, mark the target-stack rehearsal BLOCKED rather than substitute a
   plain PostgreSQL image and claim equivalent extension coverage.
3. Export a fresh authorized logical DB/role package and private Storage inventory
   without printing secrets. Retain the preceding verified package separately.
   Document snapshot time and non-atomicity.
4. Restore using exit-on-error and one transaction. Compare extension versions,
   schema/grants/policies, every archived COPY row and all Storage hashes.
5. Run the current migration replay and intake/screening concurrency tests,
   company approval/rejection isolation, matching, parser, document and mail
   regressions. Run the bounded Auth/REST/Storage drill with synthetic signing
   keys and local SMTP. No production queue worker or real send may run locally.
6. Record failures, actual elapsed timings and cleanup. Target-version rehearsal
   passes only when its own evidence passes; the earlier 17.6 run is not reused
   as an upgrade receipt.

## Production execution and acceptance

Boris must approve the exact window and expected interruption before any engine
upgrade or writer pause. No paid staging project is authorized. Inventory active
scheduled workers, mailbox polling and intake behavior first; do not disable
unrelated SEO, subagent, Telegram-group or Zoom workflows. Any required pause of
a protected module needs separate agreement.

Immediately before the window, record the latest managed backup, a fresh private
logical/file package, current migrations and staff/public release manifests.
Agree which writes can be paused or retried and how new intake is handled during
the interruption. No recovery-point objective is claimed until the maximum
acceptable data gap is agreed.

Apply only the supported managed upgrade through the platform. After it reports
ready, independently verify database version and extensions, application grants,
staff login, client login, loaded mail history, task/calendar counters, intake
and screening queue health, document private access and n8n reconnection. Use
only explicitly approved QA identities for write/send journeys; compare business
queue counts to the recorded checkpoint rather than creating real test clients.

Do not release an intake/worker backlog until health and duplicate-send guards
are verified. Record platform receipt, start/end timestamps, manifest versions,
logs and the exact scope of tests. Failure is PARTIAL or BLOCKED, not READY
because one dashboard is green.

## Failure response and recovery limits

Keep both known-good and new evidence. Do not try an unsupported in-place engine
downgrade or overwrite production from the local dump. Consult Supabase's
[upgrade guidance](https://supabase.com/docs/guides/platform/upgrading) and
[backup/restore limits](https://supabase.com/docs/guides/platform/backups) for the
actual project and patched target.

Any managed restoration, production replacement, loss of post-backup writes or
credential change requires explicit approval and a stated data-loss boundary.
If the upgrade succeeds but one application path fails, diagnose the exact path
before taking an unrelated database-wide recovery action. A release rollback
does not roll back the database engine or schema.
