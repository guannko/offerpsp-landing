-- Final operating policy: offer data is changed only when staff receives and
-- records new information. The platform must not infer work from elapsed time.

drop trigger if exists offerpsp_shortlist_item_queue_reconfirmation
  on public.offerpsp_shortlist_items;
drop trigger if exists offerpsp_shortlist_share_reconfirmation_guard
  on public.offerpsp_shortlists;
drop trigger if exists offerpsp_route_resolves_reconfirmation
  on private.offerpsp_offer_routes;

create or replace function private.resolve_offerpsp_freshness_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if new.last_verified_at is distinct from old.last_verified_at
     and new.last_verified_at is not null then
    update private.offerpsp_freshness_reminders
    set status = 'resolved', snoozed_until = null
    where provider_id = new.id and status <> 'resolved';

    update public.offerpsp_tasks task
    set status = 'done',
        completed_at = coalesce(task.completed_at, now()),
        metadata = task.metadata || jsonb_build_object(
          'resolved_by', 'manual_provider_confirmation',
          'resolved_at', now()
        )
    where task.source = 'system'
      and task.status in ('pending', 'in_progress')
      and task.metadata ->> 'automation' = 'provider_freshness'
      and task.metadata ->> 'provider_id' = new.id::text;
  end if;
  return new;
end;
$$;

drop function if exists private.queue_offerpsp_shortlist_reconfirmation();
drop function if exists private.guard_offerpsp_shortlist_share_reconfirmation();
drop function if exists private.resolve_offerpsp_reconfirmation_after_route_change();
drop function if exists private.offerpsp_route_requires_reconfirmation(uuid);

-- The first event-driven migration may have been active briefly before this
-- policy clarification. Preserve any rows it created, but remove them from the
-- active queue without deleting history.
update public.offerpsp_tasks task
set status = 'done',
    completed_at = coalesce(task.completed_at, now()),
    metadata = task.metadata || jsonb_build_object(
      'resolved_by', 'manual_updates_only_policy',
      'resolved_at', now()
    )
where task.source = 'system'
  and task.metadata ->> 'automation' = 'offer_reconfirmation'
  and task.status in ('pending', 'in_progress');

comment on table private.offerpsp_freshness_reminders is
  'Retired calendar reminder history. Offer updates and reminders are created manually from newly received information or an explicit staff task.';
comment on function public.sync_offerpsp_freshness_reminders(integer, integer) is
  'Compatibility no-op. Offer data has no automatic age-based reminders, notifications, searches or blocking actions.';
comment on function public.list_offerpsp_freshness_reminders() is
  'Always empty. Staff can create an explicit OfferPSP task when a manual reminder is actually needed.';
