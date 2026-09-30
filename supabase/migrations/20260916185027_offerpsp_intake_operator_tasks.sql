-- Internal response target, not a client-facing contractual SLA. No historical backfill.
create unique index offerpsp_intake_response_task_once
  on public.offerpsp_tasks(lead_id)
  where automation_ref = 'intake_response_v1';

create or replace function private.offerpsp_ensure_intake_task(p_lead_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_lead public.offerpsp_leads;
  v_id uuid;
  v_assignee uuid;
begin
  -- Same lock order as screening and merchant lifecycle operations.
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id for update;
  if not found or v_lead.record_state <> 'active' or v_lead.status in ('closed','spam') then
    return null;
  end if;
  select id into v_id from public.offerpsp_tasks
    where lead_id=p_lead_id and automation_ref='intake_response_v1';
  if found then return v_id; end if; -- Includes completed/cancelled tasks. Never reset a human decision.
  select user_id into v_assignee from public.offerpsp_staff_members
    where active and user_id=v_lead.assigned_to;
  if v_assignee is null then
    select user_id into v_assignee from public.offerpsp_staff_members
      where active and role='owner'
      and (select count(*) from public.offerpsp_staff_members where active and role='owner')=1;
  end if;
  insert into public.offerpsp_tasks(lead_id,assigned_to,source,title,details,priority,due_at,automation_ref,metadata)
  values(p_lead_id,v_assignee,'system',left('Review intake: ' || coalesce(nullif(v_lead.company,''),'Merchant'),240),
    'Review the dossier and screening evidence; prepare the next response. No message has been sent by this task.',
    'normal',v_lead.submitted_at + interval '24 hours','intake_response_v1',
    jsonb_build_object('automation','intake_response','target_hours',24,'target_kind','internal_response',
      'external_send_authorized',false))
  on conflict (lead_id) where automation_ref='intake_response_v1' do nothing
  returning id into v_id;
  if v_id is not null then
    insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
      values(p_lead_id,'system','intake_task_created','Intake response task created',jsonb_build_object('task_id',v_id));
  else
    select id into v_id from public.offerpsp_tasks where lead_id=p_lead_id and automation_ref='intake_response_v1';
  end if;
  return v_id;
end;
$$;
revoke all on function private.offerpsp_ensure_intake_task(uuid) from public,anon,authenticated,service_role;

create or replace function private.offerpsp_create_intake_task()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private
as $$ begin perform private.offerpsp_ensure_intake_task(new.lead_id); return new; end; $$;
revoke all on function private.offerpsp_create_intake_task() from public,anon,authenticated,service_role;
create trigger offerpsp_lead_operator_task after insert on public.offerpsp_leads
  for each row execute function private.offerpsp_create_intake_task();

-- A task may be edited/completed using the existing UI, but cannot be detached to evade dedup.
create or replace function private.offerpsp_protect_intake_task_identity()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin
  if old.automation_ref='intake_response_v1' and
    (new.lead_id is distinct from old.lead_id or new.automation_ref is distinct from old.automation_ref) then
    raise exception 'Intake task identity is immutable';
  end if;
  return new;
end; $$;
revoke all on function private.offerpsp_protect_intake_task_identity() from public,anon,authenticated,service_role;
create trigger offerpsp_intake_task_identity before update on public.offerpsp_tasks
  for each row execute function private.offerpsp_protect_intake_task_identity();
