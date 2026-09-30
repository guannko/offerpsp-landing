-- Inactive merchant workspaces must not leave stale offer-update cards in the
-- live staff queue. The queue record stays available as history.

update private.offerpsp_offer_update_queue queue
set status = 'dismissed',
    updated_at = now(),
    notes = concat_ws(
      E'\n',
      nullif(trim(queue.notes), ''),
      '[system] Dismissed because the merchant workspace is inactive.'
    )
from public.offerpsp_leads lead
where lead.lead_id = queue.lead_id
  and queue.status in ('pending', 'in_progress')
  and (lead.record_state = 'archived' or lead.status in ('closed', 'spam'));

create or replace function private.offerpsp_cancel_tasks_for_inactive_lead()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.record_state = 'archived' or new.status in ('closed', 'spam') then
    update public.offerpsp_tasks
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'auto_cancelled_reason', 'merchant_lifecycle',
          'auto_cancelled_at', now()
        )
    where lead_id = new.lead_id
      and status in ('pending', 'in_progress');

    update private.offerpsp_offer_update_queue
    set status = 'dismissed',
        updated_at = now(),
        notes = concat_ws(
          E'\n',
          nullif(trim(notes), ''),
          '[system] Dismissed because the merchant workspace is inactive.'
        )
    where lead_id = new.lead_id
      and status in ('pending', 'in_progress');
  end if;

  return new;
end;
$$;

revoke all on function private.offerpsp_cancel_tasks_for_inactive_lead()
  from public, anon, authenticated;

comment on function private.offerpsp_cancel_tasks_for_inactive_lead() is
  'Cancels staff tasks and dismisses stale offer-update work when a merchant workspace becomes inactive.';
