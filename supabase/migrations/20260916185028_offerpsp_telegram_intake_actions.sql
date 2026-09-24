-- Transport-only RPCs. The n8n Telegram trigger supplies identity; no browser can call them.
create table private.offerpsp_telegram_operators(
  telegram_user_id text primary key check (telegram_user_id ~ '^[1-9][0-9]{0,18}$'),
  chat_id text not null check(chat_id=telegram_user_id),
  staff_user_id uuid not null references public.offerpsp_staff_members(user_id),
  enabled boolean not null default true
);
create index offerpsp_telegram_operators_staff_idx on private.offerpsp_telegram_operators(staff_user_id);
alter table private.offerpsp_telegram_operators enable row level security;
revoke all on private.offerpsp_telegram_operators from public,anon,authenticated,service_role;

-- Bootstrap only the existing private operator notification chat and sole active owner.
insert into private.offerpsp_telegram_operators(telegram_user_id,chat_id,staff_user_id)
select i.configuration->>'default_chat_id',i.configuration->>'default_chat_id',s.user_id
from private.offerpsp_integration_settings i cross join public.offerpsp_staff_members s
where i.integration_key='telegram' and i.enabled and s.active and s.role='owner'
and i.configuration->>'default_chat_id' ~ '^[1-9][0-9]{0,18}$'
and (select count(*) from public.offerpsp_staff_members where active and role='owner')=1;

create table private.offerpsp_telegram_intake_actions(
  token uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  staff_user_id uuid not null references public.offerpsp_staff_members(user_id),
  chat_id text not null,
  action text not null check(action in ('screen','matching','missing_draft','reply_draft','remind')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  receipt jsonb,
  unique(lead_id,staff_user_id,action)
);
create index offerpsp_telegram_intake_actions_staff_idx on private.offerpsp_telegram_intake_actions(staff_user_id);
alter table private.offerpsp_telegram_intake_actions enable row level security;
revoke all on private.offerpsp_telegram_intake_actions from public,anon,authenticated,service_role;

create or replace function public.authorize_offerpsp_telegram_operator(p_from_id text,p_chat_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare v_staff uuid; begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Transport service access required'; end if;
  select o.staff_user_id into v_staff from private.offerpsp_telegram_operators o
    join public.offerpsp_staff_members s on s.user_id=o.staff_user_id and s.active
    join private.offerpsp_integration_settings i on i.integration_key='telegram' and i.enabled
    where o.enabled and o.telegram_user_id=p_from_id and o.chat_id=p_chat_id;
  return jsonb_build_object('authorized',v_staff is not null,'staff_user_id',v_staff);
end; $$;

create or replace function public.prepare_offerpsp_telegram_intake_card(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare
  v_lead public.offerpsp_leads; v_task public.offerpsp_tasks;
  v_operator private.offerpsp_telegram_operators;
  v_case private.offerpsp_compliance_cases;
  v_task_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Transport service access required'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id for update;
  if not found or v_lead.record_state <> 'active' or v_lead.status in ('spam','closed') then
    return jsonb_build_object('outcome','inactive');
  end if;
  v_task_id:=private.offerpsp_ensure_intake_task(p_lead_id);
  select * into v_task from public.offerpsp_tasks where id=v_task_id;
  select o.* into v_operator from private.offerpsp_telegram_operators o
    join public.offerpsp_staff_members s on s.user_id=o.staff_user_id and s.active
    join private.offerpsp_integration_settings i on i.integration_key='telegram' and i.enabled
      and coalesce((i.configuration->>'lead_notifications')::boolean,false)
    where o.enabled and (s.role='owner' or s.user_id=v_lead.assigned_to)
    order by (o.staff_user_id=v_task.assigned_to) desc nulls last,o.telegram_user_id limit 1;
  if not found then return jsonb_build_object('outcome','operator_unconfigured'); end if;
  insert into private.offerpsp_telegram_intake_actions(lead_id,staff_user_id,chat_id,action)
    select p_lead_id,v_operator.staff_user_id,v_operator.chat_id,a
    from unnest(array['screen','matching','missing_draft','reply_draft','remind']) a
    on conflict(lead_id,staff_user_id,action) do nothing;
  select * into v_case from private.offerpsp_compliance_cases where lead_id=p_lead_id;
  -- Explicit safe projection: never serialize matches, provider identities, prices or margins.
  return jsonb_build_object('outcome','ready','chat_id',v_operator.chat_id,
    'lead',jsonb_build_object('id',p_lead_id,'company',v_lead.company,'contact',v_lead.name,
      'domain',v_lead.company_url,'vertical',v_lead.vertical,'geos',v_lead.geos,'volume',v_lead.monthly_volume),
    'screening',jsonb_build_object('status',v_case.case_status,'completeness',v_case.completeness_score,
      'missing',v_case.missing_information,'risk',v_case.risk_level,'red_flags',v_case.red_flags,
      'yellow_flags',v_case.yellow_flags,'screened_at',v_case.last_screened_at),
    'possible_duplicates',(select count(*) from public.offerpsp_leads l where l.lead_id<>p_lead_id
      and l.record_state='active' and l.status<>'spam' and
      (lower(trim(l.work_email))=lower(trim(v_lead.work_email)) or
       (nullif(trim(v_lead.company_url),'') is not null and lower(rtrim(l.company_url,'/'))=lower(rtrim(v_lead.company_url,'/'))))),
    'workspace_ready',v_lead.client_user_id is not null,
    'match_count',(select count(*) from private.offerpsp_route_matches where lead_id=p_lead_id),
    'task',jsonb_build_object('id',v_task.id,'status',v_task.status,'due_at',v_task.due_at),
    'actions',(select jsonb_object_agg(action,token) from private.offerpsp_telegram_intake_actions
      where lead_id=p_lead_id and staff_user_id=v_operator.staff_user_id and expires_at>now()));
end; $$;

create or replace function public.execute_offerpsp_telegram_intake_action(p_token uuid,p_from_id text,p_chat_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare
  v_auth jsonb; v_action private.offerpsp_telegram_intake_actions; v_lead public.offerpsp_leads;
  v_task public.offerpsp_tasks; v_receipt jsonb; v_result jsonb;
  v_claims text; v_body text; v_missing text[];
begin
  v_auth:=public.authorize_offerpsp_telegram_operator(p_from_id,p_chat_id);
  if not coalesce((v_auth->>'authorized')::boolean,false) then
    return jsonb_build_object('outcome','unauthorized');
  end if;
  select * into v_action from private.offerpsp_telegram_intake_actions where token=p_token;
  if not found or v_action.staff_user_id::text<>v_auth->>'staff_user_id' or v_action.chat_id<>p_chat_id then
    return jsonb_build_object('outcome','unauthorized');
  end if;
  select * into v_lead from public.offerpsp_leads where lead_id=v_action.lead_id for update;
  select * into v_action from private.offerpsp_telegram_intake_actions where token=p_token for update;
  if not exists(select 1 from public.offerpsp_staff_members where user_id=v_action.staff_user_id and active
      and (role='owner' or user_id=v_lead.assigned_to)) then return jsonb_build_object('outcome','unauthorized'); end if;
  if v_action.receipt is not null then return v_action.receipt || '{"replayed":true}'::jsonb; end if;
  if v_action.expires_at<=now() then v_receipt:=jsonb_build_object('outcome','expired');
  elsif v_lead.record_state<>'active' or v_lead.status in ('closed','spam') then
    v_receipt:=jsonb_build_object('outcome','inactive');
  else
    -- Scoped, server-validated staff actor for the canonical staff RPCs and their audit trail.
    v_claims:=current_setting('request.jwt.claims',true);
    perform set_config('request.jwt.claims',(auth.jwt() || jsonb_build_object('sub',v_action.staff_user_id))::text,true);
    begin
      if v_action.action='screen' then
        v_result:=public.queue_offerpsp_pre_compliance_screening(v_lead.lead_id);
        v_receipt:=jsonb_build_object('outcome','completed','message','Автопроверка поставлена в очередь. Это не подтверждение лицензии и не окончательное решение.');
      elsif v_action.action='matching' then
        v_receipt:=jsonb_build_object('outcome','completed','message',
          'Сохранённых внутренних кандидатов: ' || (select count(*) from private.offerpsp_route_matches where lead_id=v_lead.lead_id)::text || '. Актуальность и детали проверьте в карточке. Мерчанту ничего не отправлено.');
      elsif v_action.action in ('missing_draft','reply_draft') then
        select missing_information into v_missing from private.offerpsp_compliance_cases where lead_id=v_lead.lead_id;
        if v_action.action='missing_draft' and coalesce(cardinality(v_missing),0)=0 then
          v_receipt:=jsonb_build_object('outcome','not_ready','message','Нет проверенного списка недостающих данных. Сначала дождитесь автопроверки или проверьте досье. Черновик не создан.');
        else
          v_body:='Hello,' || E'\n\nThank you for contacting OfferPSP. ' ||
            case when v_action.action='missing_draft' then
              'To review your request, please clarify the following:' || E'\n' ||
              (select string_agg('- ' || left(value,500),E'\n') from unnest(v_missing) value)
            else 'We have received your request and are reviewing the information provided. We will follow up with the next steps once the initial review is complete.' end ||
            E'\n\nBest regards,\nBorys Kononenko\nOfferPSP';
          v_result:=public.create_offerpsp_email_draft(v_lead.lead_id,v_lead.work_email,'Your OfferPSP request',v_body);
          v_receipt:=jsonb_build_object('outcome','completed','draft_id',v_result->'id','message','Черновик сохранён в Captain’s Bridge. Проверьте текст перед отправкой. Ничего не отправлено.');
        end if;
      elsif v_action.action='remind' then
        select * into v_task from public.offerpsp_tasks where lead_id=v_lead.lead_id and automation_ref='intake_response_v1' for update;
        if not found or v_task.status not in ('pending','in_progress') then
          v_receipt:=jsonb_build_object('outcome','inactive','message','Задача уже закрыта. Автоматически открывать её заново не буду.');
        else
          update public.offerpsp_tasks set due_at=now()+interval '24 hours',updated_at=now() where id=v_task.id;
          v_receipt:=jsonb_build_object('outcome','completed','task_id',v_task.id,'due_at',now()+interval '24 hours',
            'message','Срок этой задачи перенесён на 24 часа. Отдельная задача не создавалась.');
        end if;
      end if;
    exception when others then
      -- The subtransaction rolls back partial actions; journal only SQLSTATE, never raw errors.
      v_receipt:=jsonb_build_object('outcome','failed','error_code',sqlstate,'message','Действие не выполнено. Проверьте карточку в Captain’s Bridge.');
    end;
    perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  end if;
  v_receipt:=v_receipt || jsonb_build_object('lead_id',v_action.lead_id,'action',v_action.action);
  update private.offerpsp_telegram_intake_actions set consumed_at=now(),receipt=v_receipt where token=p_token;
  insert into public.offerpsp_lead_activities(lead_id,actor_user_id,actor_type,activity_type,title,metadata)
    values(v_action.lead_id,v_action.staff_user_id,'staff','telegram_intake_action',
      'Telegram intake action: ' || v_action.action,jsonb_build_object('action',v_action.action,'receipt',v_receipt));
  return v_receipt;
end; $$;

revoke all on function public.authorize_offerpsp_telegram_operator(text,text) from public,anon,authenticated;
revoke all on function public.prepare_offerpsp_telegram_intake_card(uuid) from public,anon,authenticated;
revoke all on function public.execute_offerpsp_telegram_intake_action(uuid,text,text) from public,anon,authenticated;
grant execute on function public.authorize_offerpsp_telegram_operator(text,text) to service_role;
grant execute on function public.prepare_offerpsp_telegram_intake_card(uuid) to service_role;
grant execute on function public.execute_offerpsp_telegram_intake_action(uuid,text,text) to service_role;

-- Reserve before the non-transactional Telegram send. Ambiguous timeouts must not auto-resend.
create table private.offerpsp_telegram_intake_deliveries(
  lead_id uuid primary key references public.offerpsp_leads(lead_id) on delete cascade,
  chat_id text not null,
  status text not null default 'reserved' check(status in ('reserved','sent','uncertain')),
  reserved_at timestamptz not null default now(),
  message_id text,
  completed_at timestamptz
);
alter table private.offerpsp_telegram_intake_deliveries enable row level security;
revoke all on private.offerpsp_telegram_intake_deliveries from public,anon,authenticated,service_role;

create or replace function public.claim_offerpsp_telegram_intake_card(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare v_card jsonb; v_id uuid; begin
  -- prepare checks service role and locks the lead before the delivery row.
  v_card:=public.prepare_offerpsp_telegram_intake_card(p_lead_id);
  if v_card->>'outcome'<>'ready' then return v_card; end if;
  insert into private.offerpsp_telegram_intake_deliveries(lead_id,chat_id)
    values(p_lead_id,v_card->>'chat_id') on conflict(lead_id) do nothing returning lead_id into v_id;
  if v_id is null then return jsonb_build_object('outcome','already_reserved'); end if;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title)
    values(p_lead_id,'system','telegram_intake_card_reserved','Operator card delivery started; awaiting Telegram receipt');
  return v_card;
end; $$;

create or replace function public.complete_offerpsp_telegram_intake_card(p_lead_id uuid,p_chat_id text,p_message_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare v_delivery private.offerpsp_telegram_intake_deliveries; begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Transport service access required'; end if;
  if p_message_id is null or p_message_id !~ '^[1-9][0-9]{0,18}$' then raise exception 'Telegram message receipt required'; end if;
  perform 1 from public.offerpsp_leads where lead_id=p_lead_id for update;
  select * into v_delivery from private.offerpsp_telegram_intake_deliveries where lead_id=p_lead_id for update;
  if not found or v_delivery.chat_id<>p_chat_id then raise exception 'Delivery identity mismatch'; end if;
  if v_delivery.status='sent' then
    if v_delivery.message_id<>p_message_id then raise exception 'Conflicting delivery receipt'; end if;
    return jsonb_build_object('outcome','already_recorded');
  end if;
  update private.offerpsp_telegram_intake_deliveries set status='sent',message_id=p_message_id,completed_at=now() where lead_id=p_lead_id;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'system','telegram_intake_card_sent','Operator card delivered',jsonb_build_object('message_id',p_message_id));
  return jsonb_build_object('outcome','recorded');
end; $$;
revoke all on function public.claim_offerpsp_telegram_intake_card(uuid) from public,anon,authenticated;
revoke all on function public.complete_offerpsp_telegram_intake_card(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_offerpsp_telegram_intake_card(uuid) to service_role;
grant execute on function public.complete_offerpsp_telegram_intake_card(uuid,text,text) to service_role;
