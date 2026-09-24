-- Correct the first-response gate after the controlled production smoke.
-- Operational timestamps, activity logging and task bookkeeping must not make a
-- successfully screened lead stale. Merchant/business facts still fail closed.
create or replace function private.offerpsp_intake_auto_reply_source_hash(p_lead_id uuid)
returns text language sql volatile security definer set search_path=''
as $$
  select md5(jsonb_build_object(
    'lead', jsonb_build_object(
      'id',l.lead_id,'name',l.name,'email',lower(trim(l.work_email)),'telegram',l.telegram,
      'company',l.company,'company_url',l.company_url,'vertical',l.vertical,
      'monthly_volume',l.monthly_volume,'geos',l.geos,'methods',l.methods,'details',l.details,
      'registration_geo',l.registration_geo,'target_geos',l.target_geos,
      'requested_currencies',l.requested_currencies,'requested_flows',l.requested_flows,
      'requested_methods',l.requested_methods,'traffic_types',l.traffic_types,
      'expected_monthly_volume',l.expected_monthly_volume,'volume_currency',l.volume_currency,
      'min_transaction_amount',l.min_transaction_amount,'max_transaction_amount',l.max_transaction_amount,
      'transaction_currency',l.transaction_currency,'business_model',l.business_model,
      'license_status',l.license_status,'license_jurisdiction',l.license_jurisdiction,
      'license_number',l.license_number,'license_evidence_url',l.license_evidence_url,
      'launch_timeline',l.launch_timeline,'current_processing_setup',l.current_processing_setup,
      'qualification_notes',l.qualification_notes,'status',l.status,'record_state',l.record_state,
      'source',l.source,'consent',l.consent
    ),
    'case', jsonb_build_object(
      'status',c.case_status,'risk',c.risk_level,'missing',c.missing_information,
      'red_flags',c.red_flags,'screened_at',c.last_screened_at,
      'result_hash',c.screening_result_hash,'completed_run_id',c.screening_completed_run_id
    )
  )::text)
  from public.offerpsp_leads l
  join private.offerpsp_compliance_cases c using(lead_id)
  where l.lead_id=p_lead_id;
$$;
revoke all on function private.offerpsp_intake_auto_reply_source_hash(uuid)
  from public, anon, authenticated, service_role;

-- The live screening worker stores Russian labels in upper case. Return a
-- canonical spelling to the already deployed API while retaining unknown labels
-- unchanged so both validation layers can reject them.
create or replace function private.offerpsp_intake_auto_reply_canonical_missing(p_missing text[])
returns text[] language sql immutable security definer set search_path=''
as $$
  select coalesce(array_agg(case upper(trim(item))
    when 'ЮРИДИЧЕСКОЕ ЛИЦО И РЕГИСТРАЦИОННЫЕ ДАННЫЕ' then 'Юридическое лицо и регистрационные данные'
    when 'САЙТ КОМПАНИИ / ПРОДУКТА' then 'Сайт компании / продукта'
    when 'КОНТАКТ ПРЕДСТАВИТЕЛЯ' then 'Контакт представителя'
    when 'ВЕРТИКАЛЬ БИЗНЕСА' then 'Вертикаль бизнеса'
    when 'ЦЕЛЕВЫЕ GEO' then 'Целевые GEO'
    when 'ПЛАТЁЖНЫЕ МЕТОДЫ' then 'Платёжные методы'
    when 'ОЖИДАЕМЫЙ МЕСЯЧНЫЙ ОБЪЁМ' then 'Ожидаемый месячный объём'
    when 'ВАЛЮТЫ ОБРАБОТКИ' then 'Валюты обработки'
    when 'ТРЕБОВАНИЯ PAYIN / PAYOUT' then 'Требования PayIn / PayOut'
    when 'ЛИЦЕНЗИЯ, ЮРИСДИКЦИЯ И ССЫЛКА НА РЕЕСТР ЛИБО ОБОСНОВАНИЕ НЕПРИМЕНИМОСТИ' then 'Лицензия, юрисдикция и ссылка на реестр либо обоснование неприменимости'
    when 'ПОДТВЕРЖДЕНИЕ ЮРИДИЧЕСКОГО ЛИЦА И ПОЛНОМОЧИЙ ПРЕДСТАВИТЕЛЯ' then 'Подтверждение юридического лица и полномочий представителя'
    when 'МЕРЧАНТЫ, ИХ САЙТЫ И ПОЛНОМОЧИЯ ПРЕДСТАВИТЕЛЯ ПО КАЖДОМУ' then 'Мерчанты, их сайты и полномочия представителя по каждому'
    else item end order by ord), '{}'::text[])
  from unnest(coalesce(p_missing, '{}'::text[])) with ordinality as missing(item, ord);
$$;
revoke all on function private.offerpsp_intake_auto_reply_canonical_missing(text[])
  from public, anon, authenticated, service_role;

create or replace function private.offerpsp_intake_auto_reply_expected_message(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_missing text[]; v_item text; v_label text; v_labels text[]:='{}'; v_subject text; v_body text;
begin
  select c.missing_information into v_missing
  from private.offerpsp_compliance_cases c where c.lead_id=p_lead_id;
  if not found then return jsonb_build_object('valid',false,'reason_code','screening_not_current'); end if;
  foreach v_item in array coalesce(v_missing,'{}'::text[]) loop
    v_label:=case upper(trim(v_item))
      when 'ЮРИДИЧЕСКОЕ ЛИЦО И РЕГИСТРАЦИОННЫЕ ДАННЫЕ' then 'Legal entity name, registration number, country and registered address'
      when 'САЙТ КОМПАНИИ / ПРОДУКТА' then 'Company or product website'
      when 'КОНТАКТ ПРЕДСТАВИТЕЛЯ' then 'Primary company contact and their role'
      when 'ВЕРТИКАЛЬ БИЗНЕСА' then 'Business vertical and product description'
      when 'ЦЕЛЕВЫЕ GEO' then 'Target countries or regions'
      when 'ПЛАТЁЖНЫЕ МЕТОДЫ' then 'Required payment methods'
      when 'ОЖИДАЕМЫЙ МЕСЯЧНЫЙ ОБЪЁМ' then 'Expected monthly processing volume'
      when 'ВАЛЮТЫ ОБРАБОТКИ' then 'Processing currencies'
      when 'ТРЕБОВАНИЯ PAYIN / PAYOUT' then 'Whether you need pay-ins, payouts, or both'
      when 'ЛИЦЕНЗИЯ, ЮРИСДИКЦИЯ И ССЫЛКА НА РЕЕСТР ЛИБО ОБОСНОВАНИЕ НЕПРИМЕНИМОСТИ' then 'Licence jurisdiction, licence number and regulator-register link, or why a licence is not applicable'
      when 'ПОДТВЕРЖДЕНИЕ ЮРИДИЧЕСКОГО ЛИЦА И ПОЛНОМОЧИЙ ПРЕДСТАВИТЕЛЯ' then 'Evidence of the legal entity and the representative''s authority'
      when 'МЕРЧАНТЫ, ИХ САЙТЫ И ПОЛНОМОЧИЯ ПРЕДСТАВИТЕЛЯ ПО КАЖДОМУ' then 'For each represented merchant: company name, website and evidence of your authority to represent them'
      else null end;
    if v_label is null then return jsonb_build_object('valid',false,'reason_code','unknown_missing_fact'); end if;
    v_labels:=array_append(v_labels,v_label);
  end loop;
  if coalesce(cardinality(v_missing),0)>0 then
    v_subject:='A few details for your OfferPSP request';
    v_body:='Thank you for contacting OfferPSP. We received your request and need a few details before we can prepare the next step.'
      ||E'\n\nPlease reply with:\n- '||array_to_string(v_labels,E'\n- ')
      ||E'\n\nYou can reply directly to this email. Please do not send passwords, card data or other payment credentials.';
  else
    v_subject:='We received your OfferPSP request';
    v_body:='Thank you for contacting OfferPSP. We received your request and have started the initial review.'
      ||E'\n\nWe will contact you by email if we need any additional information. No payment provider has been selected or approved at this stage.';
  end if;
  v_body:=v_body||E'\n\nBest regards,\nOfferPSP team\nhttps://offerpsp.com';
  return jsonb_build_object('valid',true,'subject',v_subject,'body',v_body,
    'reply_class',case when coalesce(cardinality(v_missing),0)>0 then 'missing_information' else 'acknowledgement' end);
end;
$$;
revoke all on function private.offerpsp_intake_auto_reply_expected_message(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.prepare_offerpsp_intake_auto_reply(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_lead public.offerpsp_leads; v_case private.offerpsp_compliance_cases;
  v_task public.offerpsp_tasks; v_existing private.offerpsp_intake_auto_replies;
  v_hash text; v_reason text; v_class text; v_duplicates integer;
  v_email_configuration jsonb; v_previous_status text; v_previous_reason text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id for update;
  if not found then raise exception 'OfferPSP lead not found'; end if;
  select * into v_case from private.offerpsp_compliance_cases where lead_id=p_lead_id for update;
  select * into v_task from public.offerpsp_tasks
    where lead_id=p_lead_id and automation_ref='intake_response_v1' for update;
  select * into v_existing from private.offerpsp_intake_auto_replies where lead_id=p_lead_id for update;

  v_hash:=private.offerpsp_intake_auto_reply_source_hash(p_lead_id);
  if v_existing.lead_id is null then
    return jsonb_build_object('outcome','review_required','reason_code','auto_reply_not_queued');
  elsif v_existing.status='sent' then
    return jsonb_build_object('outcome','already_sent','draft_id',v_existing.draft_id,'source_hash',v_existing.source_hash);
  elsif v_existing.status in ('claimed','uncertain') then
    return jsonb_build_object('outcome',v_existing.status,'reason_code',v_existing.reason_code,
      'draft_id',v_existing.draft_id,'source_hash',v_existing.source_hash);
  elsif v_existing.status<>'queued' then
    return jsonb_build_object('outcome',v_existing.status,'reason_code',v_existing.reason_code,
      'draft_id',v_existing.draft_id,'source_hash',v_existing.source_hash);
  end if;

  select count(*) into v_duplicates from public.offerpsp_leads other
    where other.lead_id<>p_lead_id and other.record_state='active' and other.status<>'spam'
      and (lower(trim(other.work_email))=lower(trim(v_lead.work_email))
        or (nullif(trim(v_lead.company_url),'') is not null
          and lower(rtrim(trim(other.company_url),'/'))=lower(rtrim(trim(v_lead.company_url),'/'))));
  select configuration into v_email_configuration
  from private.offerpsp_integration_settings where integration_key='email' and enabled;

  if v_lead.record_state<>'active' or v_lead.status in ('closed','spam','won','lost') then v_reason:='inactive_lead';
  elsif coalesce(v_lead.source,'')<>'offerpsp.com' then v_reason:='source_not_allowlisted';
  elsif not v_lead.consent then v_reason:='consent_not_recorded';
  elsif lower(trim(v_lead.work_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_reason:='invalid_recipient';
  elsif v_case.id is null or v_case.case_status<>'manual_review' or v_case.last_screened_at is null
      or v_case.screening_completed_run_id is null or v_case.screening_result_hash is null then v_reason:='screening_not_current';
  elsif v_hash is null or v_existing.source_hash is distinct from v_hash then v_reason:='screening_stale';
  elsif v_case.risk_level in ('high','critical') or jsonb_array_length(coalesce(v_case.red_flags,'[]'::jsonb))>0 then v_reason:='risk_requires_review';
  elsif v_task.id is null or v_task.status not in ('pending','in_progress') then v_reason:='response_task_inactive';
  elsif v_duplicates>0 then v_reason:='possible_duplicate';
  elsif v_email_configuration is null then v_reason:='email_channel_disabled';
  elsif not exists(select 1 from private.offerpsp_integration_settings where integration_key='n8n' and enabled
      and coalesce((configuration->>'operations_enabled')::boolean,false)) then v_reason:='automation_disabled';
  elsif exists(select 1 from public.offerpsp_email_threads th join public.offerpsp_email_messages m on m.thread_id=th.id
      where th.lead_id=p_lead_id and m.direction='outbound' and m.delivery_status='sent') then v_reason:='prior_outbound_exists';
  end if;
  v_class:=case when coalesce(cardinality(v_case.missing_information),0)>0 then 'missing_information' else 'acknowledgement' end;
  v_previous_status:=v_existing.status; v_previous_reason:=v_existing.reason_code;

  update private.offerpsp_intake_auto_replies set reply_class=v_class,
    status=case when v_reason is null then 'queued' else 'review_required' end,
    reason_code=v_reason,updated_at=now(),
    metadata=jsonb_build_object('policy','intake-first-response-v1',
      'missing_count',coalesce(cardinality(v_case.missing_information),0))
  where lead_id=p_lead_id and status='queued';
  if v_previous_status is distinct from (case when v_reason is null then 'queued' else 'review_required' end)
      or v_previous_reason is distinct from v_reason then
    insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'aibot',case when v_reason is null then 'intake_auto_reply_ready' else 'intake_auto_reply_review_required' end,
      case when v_reason is null then 'Automatic first response passed policy gates' else 'Automatic first response needs staff review' end,
      jsonb_strip_nulls(jsonb_build_object('reply_class',v_class,'reason_code',v_reason,'policy','intake-first-response-v1')));
  end if;
  if v_reason is not null then
    return jsonb_build_object('outcome','review_required','reason_code',v_reason,
      'source_hash',v_existing.source_hash,'reply_class',v_class);
  end if;
  return jsonb_build_object('outcome','ready','source_hash',v_existing.source_hash,'reply_class',v_class,
    'to_email',lower(trim(v_lead.work_email)),
    'missing_information',private.offerpsp_intake_auto_reply_canonical_missing(v_case.missing_information),
    'email_configuration',coalesce(v_email_configuration,'{}'::jsonb));
end;
$$;

create or replace function private.offerpsp_enqueue_intake_auto_reply()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_hash text;
begin
  if new.case_status='manual_review'
      and new.screening_completed_run_id is not null and new.screening_result_hash is not null
      and (old.case_status is distinct from new.case_status
        or old.screening_completed_run_id is distinct from new.screening_completed_run_id) then
    v_hash:=coalesce(private.offerpsp_intake_auto_reply_source_hash(new.lead_id),md5(new.lead_id::text));
    insert into private.offerpsp_intake_auto_replies(lead_id,source_hash,reply_class,status,metadata)
    values(new.lead_id,v_hash,case when coalesce(cardinality(new.missing_information),0)>0
      then 'missing_information' else 'acknowledgement' end,'queued',
      jsonb_build_object('policy','intake-first-response-v1','queued_by','screening_completion'))
    on conflict(lead_id) do update set source_hash=excluded.source_hash,
      reply_class=excluded.reply_class,status='queued',reason_code=null,updated_at=now(),
      draft_id=null,delivery_attempt_id=null,claimed_at=null,sent_at=null,metadata=excluded.metadata
    where private.offerpsp_intake_auto_replies.status in ('queued','review_required','cancelled')
      and private.offerpsp_intake_auto_replies.source_hash is distinct from excluded.source_hash;
  end if;
  return new;
end;
$$;
revoke all on function private.offerpsp_enqueue_intake_auto_reply()
  from public,anon,authenticated,service_role;

drop trigger if exists offerpsp_enqueue_intake_auto_reply on private.offerpsp_compliance_cases;
create trigger offerpsp_enqueue_intake_auto_reply
after update of case_status,screening_completed_run_id,screening_result_hash
on private.offerpsp_compliance_cases
for each row execute function private.offerpsp_enqueue_intake_auto_reply();

revoke all on function public.prepare_offerpsp_intake_auto_reply(uuid) from public,anon,authenticated;
grant execute on function public.prepare_offerpsp_intake_auto_reply(uuid) to service_role;
