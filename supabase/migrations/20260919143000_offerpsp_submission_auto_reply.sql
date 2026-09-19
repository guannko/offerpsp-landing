-- A company has one merchant card, but every non-replayed public submission
-- has its own safe receipt. This lets a second verified manager receive an
-- acknowledgement without creating another company card or reusing the first
-- manager's delivery state.

create table private.offerpsp_intake_submission_replies (
  submission_id uuid primary key references private.offerpsp_intake_submissions(id) on delete cascade,
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  recipient_email text not null,
  source_hash text not null,
  reply_class text not null default 'acknowledgement'
    check (reply_class = 'acknowledgement'),
  status text not null default 'queued'
    check (status in ('queued','claimed','sent','review_required','uncertain','cancelled')),
  reason_code text,
  draft_id bigint unique references public.email_drafts(id) on delete set null,
  delivery_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table private.offerpsp_intake_submission_replies enable row level security;
revoke all on table private.offerpsp_intake_submission_replies
  from public, anon, authenticated, service_role;

create index offerpsp_intake_submission_replies_queue_idx
  on private.offerpsp_intake_submission_replies(status, created_at)
  where status in ('queued','claimed','review_required','uncertain');
create index offerpsp_intake_submission_replies_lead_idx
  on private.offerpsp_intake_submission_replies(lead_id, created_at desc);

create or replace function private.offerpsp_enqueue_intake_submission_reply()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into private.offerpsp_intake_submission_replies(
    submission_id,lead_id,recipient_email,source_hash,metadata
  ) values (
    new.id,new.lead_id,lower(trim(new.submitted_email)),new.request_hash,
    jsonb_build_object(
      'policy','intake-submission-receipt-v1',
      'disposition',new.disposition,
      'match_strategy',new.match_strategy,
      'queued_by','submission_insert'
    )
  ) on conflict(submission_id) do nothing;
  return new;
end;
$$;
revoke all on function private.offerpsp_enqueue_intake_submission_reply()
  from public, anon, authenticated, service_role;

create trigger offerpsp_enqueue_intake_submission_reply
after insert on private.offerpsp_intake_submissions
for each row execute function private.offerpsp_enqueue_intake_submission_reply();

create or replace function private.offerpsp_intake_submission_reply_expected_message()
returns jsonb language sql immutable security definer set search_path=''
as $$
  select jsonb_build_object(
    'valid',true,
    'reply_class','acknowledgement',
    'subject','We received your OfferPSP request',
    'body','Thank you for contacting OfferPSP. We received your request and have started the initial review.'
      || E'\n\nWe will contact you by email if we need any additional information. No payment provider has been selected or approved at this stage.'
      || E'\n\nBest regards,\nOfferPSP team\nhttps://offerpsp.com'
  );
$$;
revoke all on function private.offerpsp_intake_submission_reply_expected_message()
  from public, anon, authenticated, service_role;

create or replace function public.prepare_offerpsp_intake_submission_reply(p_submission_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  v_submission private.offerpsp_intake_submissions;
  v_reply private.offerpsp_intake_submission_replies;
  v_email_configuration jsonb;
  v_reason text;
begin
  if v_role<>'service_role' then raise exception 'OfferPSP service access required'; end if;
  select * into v_submission from private.offerpsp_intake_submissions
    where id=p_submission_id for update;
  if not found then raise exception 'OfferPSP intake submission not found'; end if;
  select * into v_reply from private.offerpsp_intake_submission_replies
    where submission_id=p_submission_id for update;
  if not found then return jsonb_build_object('outcome','review_required','reason_code','reply_not_queued'); end if;
  if v_reply.status='sent' then
    return jsonb_build_object('outcome','already_sent','submission_id',p_submission_id,
      'lead_id',v_submission.lead_id,'draft_id',v_reply.draft_id,'source_hash',v_reply.source_hash);
  elsif v_reply.status in ('claimed','uncertain','review_required','cancelled') then
    return jsonb_build_object('outcome',v_reply.status,'submission_id',p_submission_id,
      'lead_id',v_submission.lead_id,'reason_code',v_reply.reason_code,
      'draft_id',v_reply.draft_id,'source_hash',v_reply.source_hash);
  end if;

  select i.configuration into v_email_configuration
  from private.offerpsp_integration_settings i
  where i.integration_key='email' and i.enabled;

  if lower(trim(v_submission.submitted_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then v_reason:='invalid_recipient';
  elsif coalesce(v_submission.payload->>'source','')<>'offerpsp.com'
    then v_reason:='source_not_allowlisted';
  elsif coalesce((v_submission.payload->>'consent')::boolean,false) is not true
    then v_reason:='consent_not_recorded';
  elsif v_email_configuration is null
    then v_reason:='email_channel_disabled';
  elsif not exists(
    select 1 from private.offerpsp_integration_settings i
    where i.integration_key='n8n' and i.enabled
      and coalesce((i.configuration->>'operations_enabled')::boolean,false)
  ) then v_reason:='automation_disabled';
  end if;

  if v_reason is not null then
    update private.offerpsp_intake_submission_replies
    set status='review_required',reason_code=v_reason,updated_at=now()
    where submission_id=p_submission_id and status='queued';
    insert into public.offerpsp_lead_activities(
      lead_id,actor_type,activity_type,title,metadata,client_visible
    ) values (
      v_submission.lead_id,'aibot','intake_submission_reply_review_required',
      'Immediate intake acknowledgement needs staff review',
      jsonb_build_object('submission_id',p_submission_id,'reason_code',v_reason,
        'policy','intake-submission-receipt-v1'),false
    );
    return jsonb_build_object('outcome','review_required','submission_id',p_submission_id,
      'lead_id',v_submission.lead_id,'reason_code',v_reason,'source_hash',v_reply.source_hash);
  end if;

  return jsonb_build_object(
    'outcome','ready','submission_id',p_submission_id,'lead_id',v_submission.lead_id,
    'source_hash',v_reply.source_hash,'reply_class','acknowledgement',
    'to_email',lower(trim(v_submission.submitted_email)),
    'missing_information','[]'::jsonb,'disposition',v_submission.disposition,
    'email_configuration',coalesce(v_email_configuration,'{}'::jsonb)
  );
end;
$$;

create or replace function public.block_offerpsp_intake_submission_reply(
  p_submission_id uuid,p_source_hash text,p_reason_code text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row private.offerpsp_intake_submission_replies;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'OfferPSP service access required'; end if;
  if p_reason_code not in ('unknown_missing_fact','missing_fact_list_empty',
      'acknowledgement_has_missing_facts','message_not_built','invalid_recipient',
      'invalid_candidate','invalid_message_size','missing_direct_answer','invalid_signature',
      'restricted_claim','fact_mismatch','unverified_extra_fact')
    then raise exception 'Unsupported validation reason'; end if;
  update private.offerpsp_intake_submission_replies
  set status='review_required',reason_code=p_reason_code,updated_at=now(),
    metadata=metadata||jsonb_build_object('content_validation','failed')
  where submission_id=p_submission_id and source_hash=p_source_hash and status='queued'
  returning * into v_row;
  if not found then return jsonb_build_object('outcome','stale_or_locked'); end if;
  insert into public.offerpsp_lead_activities(
    lead_id,actor_type,activity_type,title,metadata,client_visible
  ) values (
    v_row.lead_id,'aibot','intake_submission_reply_review_required',
    'Immediate intake acknowledgement needs staff review',
    jsonb_build_object('submission_id',p_submission_id,'reason_code',p_reason_code,
      'policy','intake-submission-receipt-v1'),false
  );
  return jsonb_build_object('outcome','review_required','submission_id',p_submission_id,
    'lead_id',v_row.lead_id,'reason_code',p_reason_code,'source_hash',p_source_hash);
end;
$$;

create or replace function public.claim_offerpsp_intake_submission_reply(
  p_submission_id uuid,p_source_hash text,p_reply_class text,p_subject text,p_body text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_candidate jsonb;
  v_expected jsonb;
  v_submission private.offerpsp_intake_submissions;
  v_reply private.offerpsp_intake_submission_replies;
  v_draft public.email_drafts;
  v_attempt uuid:=gen_random_uuid();
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'OfferPSP service access required'; end if;
  v_candidate:=public.prepare_offerpsp_intake_submission_reply(p_submission_id);
  if v_candidate->>'outcome'<>'ready' then return v_candidate; end if;
  if v_candidate->>'source_hash'<>p_source_hash or p_reply_class<>'acknowledgement' then
    return jsonb_build_object('outcome','review_required','reason_code','source_changed');
  end if;
  v_expected:=private.offerpsp_intake_submission_reply_expected_message();
  if trim(p_subject) is distinct from v_expected->>'subject'
      or p_body is distinct from v_expected->>'body' then
    return public.block_offerpsp_intake_submission_reply(
      p_submission_id,p_source_hash,'fact_mismatch');
  end if;
  if nullif(trim(p_subject),'') is null or char_length(trim(p_subject))>120
      or nullif(trim(p_body),'') is null or char_length(p_body)>6000
      or p_body not like 'Thank you for contacting OfferPSP. We received your request%'
      or p_body not like '%Best regards,%OfferPSP team%https://offerpsp.com' then
    return public.block_offerpsp_intake_submission_reply(
      p_submission_id,p_source_hash,'invalid_message_size');
  end if;
  if p_body ~* '\m(guarantee(d)?|approved by|provider accepted|we selected|we matched you|commission|revenue share|our margin|legal advice|contract terms|licen[cs]e verified)\M' then
    return public.block_offerpsp_intake_submission_reply(
      p_submission_id,p_source_hash,'restricted_claim');
  end if;

  select * into v_submission from private.offerpsp_intake_submissions
    where id=p_submission_id for update;
  select * into v_reply from private.offerpsp_intake_submission_replies
    where submission_id=p_submission_id for update;
  if v_reply.status<>'queued' or v_reply.source_hash<>p_source_hash then
    return jsonb_build_object('outcome','stale_or_locked','status',v_reply.status);
  end if;
  insert into public.email_drafts(chat_id,lead_internal_id,to_email,subject,body,status)
  values('autopilot:intake-submission:'||p_submission_id::text,v_submission.lead_id::text,
    lower(trim(v_submission.submitted_email)),trim(p_subject),p_body,'sending')
  returning * into v_draft;
  update public.offerpsp_email_messages
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'delivery_attempt_id',v_attempt,'delivery_attempt_state','claimed',
    'delivery_attempt_started_at',now(),'automation','intake-submission-receipt-v1',
    'reply_class','acknowledgement','source_hash',p_source_hash,
    'submission_id',p_submission_id,'submission_disposition',v_submission.disposition)
  where source_draft_id=v_draft.id;
  update private.offerpsp_intake_submission_replies
  set status='claimed',draft_id=v_draft.id,delivery_attempt_id=v_attempt,
    claimed_at=now(),updated_at=now(),reason_code=null,
    metadata=metadata||jsonb_build_object('content_validation','passed')
  where submission_id=p_submission_id;
  insert into public.offerpsp_lead_activities(
    lead_id,actor_type,activity_type,title,metadata,client_visible
  ) values (
    v_submission.lead_id,'aibot','intake_submission_reply_claimed',
    'Immediate intake acknowledgement delivery started',
    jsonb_build_object('submission_id',p_submission_id,'draft_id',v_draft.id,
      'policy','intake-submission-receipt-v1'),false
  );
  return jsonb_build_object(
    'outcome','claimed','submission_id',p_submission_id,'lead_id',v_submission.lead_id,
    'draft_id',v_draft.id,'attempt_id',v_attempt,'to_email',v_draft.to_email,
    'subject',v_draft.subject,'body',v_draft.body,'lead_internal_id',v_draft.lead_internal_id,
    'email_configuration',coalesce(v_candidate->'email_configuration','{}'::jsonb)
  );
end;
$$;

create or replace function public.complete_offerpsp_intake_submission_reply(
  p_draft_id bigint,p_attempt_id uuid,p_external_message_id text default null,
  p_provider text default 'smtp',p_archive_status text default 'skipped',
  p_archive_error text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_reply private.offerpsp_intake_submission_replies;
  v_draft public.email_drafts;
  v_message public.offerpsp_email_messages;
  v_external text:=nullif(trim(p_external_message_id),'');
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'OfferPSP service access required'; end if;
  if lower(p_provider) not in ('smtp','brevo')
      or lower(p_archive_status) not in ('archived','duplicate','failed','skipped')
    then raise exception 'Unsupported delivery receipt'; end if;
  if v_external is not null and (char_length(v_external)>320
      or v_external !~ '^<[^<>[:space:]@]+@[^<>[:space:]@]+>$')
    then raise exception 'Invalid external Message-ID'; end if;
  select * into v_reply from private.offerpsp_intake_submission_replies
    where draft_id=p_draft_id for update;
  if not found or v_reply.delivery_attempt_id is distinct from p_attempt_id
    then raise exception 'Delivery attempt mismatch'; end if;
  if v_reply.status='sent' then
    return jsonb_build_object('success',true,'outcome','already_sent',
      'submission_id',v_reply.submission_id,'lead_id',v_reply.lead_id,'draft_id',p_draft_id);
  end if;
  if v_reply.status<>'claimed' then raise exception 'Automatic reply is not claimed'; end if;
  select * into v_draft from public.email_drafts where id=p_draft_id for update;
  select * into v_message from public.offerpsp_email_messages
    where source_draft_id=p_draft_id for update;
  if v_draft.id is null or v_message.id is null
      or nullif(v_message.metadata->>'delivery_attempt_id','') is distinct from p_attempt_id::text
    then raise exception 'Canonical email journal mismatch'; end if;
  update public.email_drafts set status='sent' where id=p_draft_id;
  update public.offerpsp_email_messages
  set external_message_id=coalesce(v_external,external_message_id),provider=lower(p_provider),
    delivery_status='sent',sent_at=coalesce(sent_at,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
      'sent_archive_status',lower(p_archive_status),
      'sent_archive_error',left(nullif(trim(p_archive_error),''),2000),
      'delivery_attempt_state','accepted','delivery_receipt_recorded_at',now()))
  where id=v_message.id;
  update private.offerpsp_intake_submission_replies
  set status='sent',sent_at=now(),updated_at=now(),reason_code=null
  where submission_id=v_reply.submission_id;
  update public.offerpsp_tasks
  set status='done',completed_at=coalesce(completed_at,now()),updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'automation_completed_by','intake-submission-receipt-v1','draft_id',p_draft_id)
  where lead_id=v_reply.lead_id
    and automation_ref in ('intake_response_v1','intake_submission:'||v_reply.submission_id::text)
    and status in ('pending','in_progress');
  insert into public.offerpsp_lead_activities(
    lead_id,actor_type,activity_type,title,metadata,client_visible
  ) values (
    v_reply.lead_id,'aibot','intake_submission_reply_sent',
    'Immediate intake acknowledgement sent',
    jsonb_build_object('submission_id',v_reply.submission_id,'draft_id',p_draft_id,
      'message_id',v_message.id,'sent_archive_status',lower(p_archive_status),
      'policy','intake-submission-receipt-v1'),false
  );
  return jsonb_build_object('success',true,'outcome','sent',
    'submission_id',v_reply.submission_id,'lead_id',v_reply.lead_id,
    'draft_id',p_draft_id,'message_id',v_message.id,'external_message_id',v_external,
    'sent_archive_status',lower(p_archive_status));
end;
$$;

create or replace function public.mark_offerpsp_intake_submission_reply_uncertain(
  p_draft_id bigint,p_attempt_id uuid,p_error text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_reply private.offerpsp_intake_submission_replies;
  v_message public.offerpsp_email_messages;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'OfferPSP service access required'; end if;
  select * into v_reply from private.offerpsp_intake_submission_replies
    where draft_id=p_draft_id for update;
  if not found or v_reply.delivery_attempt_id is distinct from p_attempt_id
    then raise exception 'Delivery attempt mismatch'; end if;
  if v_reply.status='sent' then
    return jsonb_build_object('success',true,'outcome','sent',
      'submission_id',v_reply.submission_id,'lead_id',v_reply.lead_id);
  end if;
  select * into v_message from public.offerpsp_email_messages
    where source_draft_id=p_draft_id for update;
  if v_message.id is null
      or nullif(v_message.metadata->>'delivery_attempt_id','') is distinct from p_attempt_id::text
    then raise exception 'Canonical email journal mismatch'; end if;
  update public.offerpsp_email_messages
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'delivery_attempt_state','uncertain',
    'delivery_attempt_error',left(nullif(trim(p_error),''),2000),
    'delivery_attempt_updated_at',now()))
  where id=v_message.id;
  if v_reply.status<>'uncertain' then
    update private.offerpsp_intake_submission_replies
    set status='uncertain',reason_code='delivery_uncertain',updated_at=now()
    where submission_id=v_reply.submission_id;
    insert into public.offerpsp_lead_activities(
      lead_id,actor_type,activity_type,title,metadata,client_visible
    ) values (
      v_reply.lead_id,'aibot','intake_submission_reply_uncertain',
      'Immediate intake acknowledgement delivery is uncertain',
      jsonb_build_object('submission_id',v_reply.submission_id,'draft_id',p_draft_id,
        'reason_code','delivery_uncertain','policy','intake-submission-receipt-v1'),false
    );
  end if;
  return jsonb_build_object('success',true,'outcome','uncertain',
    'submission_id',v_reply.submission_id,'lead_id',v_reply.lead_id,'draft_id',p_draft_id);
end;
$$;

create or replace function public.claim_offerpsp_pending_intake_submission_reply()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_reply private.offerpsp_intake_submission_replies;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'OfferPSP service access required'; end if;
  select * into v_reply from private.offerpsp_intake_submission_replies
  where status='queued'
    and coalesce((metadata->>'recovery_claimed_at')::timestamptz,'-infinity')<now()-interval '10 minutes'
  order by created_at for update skip locked limit 1;
  if not found then return jsonb_build_object('outcome','empty'); end if;
  update private.offerpsp_intake_submission_replies
  set updated_at=now(),metadata=metadata||jsonb_build_object('recovery_claimed_at',now())
  where submission_id=v_reply.submission_id;
  return jsonb_build_object('outcome','claimed','submission_id',v_reply.submission_id,
    'lead_id',v_reply.lead_id);
end;
$$;

-- New intake submissions use the per-submission lane. Keep the old trigger only
-- for legacy leads that predate durable submissions.
create or replace function private.offerpsp_enqueue_intake_auto_reply()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_hash text;
begin
  if exists(select 1 from private.offerpsp_intake_submissions s where s.lead_id=new.lead_id)
    then return new;
  end if;
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

revoke all on function public.prepare_offerpsp_intake_submission_reply(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.block_offerpsp_intake_submission_reply(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.claim_offerpsp_intake_submission_reply(uuid,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.complete_offerpsp_intake_submission_reply(bigint,uuid,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.mark_offerpsp_intake_submission_reply_uncertain(bigint,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.claim_offerpsp_pending_intake_submission_reply()
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_offerpsp_intake_submission_reply(uuid) to service_role;
grant execute on function public.block_offerpsp_intake_submission_reply(uuid,text,text) to service_role;
grant execute on function public.claim_offerpsp_intake_submission_reply(uuid,text,text,text,text) to service_role;
grant execute on function public.complete_offerpsp_intake_submission_reply(bigint,uuid,text,text,text,text) to service_role;
grant execute on function public.mark_offerpsp_intake_submission_reply_uncertain(bigint,uuid,text) to service_role;
grant execute on function public.claim_offerpsp_pending_intake_submission_reply() to service_role;

-- Staff and Telegram must show the latest submitted contact's delivery, not an
-- old company-level reply belonging to the first manager.
create or replace function public.get_offerpsp_intake_observability(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_lead public.offerpsp_leads;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() or not exists (
    select 1 from public.offerpsp_staff_members s where s.user_id=auth.uid() and s.active
  ) then raise exception 'Active staff access required' using errcode='42501'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id;
  if not found then raise exception 'Intake not found' using errcode='P0002'; end if;
  return jsonb_build_object(
    'observed_at',now(),
    'lead',jsonb_build_object('id',v_lead.lead_id,'company',v_lead.company,'status',v_lead.status,
      'record_state',v_lead.record_state,'source',v_lead.source,'submitted_at',v_lead.submitted_at,
      'workspace_linked',v_lead.client_user_id is not null or v_lead.merchant_organization_id is not null),
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
    'auto_reply',coalesce(
      (select jsonb_build_object('submission_id',r.submission_id,'status',r.status,
        'reply_class',r.reply_class,'reason_code',r.reason_code,'draft_id',r.draft_id,
        'created_at',r.created_at,'updated_at',r.updated_at,'claimed_at',r.claimed_at,'sent_at',r.sent_at)
       from private.offerpsp_intake_submission_replies r
       where r.lead_id=p_lead_id order by r.created_at desc limit 1),
      (select jsonb_build_object('status',r.status,'reply_class',r.reply_class,
        'reason_code',r.reason_code,'draft_id',r.draft_id,'created_at',r.created_at,
        'updated_at',r.updated_at,'claimed_at',r.claimed_at,'sent_at',r.sent_at)
       from private.offerpsp_intake_auto_replies r where r.lead_id=p_lead_id)
    ),
    'actions',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'at',a.consumed_at,
      'outcome',a.receipt->>'outcome','message',a.receipt->>'message','error_code',a.receipt->>'error_code') order by a.consumed_at desc)
      from private.offerpsp_telegram_intake_actions a where a.lead_id=p_lead_id and a.consumed_at is not null),'[]'::jsonb),
    'match_count',(select count(*) from private.offerpsp_route_matches m where m.lead_id=p_lead_id),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from (
      select a.id,a.created_at,a.actor_type,a.activity_type,a.title,
        case when a.activity_type='telegram_intake_action' then a.metadata->'receipt'->>'message'
          when a.activity_type like 'intake%reply_%' then a.metadata->>'reason_code' else null end as detail,
        case when a.activity_type='telegram_intake_action' then a.metadata->'receipt'->>'outcome'
          when a.activity_type in ('intake_auto_reply_sent','intake_submission_reply_sent') then 'sent'
          when a.activity_type in ('intake_auto_reply_uncertain','intake_submission_reply_uncertain') then 'uncertain'
          when a.activity_type in ('intake_auto_reply_review_required','intake_submission_reply_review_required') then 'review_required'
          else null end as outcome
      from public.offerpsp_lead_activities a where a.lead_id=p_lead_id
      order by a.created_at desc,a.id desc limit 100) e),'[]'::jsonb),
    'event_count',(select count(*) from public.offerpsp_lead_activities a where a.lead_id=p_lead_id)
  );
end;
$$;
revoke all on function public.get_offerpsp_intake_observability(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_offerpsp_intake_observability(uuid) to authenticated;

create or replace function public.prepare_offerpsp_telegram_intake_card(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_lead public.offerpsp_leads;
  v_task public.offerpsp_tasks;
  v_operator private.offerpsp_telegram_operators;
  v_case private.offerpsp_compliance_cases;
  v_submission private.offerpsp_intake_submissions;
  v_task_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Transport service access required'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id for update;
  if not found or v_lead.record_state<>'active' or v_lead.status in ('closed','spam','won','lost') then
    return jsonb_build_object('outcome','inactive'); end if;
  v_task_id:=private.offerpsp_ensure_intake_task(p_lead_id);
  select * into v_task from public.offerpsp_tasks where id=v_task_id;
  select o.* into v_operator from private.offerpsp_telegram_operators o
    join public.offerpsp_staff_members s on s.user_id=o.staff_user_id and s.active
    join private.offerpsp_integration_settings i on i.integration_key='telegram' and i.enabled
      and coalesce((i.configuration->>'lead_notifications')::boolean,false)
    where o.enabled and (s.role='owner' or s.user_id=v_lead.assigned_to)
    order by (o.staff_user_id=v_task.assigned_to) desc nulls last,o.telegram_user_id limit 1;
  if not found then return jsonb_build_object('outcome','operator_unconfigured'); end if;
  update private.offerpsp_telegram_intake_actions set active=false
    where lead_id=p_lead_id and staff_user_id=v_operator.staff_user_id and active
      and (receipt is not null or consumed_at is not null or expires_at<=now());
  insert into private.offerpsp_telegram_intake_actions(lead_id,staff_user_id,chat_id,action)
    select p_lead_id,v_operator.staff_user_id,v_operator.chat_id,a
    from unnest(array['screen','matching','missing_draft','reply_draft','remind']) a
    on conflict(lead_id,staff_user_id,action) where active do nothing;
  select * into v_case from private.offerpsp_compliance_cases where lead_id=p_lead_id;
  select * into v_submission from private.offerpsp_intake_submissions
    where lead_id=p_lead_id order by created_at desc limit 1;
  return jsonb_build_object('outcome','ready','chat_id',v_operator.chat_id,
    'lead',jsonb_build_object('id',p_lead_id,'company',v_lead.company,'contact',v_lead.name,
      'domain',v_lead.company_url,'vertical',v_lead.vertical,'geos',v_lead.geos,'volume',v_lead.monthly_volume),
    'latest_submission',case when v_submission.id is null then null else jsonb_build_object(
      'id',v_submission.id,'name',v_submission.submitted_name,'email',v_submission.submitted_email,
      'company',v_submission.submitted_company,'disposition',v_submission.disposition,
      'match_strategy',v_submission.match_strategy,'created_at',v_submission.created_at) end,
    'screening',jsonb_build_object('status',v_case.case_status,'completeness',v_case.completeness_score,
      'missing',v_case.missing_information,'risk',v_case.risk_level,'red_flags',v_case.red_flags,
      'yellow_flags',v_case.yellow_flags,'screened_at',v_case.last_screened_at),
    'possible_duplicates',(select count(*) from public.offerpsp_leads l where l.lead_id<>p_lead_id
      and l.record_state='active' and l.status<>'spam' and
      (lower(trim(l.work_email))=lower(trim(v_lead.work_email)) or
       (nullif(trim(v_lead.company_url),'') is not null and
        private.offerpsp_normalize_domain(l.company_url)=private.offerpsp_normalize_domain(v_lead.company_url)))),
    'workspace_ready',v_lead.client_user_id is not null or v_lead.merchant_organization_id is not null,
    'match_count',(select count(*) from private.offerpsp_route_matches m where m.lead_id=p_lead_id),
    'task',jsonb_build_object('id',v_task.id,'status',v_task.status,'due_at',v_task.due_at),
    'auto_reply',coalesce(
      (select jsonb_build_object('submission_id',r.submission_id,'status',r.status,
        'reply_class',r.reply_class,'reason_code',r.reason_code,'sent_at',r.sent_at,'updated_at',r.updated_at)
       from private.offerpsp_intake_submission_replies r
       where r.lead_id=p_lead_id order by r.created_at desc limit 1),
      (select jsonb_build_object('status',r.status,'reply_class',r.reply_class,
        'reason_code',r.reason_code,'sent_at',r.sent_at,'updated_at',r.updated_at)
       from private.offerpsp_intake_auto_replies r where r.lead_id=p_lead_id),
      jsonb_build_object('status','waiting')
    ),
    'actions',(select jsonb_object_agg(a.action,a.token) from private.offerpsp_telegram_intake_actions a
      where a.lead_id=p_lead_id and a.staff_user_id=v_operator.staff_user_id
        and a.active and a.receipt is null and a.consumed_at is null and a.expires_at>now()));
end;
$$;
revoke all on function public.prepare_offerpsp_telegram_intake_card(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_offerpsp_telegram_intake_card(uuid) to service_role;

create or replace view private.offerpsp_stuck_intake_candidates as
with classified as (
  select l.lead_id,
    coalesce(nullif(l.company,''),nullif(l.name,''),l.work_email,'Merchant') as company,
    l.status as lead_status,
    case
      when coalesce(sr.status,lr.status)='queued'
        and coalesce(sr.updated_at,lr.updated_at)<=now()-interval '20 minutes' then 'auto_reply_queued'
      when coalesce(sr.status,lr.status)='claimed'
        and coalesce(sr.claimed_at,lr.claimed_at,sr.updated_at,lr.updated_at)<=now()-interval '15 minutes' then 'auto_reply_claimed'
      when coalesce(sr.status,lr.status) in ('review_required','uncertain')
        and coalesce(sr.updated_at,lr.updated_at)<=now()-interval '30 minutes' then 'operator_review'
      when t.status in ('pending','in_progress') and t.due_at<now() then 'task_overdue'
      else null end as alert_kind,
    case
      when coalesce(sr.status,lr.status) in ('queued','claimed','review_required','uncertain')
        then coalesce(sr.reason_code,lr.reason_code,sr.status,lr.status)
      when t.status in ('pending','in_progress') and t.due_at<now() then 'intake_response_overdue'
      else null end as reason_code,
    case
      when coalesce(sr.status,lr.status)='queued' then coalesce(sr.updated_at,lr.updated_at)
      when coalesce(sr.status,lr.status)='claimed' then coalesce(sr.claimed_at,lr.claimed_at,sr.updated_at,lr.updated_at)
      when coalesce(sr.status,lr.status) in ('review_required','uncertain') then coalesce(sr.updated_at,lr.updated_at)
      else t.due_at end as detected_at,
    case when coalesce(sr.status,lr.status) in ('queued','claimed') then 1
      when coalesce(sr.status,lr.status) in ('review_required','uncertain') then 2 else 3 end as priority_rank,
    coalesce(sr.status,lr.status) as auto_reply_status,t.status as task_status,t.due_at
  from public.offerpsp_leads l
  left join lateral (
    select r.status,r.reason_code,r.updated_at,r.claimed_at
    from private.offerpsp_intake_submission_replies r where r.lead_id=l.lead_id
    order by r.created_at desc limit 1
  ) sr on true
  left join private.offerpsp_intake_auto_replies lr on lr.lead_id=l.lead_id and sr.status is null
  left join public.offerpsp_tasks t on t.lead_id=l.lead_id and t.automation_ref='intake_response_v1'
  where l.record_state='active' and l.status not in ('closed','spam','won','lost')
    and coalesce(l.source,'')<>'internal_release_canary'
), candidates as (
  select *,md5(concat_ws('|',lead_id::text,alert_kind,reason_code,
    coalesce(auto_reply_status,''),coalesce(task_status,''),coalesce(due_at::text,''))) as state_hash
  from classified where alert_kind is not null
)
select * from candidates;
revoke all on private.offerpsp_stuck_intake_candidates
  from public,anon,authenticated,service_role;
