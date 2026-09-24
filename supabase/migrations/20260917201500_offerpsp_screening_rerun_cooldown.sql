-- A manual screening request is acknowledged immediately, while the evidence worker runs
-- asynchronously.  Keep a short server-side cooldown so repeat clicks, multiple tabs and
-- Telegram/web races cannot create another run immediately after completion.
create or replace function public.queue_offerpsp_pre_compliance_screening(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_case private.offerpsp_compliance_cases%rowtype;
  v_lead public.offerpsp_leads%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry_at timestamptz;
  v_cooldown constant interval := interval '5 minutes';
begin
  if not coalesce(public.is_offerpsp_staff(), false) then raise exception 'OfferPSP staff access required'; end if;
  if not private.offerpsp_module_enabled('pre_compliance') then raise exception 'Pre-compliance module disabled'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id = p_lead_id for update;
  if v_lead.lead_id is null or v_lead.record_state <> 'active' or v_lead.status in ('closed', 'spam', 'won', 'lost') then
    raise exception 'Active non-terminal OfferPSP lead required';
  end if;
  select * into v_case from private.offerpsp_compliance_cases where lead_id = p_lead_id for update;
  if v_case.id is null then raise exception 'Pre-compliance case not found'; end if;

  -- Pending/running work is the same logical request. Return its state without touching the row,
  -- so the pending->screening event trigger cannot fire again.
  if v_case.case_status in ('pending', 'screening') then
    return jsonb_strip_nulls(jsonb_build_object(
      'case_id', v_case.id,
      'lead_id', p_lead_id,
      'status', v_case.case_status,
      'outcome', 'already_running',
      'started_at', coalesce(v_case.screening_dispatch_started_at, v_case.manual_requested_at),
      'lease_until', v_case.screening_lease_until
    ));
  end if;
  if v_case.case_status not in ('manual_review', 'needs_info') then
    raise exception 'Review decision must be explicitly reopened before screening';
  end if;

  v_retry_at := v_case.last_screened_at + v_cooldown;
  if v_case.last_screened_at is not null and v_retry_at > v_now then
    return jsonb_build_object(
      'case_id', v_case.id,
      'lead_id', p_lead_id,
      'status', v_case.case_status,
      'outcome', 'cooldown',
      'last_screened_at', v_case.last_screened_at,
      'retry_after_at', v_retry_at,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_retry_at - v_now)))::integer)
    );
  end if;

  update private.offerpsp_compliance_cases set case_status = 'pending', manual_requested_at = v_now,
    screening_run_id = null, screening_lease_until = null, screening_attempts = 0, updated_at = v_now
    where id = v_case.id;
  insert into public.offerpsp_lead_activities(lead_id, actor_type, activity_type, title, metadata)
    values(p_lead_id, 'staff', 'pre_compliance_requested', 'Manual pre-compliance screening requested',
      jsonb_build_object('case_id', v_case.id));
  return jsonb_build_object('case_id', v_case.id, 'lead_id', p_lead_id, 'status', 'pending',
    'outcome', 'queued', 'manual_requested_at', v_now);
end;
$$;

revoke all on function public.queue_offerpsp_pre_compliance_screening(uuid) from public, anon, service_role;
grant execute on function public.queue_offerpsp_pre_compliance_screening(uuid) to authenticated;

comment on function public.queue_offerpsp_pre_compliance_screening(uuid) is
  'Starts one staff-requested evidence run. Pending/running work is reused and a completed run has a five-minute rerun cooldown.';
