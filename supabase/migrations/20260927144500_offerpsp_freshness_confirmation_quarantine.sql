-- Complete phase 1 isolation of the retired calendar-freshness subsystem.
-- Confirmation RPCs changed verification timestamps without new commercial
-- information, so keep their definitions only for the rollback window and
-- disconnect every runtime role.

revoke all on function public.confirm_offerpsp_provider_freshness(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_offerpsp_provider_portal_freshness(uuid)
  from public, anon, authenticated, service_role;

comment on function public.confirm_offerpsp_provider_freshness(uuid) is
  'Quarantined legacy RPC. Offer terms change only when new source information is recorded.';
comment on function public.confirm_offerpsp_provider_portal_freshness(uuid) is
  'Quarantined legacy RPC. Offer terms change only when new source information is recorded.';
