-- The screening recorder first changes case_status and the fenced completion
-- writes its run/result receipt in the following statement. Queue email only
-- after that receipt exists, never from the intermediate manual-review row.
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
