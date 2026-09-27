-- Keep the legacy n8n entry point callable without performing any database
-- writes. This guarantees that an old schedule cannot recreate or mutate work.

create or replace function public.sync_offerpsp_freshness_reminders(
  p_notify_before_days integer default 7,
  p_repeat_days integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff or service access required';
  end if;

  return jsonb_build_object(
    'queue', '[]'::jsonb,
    'notifications', '[]'::jsonb,
    'policy', 'manual_updates_only',
    'retired_tasks', 0
  );
end;
$$;

comment on function public.sync_offerpsp_freshness_reminders(integer, integer) is
  'Read-only compatibility no-op. Offer updates, searches and reminders happen only after explicit staff action.';
