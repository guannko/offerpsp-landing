-- Phase 1 of retiring the legacy calendar-freshness subsystem.
-- Keep a private recovery copy for the observation window, but disconnect all
-- remaining writers. The public list/sync RPCs intentionally remain read-only
-- no-ops for short-lived compatibility with unknown external callers.

create table if not exists private.offerpsp_freshness_reminders_quarantine_20260927
as table private.offerpsp_freshness_reminders with no data;

truncate table private.offerpsp_freshness_reminders_quarantine_20260927;

insert into private.offerpsp_freshness_reminders_quarantine_20260927
select *
from private.offerpsp_freshness_reminders;

truncate table private.offerpsp_freshness_reminders;

drop trigger if exists offerpsp_provider_freshness_resolves_reminder
  on private.offerpsp_providers;

revoke all on private.offerpsp_freshness_reminders
  from public, anon, authenticated, service_role;
revoke all on private.offerpsp_freshness_reminders_quarantine_20260927
  from public, anon, authenticated, service_role;
revoke all on function public.mark_offerpsp_freshness_notified(uuid, text, text, text)
  from public, anon, authenticated, service_role;

comment on table private.offerpsp_freshness_reminders is
  'Quarantined empty compatibility table. No triggers, UI or automation may write here. Remove after the observation window.';
comment on table private.offerpsp_freshness_reminders_quarantine_20260927 is
  'Recovery-only snapshot of the retired calendar freshness rows, captured 2026-09-27. Owner access only; remove after successful observation.';
comment on function public.mark_offerpsp_freshness_notified(uuid, text, text, text) is
  'Quarantined legacy RPC with no runtime grants. Retained temporarily for rollback only.';
