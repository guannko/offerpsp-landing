-- Keep the staff Telegram intake card aligned with the current screening and
-- automatic-response state. Initial sends remain exactly-once; edits are
-- content-addressed, replay-safe and never expose provider identity or rates.

-- Dispatch receipts are operational children of a screening case. Keeping them
-- after an explicitly purged merchant blocks the existing verified purge flow
-- without preserving useful independent evidence.
alter table if exists private.offerpsp_screening_dispatches
  drop constraint if exists offerpsp_screening_dispatches_case_id_fkey;
alter table if exists private.offerpsp_screening_dispatches
  add constraint offerpsp_screening_dispatches_case_id_fkey
  foreign key(case_id) references private.offerpsp_compliance_cases(id) on delete cascade;

alter table private.offerpsp_telegram_intake_actions
  add column if not exists active boolean not null default true;

alter table private.offerpsp_telegram_intake_actions
  drop constraint if exists offerpsp_telegram_intake_actio_lead_id_staff_user_id_action_key;

update private.offerpsp_telegram_intake_actions
set active=false
where active and (receipt is not null or consumed_at is not null or expires_at<=now());

create unique index if not exists offerpsp_telegram_intake_active_action_once
  on private.offerpsp_telegram_intake_actions(lead_id,staff_user_id,action)
  where active;

alter table private.offerpsp_telegram_intake_deliveries
  add column if not exists content_hash text,
  add column if not exists pending_content_hash text,
  add column if not exists refresh_status text not null default 'idle',
  add column if not exists refresh_token uuid,
  add column if not exists refresh_reason text,
  add column if not exists refresh_reserved_at timestamptz,
  add column if not exists refreshed_at timestamptz,
  add column if not exists revision integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table private.offerpsp_telegram_intake_deliveries
  drop constraint if exists offerpsp_telegram_intake_deliveries_refresh_status_check;
alter table private.offerpsp_telegram_intake_deliveries
  add constraint offerpsp_telegram_intake_deliveries_refresh_status_check
  check(refresh_status in ('idle','reserved','uncertain'));
alter table private.offerpsp_telegram_intake_deliveries
  drop constraint if exists offerpsp_telegram_intake_deliveries_revision_check;
alter table private.offerpsp_telegram_intake_deliveries
  add constraint offerpsp_telegram_intake_deliveries_revision_check check(revision>=1);

create or replace function private.offerpsp_telegram_intake_card_hash(p_card jsonb)
returns text language sql immutable strict set search_path=pg_catalog
as $$ select md5(p_card::text) $$;
revoke all on function private.offerpsp_telegram_intake_card_hash(jsonb)
  from public,anon,authenticated,service_role;

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
  if not found or v_lead.record_state <> 'active' or v_lead.status in ('closed','spam','won','lost') then
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

  update private.offerpsp_telegram_intake_actions
  set active=false
  where lead_id=p_lead_id and staff_user_id=v_operator.staff_user_id and active
    and (receipt is not null or consumed_at is not null or expires_at<=now());
  insert into private.offerpsp_telegram_intake_actions(lead_id,staff_user_id,chat_id,action)
    select p_lead_id,v_operator.staff_user_id,v_operator.chat_id,a
    from unnest(array['screen','matching','missing_draft','reply_draft','remind']) a
    on conflict(lead_id,staff_user_id,action) where active do nothing;

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
    'auto_reply',coalesce((select jsonb_build_object('status',r.status,'reply_class',r.reply_class,
      'reason_code',r.reason_code,'sent_at',r.sent_at,'updated_at',r.updated_at)
      from private.offerpsp_intake_auto_replies r where r.lead_id=p_lead_id),
      jsonb_build_object('status','waiting')),
    'actions',(select jsonb_object_agg(action,token) from private.offerpsp_telegram_intake_actions
      where lead_id=p_lead_id and staff_user_id=v_operator.staff_user_id
        and active and receipt is null and consumed_at is null and expires_at>now()));
end; $$;

create or replace function public.execute_offerpsp_telegram_intake_action(p_token uuid,p_from_id text,p_chat_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare
  v_auth jsonb; v_action private.offerpsp_telegram_intake_actions; v_lead public.offerpsp_leads;
  v_task public.offerpsp_tasks; v_receipt jsonb; v_result jsonb;
  v_claims text; v_body text; v_missing text[]; v_message text;
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
  if not v_action.active then v_receipt:=jsonb_build_object('outcome','superseded','message','Карточка уже обновлена. Используйте новые кнопки.');
  elsif v_action.expires_at<=now() then v_receipt:=jsonb_build_object('outcome','expired');
  elsif v_lead.record_state<>'active' or v_lead.status in ('closed','spam','won','lost') then
    v_receipt:=jsonb_build_object('outcome','inactive');
  else
    v_claims:=current_setting('request.jwt.claims',true);
    perform set_config('request.jwt.claims',(auth.jwt() || jsonb_build_object('sub',v_action.staff_user_id))::text,true);
    begin
      if v_action.action='screen' then
        v_result:=public.queue_offerpsp_pre_compliance_screening(v_lead.lead_id);
        v_message:=case v_result->>'outcome'
          when 'already_running' then 'Автопроверка уже выполняется. Новое событие не создано.'
          when 'cooldown' then 'Проверка недавно завершилась. Повтор станет доступен после защитной паузы.'
          else 'Автопроверка запущена. Результаты и причина решения появятся в обновлённой карточке и в рубке.' end;
        v_receipt:=jsonb_build_object('outcome','completed','message',v_message,'screening',v_result);
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
      v_receipt:=jsonb_build_object('outcome','failed','error_code',sqlstate,'message','Действие не выполнено. Проверьте карточку в Captain’s Bridge.');
    end;
    perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  end if;
  v_receipt:=v_receipt || jsonb_build_object('lead_id',v_action.lead_id,'action',v_action.action);
  update private.offerpsp_telegram_intake_actions
    set consumed_at=now(),receipt=v_receipt,active=false where token=p_token;
  insert into public.offerpsp_lead_activities(lead_id,actor_user_id,actor_type,activity_type,title,metadata)
    values(v_action.lead_id,v_action.staff_user_id,'staff','telegram_intake_action',
      'Telegram intake action: ' || v_action.action,jsonb_build_object('action',v_action.action,'receipt',v_receipt));
  return v_receipt;
end; $$;

create or replace function public.claim_offerpsp_telegram_intake_card_v2(
  p_lead_id uuid,
  p_reason text default 'state_change'
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare
  v_card jsonb; v_delivery private.offerpsp_telegram_intake_deliveries;
  v_hash text; v_token uuid; v_inserted uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Transport service access required'; end if;
  v_card:=public.prepare_offerpsp_telegram_intake_card(p_lead_id);
  if v_card->>'outcome'<>'ready' then return v_card; end if;
  v_hash:=private.offerpsp_telegram_intake_card_hash(v_card);
  select * into v_delivery from private.offerpsp_telegram_intake_deliveries where lead_id=p_lead_id for update;
  if not found then
    insert into private.offerpsp_telegram_intake_deliveries(
      lead_id,chat_id,status,pending_content_hash,refresh_reason,updated_at
    ) values(p_lead_id,v_card->>'chat_id','reserved',v_hash,left(coalesce(p_reason,'initial'),80),now())
    returning lead_id into v_inserted;
    insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
      values(p_lead_id,'system','telegram_intake_card_reserved','Operator card delivery started; awaiting Telegram receipt',
        jsonb_build_object('reason',left(coalesce(p_reason,'initial'),80)));
    return v_card || jsonb_build_object('delivery_mode','send','content_hash',v_hash,'revision',1);
  end if;
  if v_delivery.chat_id<>v_card->>'chat_id' then raise exception 'Delivery identity mismatch'; end if;
  if v_delivery.status<>'sent' or v_delivery.message_id is null then
    return jsonb_build_object('outcome','already_reserved','delivery_status',v_delivery.status);
  end if;
  if v_delivery.content_hash=v_hash then return jsonb_build_object('outcome','unchanged'); end if;
  if v_delivery.refresh_status='reserved' and v_delivery.pending_content_hash=v_hash
      and v_delivery.refresh_reserved_at>now()-interval '5 minutes' then
    return jsonb_build_object('outcome','already_reserved','delivery_status','refresh_reserved');
  end if;
  v_token:=gen_random_uuid();
  update private.offerpsp_telegram_intake_deliveries set
    refresh_status='reserved',refresh_token=v_token,pending_content_hash=v_hash,
    refresh_reason=left(coalesce(p_reason,'state_change'),80),refresh_reserved_at=now(),updated_at=now()
  where lead_id=p_lead_id;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'system','telegram_intake_card_refresh_reserved','Operator card refresh started',
      jsonb_build_object('reason',left(coalesce(p_reason,'state_change'),80),'next_revision',v_delivery.revision+1));
  return v_card || jsonb_build_object('delivery_mode','edit','message_id',v_delivery.message_id,
    'refresh_token',v_token,'content_hash',v_hash,'revision',v_delivery.revision+1);
end; $$;

create or replace function public.complete_offerpsp_telegram_intake_card_v2(
  p_lead_id uuid,p_chat_id text,p_message_id text,p_content_hash text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare v_delivery private.offerpsp_telegram_intake_deliveries; begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Transport service access required'; end if;
  if p_message_id is null or p_message_id !~ '^[1-9][0-9]{0,18}$' then raise exception 'Telegram message receipt required'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{32}$' then raise exception 'Telegram card content receipt required'; end if;
  perform 1 from public.offerpsp_leads where lead_id=p_lead_id for update;
  select * into v_delivery from private.offerpsp_telegram_intake_deliveries where lead_id=p_lead_id for update;
  if not found or v_delivery.chat_id<>p_chat_id then raise exception 'Delivery identity mismatch'; end if;
  if v_delivery.status='sent' then
    if v_delivery.message_id<>p_message_id then raise exception 'Conflicting delivery receipt'; end if;
    return jsonb_build_object('outcome','already_recorded');
  end if;
  if v_delivery.pending_content_hash<>p_content_hash then raise exception 'Delivery content receipt mismatch'; end if;
  update private.offerpsp_telegram_intake_deliveries set status='sent',message_id=p_message_id,
    content_hash=p_content_hash,pending_content_hash=null,completed_at=now(),updated_at=now()
  where lead_id=p_lead_id;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'system','telegram_intake_card_sent','Operator card delivered',
      jsonb_build_object('message_id',p_message_id,'revision',1));
  return jsonb_build_object('outcome','recorded','revision',1);
end; $$;

create or replace function public.complete_offerpsp_telegram_intake_card_refresh(
  p_lead_id uuid,p_chat_id text,p_message_id text,p_refresh_token uuid,p_content_hash text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private
as $$ declare v_delivery private.offerpsp_telegram_intake_deliveries; v_revision integer; begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Transport service access required'; end if;
  if p_message_id is null or p_message_id !~ '^[1-9][0-9]{0,18}$' then raise exception 'Telegram message receipt required'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{32}$' then raise exception 'Telegram card content receipt required'; end if;
  perform 1 from public.offerpsp_leads where lead_id=p_lead_id for update;
  select * into v_delivery from private.offerpsp_telegram_intake_deliveries where lead_id=p_lead_id for update;
  if not found or v_delivery.status<>'sent' or v_delivery.chat_id<>p_chat_id or v_delivery.message_id<>p_message_id then
    raise exception 'Refresh delivery identity mismatch';
  end if;
  if v_delivery.content_hash=p_content_hash and v_delivery.refresh_status='idle' then
    return jsonb_build_object('outcome','already_recorded','revision',v_delivery.revision);
  end if;
  if v_delivery.refresh_status<>'reserved' or v_delivery.refresh_token<>p_refresh_token
      or v_delivery.pending_content_hash<>p_content_hash then raise exception 'Refresh receipt mismatch'; end if;
  v_revision:=v_delivery.revision+1;
  update private.offerpsp_telegram_intake_deliveries set content_hash=p_content_hash,
    pending_content_hash=null,refresh_status='idle',refresh_token=null,refreshed_at=now(),
    revision=v_revision,updated_at=now()
  where lead_id=p_lead_id;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'system','telegram_intake_card_refreshed','Operator card refreshed',
      jsonb_build_object('message_id',p_message_id,'revision',v_revision,'reason',v_delivery.refresh_reason));
  return jsonb_build_object('outcome','recorded','revision',v_revision);
end; $$;

revoke all on function public.prepare_offerpsp_telegram_intake_card(uuid) from public,anon,authenticated;
revoke all on function public.execute_offerpsp_telegram_intake_action(uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_offerpsp_telegram_intake_card_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.complete_offerpsp_telegram_intake_card_v2(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_offerpsp_telegram_intake_card_refresh(uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_offerpsp_telegram_intake_card(uuid) to service_role;
grant execute on function public.execute_offerpsp_telegram_intake_action(uuid,text,text) to service_role;
grant execute on function public.claim_offerpsp_telegram_intake_card_v2(uuid,text) to service_role;
grant execute on function public.complete_offerpsp_telegram_intake_card_v2(uuid,text,text,text) to service_role;
grant execute on function public.complete_offerpsp_telegram_intake_card_refresh(uuid,text,text,uuid,text) to service_role;
