-- First-response delivery and human dossier review are separate units of work.
-- Existing send/claim/idempotency protocols and Telegram actions are unchanged.
create unique index if not exists offerpsp_intake_review_task_unique
on public.offerpsp_tasks(lead_id) where automation_ref='intake_review_v1';

create or replace function private.offerpsp_sync_intake_review_task(p_lead_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_lead public.offerpsp_leads;
  v_case private.offerpsp_compliance_cases;
  v_id uuid;
begin
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id;
  select * into v_case from private.offerpsp_compliance_cases where lead_id=p_lead_id;
  if v_lead.lead_id is null or v_case.id is null then return null; end if;
  select id into v_id from public.offerpsp_tasks where lead_id=p_lead_id and automation_ref='intake_review_v1';
  if v_lead.record_state='archived' or v_lead.status in ('closed','spam','won','lost')
    or v_case.case_status in ('rejected','spam') then
    update public.offerpsp_tasks set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now(),
      metadata=coalesce(metadata,'{}')||jsonb_build_object('review_closed_reason','terminal_state')
    where id=v_id and status in ('pending','in_progress');
    return v_id;
  end if;
  if v_case.case_status='cleared' then
    update public.offerpsp_tasks set status='done',completed_at=coalesce(completed_at,now()),updated_at=now(),
      metadata=coalesce(metadata,'{}')||jsonb_build_object('review_completed_by','compliance_decision','case_id',v_case.id)
    where id=v_id and status in ('pending','in_progress');
    return v_id;
  end if;
  if v_case.case_status not in ('manual_review','needs_info','hold') then return v_id; end if;
  if private.offerpsp_task_is_qa_fixture(p_lead_id,v_lead.company,null) then return v_id; end if;
  if v_id is not null then
    -- A new blocking case may reopen only a review auto-closed by a prior clearance.
    -- Never undo an explicit human completion or cancellation.
    update public.offerpsp_tasks set status='pending',completed_at=null,due_at=now()+interval '24 hours',updated_at=now(),
      metadata=(coalesce(metadata,'{}')-'review_completed_by')||jsonb_build_object('review_reopened_at',now())
    where id=v_id and status='done' and metadata->>'review_completed_by'='compliance_decision';
    return v_id;
  end if;
  insert into public.offerpsp_tasks(lead_id,assigned_to,source,title,details,priority,due_at,automation_ref,metadata)
  values(p_lead_id,v_lead.assigned_to,'system',left('Review dossier: '||coalesce(nullif(v_lead.company,''),'Merchant'),240),
    'Review screening evidence, clarify missing information and record a compliance decision. An acknowledgement email does not complete this task.',
    'normal',now()+interval '24 hours','intake_review_v1',
    jsonb_build_object('automation','intake_review','case_id',v_case.id,'external_send_authorized',false))
  on conflict(lead_id) where automation_ref='intake_review_v1' do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.offerpsp_tasks where lead_id=p_lead_id and automation_ref='intake_review_v1'; end if;
  return v_id;
end;
$$;
revoke all on function private.offerpsp_sync_intake_review_task(uuid) from public,anon,authenticated,service_role;

create or replace function private.offerpsp_intake_review_case_changed()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.offerpsp_sync_intake_review_task(new.lead_id); return new; end; $$;
revoke all on function private.offerpsp_intake_review_case_changed() from public,anon,authenticated,service_role;
create trigger offerpsp_intake_review_case_changed
after insert or update of case_status on private.offerpsp_compliance_cases
for each row execute function private.offerpsp_intake_review_case_changed();
create trigger offerpsp_intake_review_lead_changed
after update of status,record_state on public.offerpsp_leads
for each row execute function private.offerpsp_intake_review_case_changed();

-- Correct the system's default task title without changing its established identity.
create or replace function private.offerpsp_intake_response_task_label()
returns trigger language plpgsql set search_path = ''
as $$ begin
  if new.automation_ref='intake_response_v1' and new.source='system'
    and new.title like 'Review intake: %' then
    new.title := left('First response: '||substring(new.title from 16),240);
    new.details := 'Send or verify the first response to the intake. This task records response handling, not dossier review or compliance clearance.';
  end if;
  return new;
end; $$;
revoke all on function private.offerpsp_intake_response_task_label() from public,anon,authenticated,service_role;
create trigger offerpsp_intake_response_task_label
before insert or update on public.offerpsp_tasks
for each row execute function private.offerpsp_intake_response_task_label();

-- Restore explicit manual-review work for active intake-stage requests only.
-- Do not reopen historical advanced-stage, archived, terminal or QA work.
select private.offerpsp_sync_intake_review_task(l.lead_id)
from public.offerpsp_leads l join private.offerpsp_compliance_cases c using(lead_id)
where l.record_state='active' and l.status in ('new','qualifying','needs_clarification')
  and c.case_status in ('manual_review','needs_info','hold');
update public.offerpsp_tasks set title=title
where automation_ref='intake_response_v1' and source='system' and title like 'Review intake: %'
  and metadata->>'automation_completed_by' in ('intake-submission-receipt-v1','intake_auto_reply');
