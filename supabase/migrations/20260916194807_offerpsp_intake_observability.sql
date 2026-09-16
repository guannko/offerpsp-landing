-- Read-only staff projection of existing evidence. Never return callback tokens,
-- chat identifiers, provider/pricing data, request headers or arbitrary metadata.
create or replace function public.get_offerpsp_intake_observability(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_lead public.offerpsp_leads;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() or not exists (
    select 1 from public.offerpsp_staff_members where user_id=auth.uid() and active
  ) then raise exception 'Active staff access required' using errcode='42501'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id;
  if not found then raise exception 'Intake not found' using errcode='P0002'; end if;
  return jsonb_build_object(
    'observed_at',now(),
    'lead',jsonb_build_object('id',v_lead.lead_id,'company',v_lead.company,'status',v_lead.status,
      'record_state',v_lead.record_state,'source',v_lead.source,'submitted_at',v_lead.submitted_at,
      'workspace_linked',v_lead.client_user_id is not null),
    'screening',(select jsonb_build_object('status',c.case_status,'updated_at',c.updated_at,
      'started_at',c.screening_dispatch_started_at,'finished_at',c.last_screened_at,
      'attempts',c.screening_attempts,'lease_until',c.screening_lease_until,
      'missing',c.missing_information,'summary',c.summary,'risk',c.risk_level,
      'checks',coalesce((select jsonb_agg(jsonb_build_object('key',k.check_key,'title',k.title,
        'status',k.check_status,'detail',k.detail) order by k.check_key)
        from private.offerpsp_compliance_checks k where k.case_id=c.id),'[]'::jsonb))
      from private.offerpsp_compliance_cases c where c.lead_id=p_lead_id),
    'task',(select jsonb_build_object('status',t.status,'due_at',t.due_at,'created_at',t.created_at)
      from public.offerpsp_tasks t where t.lead_id=p_lead_id and t.automation_ref='intake_response_v1'),
    'telegram',(select jsonb_build_object('status',d.status,'started_at',d.reserved_at,'finished_at',d.completed_at)
      from private.offerpsp_telegram_intake_deliveries d where d.lead_id=p_lead_id),
    'actions',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'at',a.consumed_at,
      'outcome',a.receipt->>'outcome','message',a.receipt->>'message','error_code',a.receipt->>'error_code') order by a.consumed_at desc)
      from private.offerpsp_telegram_intake_actions a where a.lead_id=p_lead_id and a.consumed_at is not null),'[]'::jsonb),
    'match_count',(select count(*) from private.offerpsp_route_matches where lead_id=p_lead_id),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from (
      select id,created_at,actor_type,activity_type,title,
        case when activity_type='telegram_intake_action' then metadata->'receipt'->>'message' else null end as detail,
        case when activity_type='telegram_intake_action' then metadata->'receipt'->>'outcome' else null end as outcome
      from public.offerpsp_lead_activities where lead_id=p_lead_id
      order by created_at desc,id desc limit 100) e),'[]'::jsonb),
    'event_count',(select count(*) from public.offerpsp_lead_activities where lead_id=p_lead_id)
  );
end; $$;
revoke all on function public.get_offerpsp_intake_observability(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_offerpsp_intake_observability(uuid) to authenticated;
