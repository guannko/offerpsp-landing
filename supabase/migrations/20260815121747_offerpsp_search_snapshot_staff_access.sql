-- Staff-safe wrapper for the service-only search snapshot.
--
-- The underlying function intentionally remains restricted to service_role for
-- background index synchronization. MCP staff sessions use this wrapper,
-- which preserves auth.uid() and verifies OfferPSP staff membership before the
-- security-definer call can read private supply tables.

create or replace function public.get_offerpsp_staff_search_index_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required' using errcode = '42501';
  end if;

  return public.get_offerpsp_search_index_snapshot();
end;
$function$;

revoke all on function public.get_offerpsp_staff_search_index_snapshot() from public;
revoke execute on function public.get_offerpsp_staff_search_index_snapshot() from anon;
grant execute on function public.get_offerpsp_staff_search_index_snapshot() to authenticated;

comment on function public.get_offerpsp_staff_search_index_snapshot() is
  'Staff-authorized MCP search snapshot wrapper. Checks is_offerpsp_staff() before reading the service-only index snapshot.';
