-- Sending a per-submission acknowledgement confirms only email delivery.
-- It must not close the separate staff task that verifies a new contact's
-- relationship to an existing company card.

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
    and automation_ref='intake_response_v1'
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

revoke all on function public.complete_offerpsp_intake_submission_reply(bigint,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_offerpsp_intake_submission_reply(bigint,uuid,text,text,text,text)
  to service_role;
