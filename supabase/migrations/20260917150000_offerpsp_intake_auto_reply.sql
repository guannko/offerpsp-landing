-- One fail-closed first response per new public intake. This is a transactional
-- acknowledgement / missing-information lane, not matching, approval or advice.
create table private.offerpsp_intake_auto_replies (
  lead_id uuid primary key references public.offerpsp_leads(lead_id) on delete cascade,
  source_hash text not null,
  reply_class text check (reply_class in ('acknowledgement', 'missing_information')),
  status text not null check (status in ('queued', 'claimed', 'sent', 'review_required', 'uncertain', 'cancelled')),
  reason_code text,
  draft_id bigint unique references public.email_drafts(id) on delete set null,
  delivery_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
alter table private.offerpsp_intake_auto_replies enable row level security;
revoke all on table private.offerpsp_intake_auto_replies from public, anon, authenticated, service_role;

create index offerpsp_intake_auto_replies_status_idx
  on private.offerpsp_intake_auto_replies(status, updated_at desc);

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

-- Build the only two message shapes accepted by the database. The API performs
-- its own independent preflight, then this function verifies the exact same
-- canonical facts again before a draft can be claimed for delivery.
create or replace function private.offerpsp_intake_auto_reply_expected_message(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_missing text[];
  v_item text;
  v_label text;
  v_labels text[]:='{}';
  v_subject text;
  v_body text;
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
  v_lead public.offerpsp_leads;
  v_case private.offerpsp_compliance_cases;
  v_task public.offerpsp_tasks;
  v_existing private.offerpsp_intake_auto_replies;
  v_hash text;
  v_reason text;
  v_class text;
  v_duplicates integer;
  v_email_configuration jsonb;
  v_previous_status text;
  v_previous_reason text;
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
create trigger offerpsp_enqueue_intake_auto_reply
after update of case_status,screening_completed_run_id,screening_result_hash
on private.offerpsp_compliance_cases
for each row execute function private.offerpsp_enqueue_intake_auto_reply();

create or replace function public.claim_offerpsp_pending_intake_auto_reply()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_lead_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  select lead_id into v_lead_id from private.offerpsp_intake_auto_replies
    where status='queued' and coalesce((metadata->>'recovery_claimed_at')::timestamptz,'-infinity') < now()-interval '10 minutes'
    order by created_at for update skip locked limit 1;
  if v_lead_id is null then return jsonb_build_object('outcome','empty'); end if;
  update private.offerpsp_intake_auto_replies set updated_at=now(),
    metadata=metadata||jsonb_build_object('recovery_claimed_at',now()) where lead_id=v_lead_id;
  return jsonb_build_object('outcome','claimed','lead_id',v_lead_id);
end;
$$;

create or replace function public.block_offerpsp_intake_auto_reply(
  p_lead_id uuid,p_source_hash text,p_reason_code text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row private.offerpsp_intake_auto_replies;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if p_reason_code not in ('unknown_missing_fact','missing_fact_list_empty','acknowledgement_has_missing_facts',
      'message_not_built','invalid_recipient','invalid_candidate','invalid_message_size','missing_direct_answer',
      'invalid_signature','restricted_claim','fact_mismatch','unverified_extra_fact') then
    raise exception 'Unsupported validation reason';
  end if;
  update private.offerpsp_intake_auto_replies set status='review_required',reason_code=p_reason_code,
    updated_at=now(),metadata=metadata||jsonb_build_object('content_validation','failed')
  where lead_id=p_lead_id and source_hash=p_source_hash and status='queued' returning * into v_row;
  if not found then return jsonb_build_object('outcome','stale_or_locked'); end if;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'aibot','intake_auto_reply_review_required','Automatic first response needs staff review',
      jsonb_build_object('reason_code',p_reason_code,'policy','intake-first-response-v1'));
  return jsonb_build_object('outcome','review_required','reason_code',p_reason_code,'source_hash',p_source_hash);
end;
$$;

create or replace function public.claim_offerpsp_intake_auto_reply(
  p_lead_id uuid,p_source_hash text,p_reply_class text,p_subject text,p_body text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_candidate jsonb; v_lead public.offerpsp_leads; v_row private.offerpsp_intake_auto_replies;
  v_draft public.email_drafts; v_attempt uuid:=gen_random_uuid(); v_configuration jsonb; v_expected jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  v_candidate:=public.prepare_offerpsp_intake_auto_reply(p_lead_id);
  if v_candidate->>'outcome'<>'ready' then return v_candidate; end if;
  if v_candidate->>'source_hash'<>p_source_hash or v_candidate->>'reply_class'<>p_reply_class then
    return jsonb_build_object('outcome','review_required','reason_code','source_changed');
  end if;
  v_expected:=private.offerpsp_intake_auto_reply_expected_message(p_lead_id);
  if coalesce((v_expected->>'valid')::boolean,false) is not true then
    return public.block_offerpsp_intake_auto_reply(p_lead_id,p_source_hash,
      coalesce(v_expected->>'reason_code','unknown_missing_fact'));
  end if;
  if p_reply_class is distinct from v_expected->>'reply_class'
      or trim(p_subject) is distinct from v_expected->>'subject'
      or p_body is distinct from v_expected->>'body' then
    return public.block_offerpsp_intake_auto_reply(p_lead_id,p_source_hash,'fact_mismatch');
  end if;
  if nullif(trim(p_subject),'') is null or char_length(trim(p_subject))>120
      or nullif(trim(p_body),'') is null or char_length(p_body)>6000
      or p_body not like 'Thank you for contacting OfferPSP. We received your request%'
      or p_body not like '%Best regards,%OfferPSP team%https://offerpsp.com' then
    return public.block_offerpsp_intake_auto_reply(p_lead_id,p_source_hash,'invalid_message_size');
  end if;
  if (p_reply_class='missing_information' and trim(p_subject)<>'A few details for your OfferPSP request')
      or (p_reply_class='acknowledgement' and trim(p_subject)<>'We received your OfferPSP request')
      or p_body ~* '\m(guarantee(d)?|approved by|provider accepted|we selected|we matched you|commission|revenue share|our margin|legal advice|contract terms|licen[cs]e verified)\M' then
    return public.block_offerpsp_intake_auto_reply(p_lead_id,p_source_hash,'restricted_claim');
  end if;

  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id for update;
  select * into v_row from private.offerpsp_intake_auto_replies where lead_id=p_lead_id for update;
  if v_row.status<>'queued' or v_row.source_hash<>p_source_hash then
    return jsonb_build_object('outcome','stale_or_locked','status',v_row.status);
  end if;
  v_configuration:=v_candidate->'email_configuration';
  insert into public.email_drafts(chat_id,lead_internal_id,to_email,subject,body,status)
    values('autopilot:intake:'||p_lead_id::text,p_lead_id::text,lower(trim(v_lead.work_email)),trim(p_subject),p_body,'sending')
    returning * into v_draft;
  update public.offerpsp_email_messages set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'delivery_attempt_id',v_attempt,'delivery_attempt_state','claimed','delivery_attempt_started_at',now(),
      'automation','intake-first-response-v1','reply_class',p_reply_class,'source_hash',p_source_hash)
    where source_draft_id=v_draft.id;
  update private.offerpsp_intake_auto_replies set status='claimed',draft_id=v_draft.id,
    delivery_attempt_id=v_attempt,claimed_at=now(),updated_at=now(),reason_code=null,
    metadata=metadata||jsonb_build_object('content_validation','passed') where lead_id=p_lead_id;
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(p_lead_id,'aibot','intake_auto_reply_claimed','Automatic first response delivery started',
      jsonb_build_object('draft_id',v_draft.id,'reply_class',p_reply_class,'policy','intake-first-response-v1'));
  return jsonb_build_object('outcome','claimed','draft_id',v_draft.id,'attempt_id',v_attempt,
    'to_email',v_draft.to_email,'subject',v_draft.subject,'body',v_draft.body,
    'lead_internal_id',v_draft.lead_internal_id,'email_configuration',coalesce(v_configuration,'{}'::jsonb));
end;
$$;

create or replace function public.complete_offerpsp_intake_auto_reply(
  p_draft_id bigint,p_attempt_id uuid,p_external_message_id text default null,p_provider text default 'smtp',
  p_archive_status text default 'skipped',p_archive_error text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_row private.offerpsp_intake_auto_replies; v_draft public.email_drafts;
  v_message public.offerpsp_email_messages; v_external text:=nullif(trim(p_external_message_id),'');
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if lower(p_provider) not in ('smtp','brevo') or lower(p_archive_status) not in ('archived','duplicate','failed','skipped') then
    raise exception 'Unsupported delivery receipt';
  end if;
  if v_external is not null and (char_length(v_external)>320 or v_external !~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$') then
    raise exception 'Invalid external Message-ID';
  end if;
  select * into v_row from private.offerpsp_intake_auto_replies where draft_id=p_draft_id for update;
  if not found or v_row.delivery_attempt_id is distinct from p_attempt_id then raise exception 'Delivery attempt mismatch'; end if;
  if v_row.status='sent' then return jsonb_build_object('success',true,'outcome','already_sent','draft_id',p_draft_id); end if;
  if v_row.status<>'claimed' then raise exception 'Automatic reply is not claimed'; end if;
  select * into v_draft from public.email_drafts where id=p_draft_id for update;
  select * into v_message from public.offerpsp_email_messages where source_draft_id=p_draft_id for update;
  if v_draft.id is null or v_message.id is null
      or nullif(v_message.metadata->>'delivery_attempt_id','') is distinct from p_attempt_id::text then
    raise exception 'Canonical email journal mismatch';
  end if;
  update public.email_drafts set status='sent' where id=p_draft_id;
  update public.offerpsp_email_messages set external_message_id=coalesce(v_external,external_message_id),
    provider=lower(p_provider),delivery_status='sent',sent_at=coalesce(sent_at,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
      'sent_archive_status',lower(p_archive_status),'sent_archive_error',left(nullif(trim(p_archive_error),''),2000),
      'delivery_attempt_state','accepted','delivery_receipt_recorded_at',now())) where id=v_message.id;
  update private.offerpsp_intake_auto_replies set status='sent',sent_at=now(),updated_at=now(),reason_code=null
    where lead_id=v_row.lead_id;
  update public.offerpsp_tasks set status='done',completed_at=coalesce(completed_at,now()),updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('external_send_authorized',true,
      'automation_completed_by','intake-first-response-v1','draft_id',p_draft_id)
    where lead_id=v_row.lead_id and automation_ref='intake_response_v1' and status in ('pending','in_progress');
  insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
    values(v_row.lead_id,'aibot','intake_auto_reply_sent','Automatic first response sent',
      jsonb_build_object('draft_id',p_draft_id,'message_id',v_message.id,'reply_class',v_row.reply_class,
        'sent_archive_status',lower(p_archive_status),'policy','intake-first-response-v1'));
  return jsonb_build_object('success',true,'outcome','sent','draft_id',p_draft_id,'message_id',v_message.id,
    'external_message_id',v_external,'sent_archive_status',lower(p_archive_status));
end;
$$;

create or replace function public.mark_offerpsp_intake_auto_reply_uncertain(
  p_draft_id bigint,p_attempt_id uuid,p_error text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row private.offerpsp_intake_auto_replies; v_message public.offerpsp_email_messages;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  select * into v_row from private.offerpsp_intake_auto_replies where draft_id=p_draft_id for update;
  if not found or v_row.delivery_attempt_id is distinct from p_attempt_id then raise exception 'Delivery attempt mismatch'; end if;
  if v_row.status='sent' then return jsonb_build_object('success',true,'outcome','sent'); end if;
  select * into v_message from public.offerpsp_email_messages where source_draft_id=p_draft_id for update;
  if v_message.id is null or nullif(v_message.metadata->>'delivery_attempt_id','') is distinct from p_attempt_id::text then
    raise exception 'Canonical email journal mismatch';
  end if;
  update public.offerpsp_email_messages set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'delivery_attempt_state','uncertain','delivery_attempt_error',left(nullif(trim(p_error),''),2000),
    'delivery_attempt_updated_at',now())) where id=v_message.id;
  if v_row.status<>'uncertain' then
    update private.offerpsp_intake_auto_replies set status='uncertain',reason_code='delivery_uncertain',updated_at=now()
      where lead_id=v_row.lead_id;
    insert into public.offerpsp_lead_activities(lead_id,actor_type,activity_type,title,metadata)
      values(v_row.lead_id,'aibot','intake_auto_reply_uncertain','Automatic first response delivery is uncertain',
        jsonb_build_object('draft_id',p_draft_id,'reason_code','delivery_uncertain','policy','intake-first-response-v1'));
  end if;
  return jsonb_build_object('success',true,'outcome','uncertain','draft_id',p_draft_id);
end;
$$;

revoke all on function public.prepare_offerpsp_intake_auto_reply(uuid) from public,anon,authenticated;
revoke all on function public.claim_offerpsp_pending_intake_auto_reply() from public,anon,authenticated;
revoke all on function public.block_offerpsp_intake_auto_reply(uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_offerpsp_intake_auto_reply(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_offerpsp_intake_auto_reply(bigint,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.mark_offerpsp_intake_auto_reply_uncertain(bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_offerpsp_intake_auto_reply(uuid) to service_role;
grant execute on function public.claim_offerpsp_pending_intake_auto_reply() to service_role;
grant execute on function public.block_offerpsp_intake_auto_reply(uuid,text,text) to service_role;
grant execute on function public.claim_offerpsp_intake_auto_reply(uuid,text,text,text,text) to service_role;
grant execute on function public.complete_offerpsp_intake_auto_reply(bigint,uuid,text,text,text,text) to service_role;
grant execute on function public.mark_offerpsp_intake_auto_reply_uncertain(bigint,uuid,text) to service_role;

-- Extend the already accepted staff display with the new bounded outbound state.
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
    'auto_reply',(select jsonb_build_object('status',r.status,'reply_class',r.reply_class,
      'reason_code',r.reason_code,'draft_id',r.draft_id,'created_at',r.created_at,'updated_at',r.updated_at,
      'claimed_at',r.claimed_at,'sent_at',r.sent_at) from private.offerpsp_intake_auto_replies r where r.lead_id=p_lead_id),
    'actions',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'at',a.consumed_at,
      'outcome',a.receipt->>'outcome','message',a.receipt->>'message','error_code',a.receipt->>'error_code') order by a.consumed_at desc)
      from private.offerpsp_telegram_intake_actions a where a.lead_id=p_lead_id and a.consumed_at is not null),'[]'::jsonb),
    'match_count',(select count(*) from private.offerpsp_route_matches where lead_id=p_lead_id),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from (
      select id,created_at,actor_type,activity_type,title,
        case when activity_type='telegram_intake_action' then metadata->'receipt'->>'message'
          when activity_type like 'intake_auto_reply_%' then metadata->>'reason_code' else null end as detail,
        case when activity_type='telegram_intake_action' then metadata->'receipt'->>'outcome'
          when activity_type='intake_auto_reply_sent' then 'sent'
          when activity_type='intake_auto_reply_uncertain' then 'uncertain'
          when activity_type='intake_auto_reply_review_required' then 'review_required' else null end as outcome
      from public.offerpsp_lead_activities where lead_id=p_lead_id
      order by created_at desc,id desc limit 100) e),'[]'::jsonb),
    'event_count',(select count(*) from public.offerpsp_lead_activities where lead_id=p_lead_id)
  );
end; $$;
revoke all on function public.get_offerpsp_intake_observability(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_offerpsp_intake_observability(uuid) to authenticated;
